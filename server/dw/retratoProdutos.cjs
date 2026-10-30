/**
 * Retrato "No DW agora" (1.7.0): quais produtos cada CNPJ tem marcados no
 * `parametro_bi` do DW_PLATAFORMA. Só MOSTRA na ficha — nunca altera o
 * cadastro (sincronizar produto automaticamente está fora de escopo, spec §5).
 *
 * Grava em `DATA_DIR/dw-produtos.json` (OneDrive) de propósito: só a máquina
 * servidora tem credencial do DW; as máquinas client leem o arquivo.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config.cjs');

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

/** `porCnpj`: CNPJ (só dígitos) → produtos marcados com 'S'. CNPJ repetido
 *  no DW soma as marcações (qualquer linha marcada = marcado). */
function montarRetrato(linhas, geradoEm) {
  const porCnpj = {};
  for (const linha of linhas) {
    const cnpj = String(linha.cnpj || '').replace(/\D/g, '');
    if (!cnpj) continue;
    const marcados = new Set(porCnpj[cnpj] || []);
    for (const [coluna, produto] of Object.entries(COLUNAS)) {
      if (String(linha[coluna] ?? '').trim().toUpperCase() === 'S') marcados.add(produto);
    }
    porCnpj[cnpj] = Object.values(COLUNAS).filter((p) => marcados.has(p));
  }
  return { geradoEm, porCnpj };
}

/** Lê o DW e grava o retrato (tmp+rename: o arquivo mora no OneDrive). */
async function gerarRetrato({ buscar, agora = new Date().toISOString() } = {}) {
  const buscarLinhas = buscar || require('./dwPlataforma.cjs').buscarProdutosParametroBi;
  const retrato = montarRetrato(await buscarLinhas(), agora);
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
