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
 *  1. NUNCA vincula CNPJ novo sozinha — só atualiza quem já tem `loginPrice`.
 *     Cliente sem CNPJ continua exigindo o mesmo processo manual (achar a
 *     loja certa no DW, decidir qual login usar num grupo).
 *  2. NUNCA mexe em `servicos` (não liga/desliga "Precificação" sozinha) —
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

const repo = repoPlanilha();

// Confirmado manualmente (ver auditoria) — só o que está aqui é aplicado;
// qualquer outro valor do DW (vazio, "Auto Center", "Tecnologia", "atacado",
// "moto"...) é ignorado de propósito, não adivinhado.
const MAPA_SEGMENTO = { 'auto peças': 'Autopeça' };
const MAPA_LINHA = { linha_leve: 'Leve', linha_pesada: 'Pesada' };

function normalizar(s) {
  return (s || '').toLowerCase().trim();
}

async function sincronizarPriceDoDW() {
  if (!DW_PLATAFORMA_CONFIGURADO) return { rodou: false, motivo: 'DW_PLATAFORMA não configurado nesta máquina.' };

  const clientes = repo.get('Clientes');
  const comCnpj = clientes
    .map((c) => ({ cliente: c, cnpjDigitos: (c.loginPrice || '').replace(/\D/g, '') }))
    .filter((x) => x.cnpjDigitos.length === 14);

  if (comCnpj.length === 0) return { rodou: true, atualizados: 0, semCorrespondencia: 0 };

  const cnpjsUnicos = [...new Set(comCnpj.map((x) => x.cnpjDigitos))];
  const dadosPorCnpj = await buscarDadosPrice(cnpjsUnicos);

  let atualizados = 0;
  let semCorrespondencia = 0;

  for (const { cliente, cnpjDigitos } of comCnpj) {
    const dados = dadosPorCnpj.get(cnpjDigitos);
    if (!dados) {
      semCorrespondencia++;
      continue;
    }

    const patch = {};

    if (dados.senha) patch.senhaPriceCifrada = cifrar(dados.senha);

    if (!cliente.local) {
      const mapeado = MAPA_SEGMENTO[normalizar(dados.segmento)];
      if (mapeado) patch.local = mapeado;
    }
    if (!cliente.linha) {
      const mapeado = MAPA_LINHA[normalizar(dados.segmentoHarmonizacao)];
      if (mapeado) patch.linha = mapeado;
    }

    if (Object.keys(patch).length > 0) {
      repo.update('Clientes', cliente.id, patch);
      atualizados++;
    }
  }

  return { rodou: true, atualizados, semCorrespondencia };
}

module.exports = { sincronizarPriceDoDW };
