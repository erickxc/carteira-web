/**
 * Retrato "No DW agora" (1.7.0): quais produtos cada CNPJ tem marcados no
 * `parametro_bi` do DW_PLATAFORMA. Só MOSTRA na ficha — nunca altera o
 * cadastro (sincronizar produto automaticamente está fora de escopo, spec §5).
 *
 * Mesmo retrato leva os dados fiscais de cada CNPJ (certificado, contato, grupo
 * fiscal, Apura, situação na Receita), ao lado dos produtos: um arquivo e uma
 * rotina só. Fora da tabela `Clientes` porque o DW/Receita seguem sendo a fonte.
 *
 * Grava em `DATA_DIR/dw-produtos.json` (OneDrive) de propósito: só a máquina
 * servidora tem credencial do DW; as máquinas client leem o arquivo.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config.cjs');
const { listaJSON } = require('../../shared/cadenciaServico.cjs');

const ARQUIVO = path.join(DATA_DIR, 'dw-produtos.json');

// Coluna do `parametro_bi` → nome oficial do produto (shared/produtos.cjs).
// Protocolo GPS e Raptor não existem no DW.
const COLUNAS = {
  monitoria: 'Plataforma 2D',
  controladoria: 'Controladoria',
  apura: 'Apura',
  alcance: '2D Alcance',
  nexus: '2D Nexus',
  optimarco: 'OptiMarco',
  precificar: '2D Price',
};

const digitos = (v) => String(v || '').replace(/\D/g, '');

/**
 * `porCnpj`: CNPJ (só dígitos) → produtos marcados com 'S' + dados fiscais.
 * CNPJ repetido no DW soma as marcações (qualquer linha marcada = marcado).
 * `produtos` só existe pra CNPJ do `parametro_bi`: loja que só aparece em
 * `empresas` não pode virar "não marcado no DW" na ficha.
 * Receita: a nova vence; `null` (consulta falhou) mantém a anterior.
 */
function montarRetrato(linhas, geradoEm, { fiscais = {}, receitaAnterior = {}, receitaNova = {} } = {}) {
  const { empresas = [], grupos = [], apura = [] } = fiscais;
  const porCnpj = {};
  const entradaDe = (bruto) => {
    const cnpj = digitos(bruto);
    if (!cnpj) return null;
    porCnpj[cnpj] = porCnpj[cnpj] || {};
    return porCnpj[cnpj];
  };

  for (const linha of linhas) {
    const entrada = entradaDe(linha.cnpj);
    if (!entrada) continue;
    const marcados = new Set(entrada.produtos || []);
    for (const [coluna, produto] of Object.entries(COLUNAS)) {
      if (String(linha[coluna] ?? '').trim().toUpperCase() === 'S') marcados.add(produto);
    }
    entrada.produtos = Object.values(COLUNAS).filter((p) => marcados.has(p));
  }

  for (const empresa of empresas) {
    const entrada = entradaDe(empresa.cnpj);
    if (!entrada) continue;
    entrada.certificadoValidade = empresa.certificado_validade || null;
    entrada.telefone = empresa.telefone || null;
    entrada.email = empresa.email || null;
  }

  for (const usuario of apura) {
    if (!usuario.ativo) continue;
    const entrada = entradaDe(usuario.cnpj);
    if (!entrada) continue;
    const anterior = entrada.apura || { usuarios: 0, ultimoAcesso: null };
    const login = usuario.ultimo_login_em ? new Date(usuario.ultimo_login_em).toISOString() : null;
    entrada.apura = {
      usuarios: anterior.usuarios + 1,
      ultimoAcesso: login && (!anterior.ultimoAcesso || login > anterior.ultimoAcesso) ? login : anterior.ultimoAcesso,
    };
  }

  for (const [cnpj, receita] of Object.entries(receitaAnterior)) entradaDe(cnpj).receita = receita;
  for (const [cnpj, receita] of Object.entries(receitaNova)) {
    if (receita) entradaDe(cnpj).receita = receita;
  }

  // Grupo fiscal é da raiz do CNPJ (8 dígitos): vale pra toda filial.
  const grupoPorRaiz = new Map(grupos.filter((g) => g.ativo).map((g) => [digitos(g.raiz_cnpj), { codigo: g.codigo, nome: g.nome }]));
  for (const [cnpj, entrada] of Object.entries(porCnpj)) {
    const grupo = grupoPorRaiz.get(cnpj.slice(0, 8));
    if (grupo) entrada.grupoFiscal = grupo;
  }

  return { geradoEm, porCnpj };
}

/** Situação já gravada. Arquivo ilegível não pode travar a rotina que o
 *  reescreveria: perde só a Receita até a próxima consulta semanal. */
function receitaGravada() {
  try {
    const anterior = lerRetrato();
    return Object.fromEntries(Object.entries(anterior?.porCnpj || {})
      .filter(([, entrada]) => entrada.receita)
      .map(([cnpj, entrada]) => [cnpj, entrada.receita]));
  } catch (err) {
    console.warn('Retrato anterior ilegível, situação da Receita recomeça:', err.message);
    return {};
  }
}

/** Situação na Receita das lojas do cadastro, uma por vez (a BrasilAPI limita). */
async function consultarLojas(consultarReceita, repo, pausaMs, agora) {
  const cnpjs = new Set(repo.get('Clientes')
    .flatMap((c) => listaJSON(c.lojasCadastro))
    .map((l) => digitos(l?.cnpj))
    .filter((c) => c.length === 14));
  const resultado = {};
  let primeira = true;
  for (const cnpj of cnpjs) {
    if (!primeira) await new Promise((resolve) => { setTimeout(resolve, pausaMs); });
    primeira = false;
    const situacao = await consultarReceita(cnpj);
    resultado[cnpj] = situacao && { ...situacao, consultadoEm: agora };
  }
  return resultado;
}

/**
 * Lê o DW e grava o retrato (tmp+rename: o arquivo mora no OneDrive). A Receita
 * é semanal: só com `consultarReceita` (função de `receitaCnpj.cjs`); sem ela,
 * a situação já gravada segue como está.
 */
async function gerarRetrato({ buscar, buscarFiscais, consultarReceita, repo, pausaMs = 700, agora = new Date().toISOString() } = {}) {
  const buscarLinhas = buscar || require('./dwPlataforma.cjs').buscarProdutosParametroBi;
  const lerFiscais = buscarFiscais || require('./dwPlataforma.cjs').buscarDadosFiscaisLojas;
  const [linhas, fiscais] = await Promise.all([buscarLinhas(), lerFiscais()]);
  const receitaNova = consultarReceita
    ? await consultarLojas(consultarReceita, repo || require('../dominio/repo.cjs').repoPlanilha(), pausaMs, agora)
    : {};
  const retrato = montarRetrato(linhas, agora, { fiscais, receitaAnterior: receitaGravada(), receitaNova });
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  const tmp = `${ARQUIVO}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(retrato));
  fs.renameSync(tmp, ARQUIVO);
  return retrato;
}

/** Retrato gravado, ou `null` se ainda não existe (DW nunca lido). */
function lerRetrato() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

module.exports = { gerarRetrato, lerRetrato, montarRetrato, COLUNAS, ARQUIVO };
