/**
 * Sincronização periódica (só na máquina SERVIDORA): refresca login/senha do
 * Price e enriquece Segmento/Linha a partir do `DW_PLATAFORMA` (outro
 * sistema, produção — ver `dwPlataforma.cjs`), pros clientes que a Carteira
 * JÁ TEM vinculados (`loginPrice` preenchido).
 *
 * Escopo deliberadamente limitado — decidido depois de uma auditoria manual
 * (ver conversa/commit desta feature) que revelou casos ambíguos reais
 * (grupo com várias lojas, CNPJ compartilhado entre empresas por engano,
 * login existente mas de outra empresa): tudo isso exige julgamento humano.
 * Por isso esta função:
 *
 *  1. NUNCA vincula CNPJ novo sozinha — só atualiza quem já tem login do
 *     Price (item 2D Price de `produtos`, ou `loginPrice` sem esse item).
 *     Cliente sem CNPJ continua exigindo o mesmo processo manual (achar a
 *     loja certa no DW, decidir qual login usar num grupo).
 *  2. NUNCA mexe em `servicos`/`produtos` (não cria o 2D Price nem muda fase) —
 *     isso é controle interno da monitoria, decisão do time, não do DW.
 *  3. Só preenche `local`/`linha` quando VAZIOS na Carteira — nunca
 *     sobrescreve um valor já preenchido manualmente, mesmo que divirja do
 *     DW (pode ter sido corrigido de propósito).
 *  4. Só mapeia os valores do DW que têm correspondência clara e confirmada
 *     (`MAPA_SEGMENTO`/`MAPA_LINHA` abaixo) — o resto (vazio, ou valor sem
 *     correspondente hoje nas categorias da Carteira) fica de fora, sem
 *     adivinhar.
 *  5. SOMENTE LEITURA no DW (ver `dwPlataforma.cjs`) — nunca escreve lá.
 */
const { repoPlanilha } = require('../dominio/repo.cjs');
const { cifrar } = require('../crypto.cjs');
const { DW_PLATAFORMA_CONFIGURADO } = require('../config.cjs');
const { buscarDadosPrice } = require('./dwPlataforma.cjs');
const { syncClienteColumns } = require('../db.cjs');
const { listaJSON, eh2DPrice } = require('../../shared/cadenciaServico.cjs');
const { comNomesDaCategoria } = require('../../shared/produtos.cjs');

const repoPadrao = repoPlanilha();

// Confirmado manualmente (ver auditoria) — só o que está aqui é aplicado;
// qualquer outro valor do DW (vazio, "Auto Center", "Tecnologia", "atacado",
// "moto"...) é ignorado de propósito, não adivinhado.
const MAPA_SEGMENTO = { 'auto peças': 'Autopeça' };
const MAPA_LINHA = { linha_leve: 'Leve', linha_pesada: 'Pesada' };

function normalizar(s) {
  return (s || '').toLowerCase().trim();
}

/**
 * Produtos (1.7): com `produtos` gravado, o login/senha do Price moram no item
 * 2D Price e `loginPrice`/`senhaPriceCifrada` são derivados dele em
 * `syncClienteColumns` — gravar só no campo legado seria desfeito pela próxima
 * derivação. Sem item 2D Price (loja irmã com o login do grupo) ou sem
 * `produtos` (cliente não migrado), o campo legado continua sendo a fonte.
 */
function itemPrice(cliente) {
  if (cliente.produtos == null || cliente.produtos === '') return null;
  return listaJSON(cliente.produtos).find((p) => p && eh2DPrice(p.produto)) || null;
}

function cnpjDe(cliente) {
  const price = itemPrice(cliente);
  return ((price && price.login) || cliente.loginPrice || '').replace(/\D/g, '');
}

/**
 * Troca só a senha — nunca cria produto nem muda fase (regra 2). Se o login
 * mudou desde a consulta, não grava a senha de outro CNPJ. Item 2D Price sem
 * login (CNPJ veio do `loginPrice`) recebe esse login: a derivação faz
 * `loginPrice = item.login`, e sem isso o CNPJ sumiria do cliente.
 */
function comSenhaPrice(row, senhaCifrada, cnpjDigitos) {
  if (!senhaCifrada || cnpjDe(row) !== cnpjDigitos) return row;
  if (!itemPrice(row)) return { ...row, senhaPriceCifrada: senhaCifrada };
  return {
    ...row,
    produtos: listaJSON(row.produtos).map((p) => (p && eh2DPrice(p.produto)
      ? { ...p, senhaCifrada, login: p.login || row.loginPrice }
      : p)),
  };
}

/** `deps` só existe pra teste (repo em memória, DW falso). */
async function sincronizarPriceDoDW(deps = {}) {
  const repo = deps.repo || repoPadrao;
  const buscar = deps.buscarDadosPrice || buscarDadosPrice;
  const configurado = deps.configurado ?? DW_PLATAFORMA_CONFIGURADO;
  if (!configurado) return { rodou: false, motivo: 'DW_PLATAFORMA não configurado nesta máquina.' };

  const clientes = repo.get('Clientes');
  const comCnpj = clientes
    .map((c) => ({ cliente: c, cnpjDigitos: cnpjDe(c) }))
    .filter((x) => x.cnpjDigitos.length === 14);

  if (comCnpj.length === 0) return { rodou: true, atualizados: 0, semCorrespondencia: 0 };

  const cnpjsUnicos = [...new Set(comCnpj.map((x) => x.cnpjDigitos))];
  const dadosPorCnpj = await buscar(cnpjsUnicos);

  let atualizados = 0;
  let semCorrespondencia = 0;
  const categorias = repo.get('Categorias').filter((c) => c.tipo === 'servico').map((c) => c.valor);

  for (const { cliente, cnpjDigitos } of comCnpj) {
    const dados = dadosPorCnpj.get(cnpjDigitos);
    if (!dados) {
      semCorrespondencia++;
      continue;
    }

    const patch = {};
    if (!cliente.local) {
      const mapeado = MAPA_SEGMENTO[normalizar(dados.segmento)];
      if (mapeado) patch.local = mapeado;
    }
    if (!cliente.linha) {
      const mapeado = MAPA_LINHA[normalizar(dados.segmentoHarmonizacao)];
      if (mapeado) patch.linha = mapeado;
    }
    const senhaCifrada = dados.senha ? cifrar(dados.senha) : null;
    if (!senhaCifrada && Object.keys(patch).length === 0) continue;

    // Aplica sobre a linha ATUAL do banco (o transform recebe a linha relida),
    // não sobre `cliente`, lido antes do `await` ao DW: gravar `produtos` da
    // leitura antiga desfaria fase/login alterados nesse meio-tempo (fila).
    repo.update('Clientes', cliente.id, patch, (row) => comNomesDaCategoria(syncClienteColumns(comSenhaPrice(row, senhaCifrada, cnpjDigitos)), categorias));
    atualizados++;
  }

  return { rodou: true, atualizados, semCorrespondencia };
}

module.exports = { sincronizarPriceDoDW };
