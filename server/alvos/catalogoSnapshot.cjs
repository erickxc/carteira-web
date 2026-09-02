const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config.cjs');

/**
 * Espelho PERSISTIDO do catálogo (produtos e clientes finais) de cada cliente
 * da carteira — só para SUGESTÃO de nome no formulário de reunião.
 *
 * Por que existe, sendo dado derivado: o catálogo real sai do xlsx de Dados
 * Alvos, cuja leitura custa até ~20s e vive num cache por máquina
 * (LOCALAPPDATA, `cache.cjs`). Com cache frio o formulário ficava SEM sugestão
 * nenhuma e o monitor voltava a digitar às cegas — decisão do usuário: "ele não
 * pode perder os clientes". Aqui o espelho fica no OneDrive (`DATA_DIR`), então
 * sobrevive a limpeza de cache e vale para todas as máquinas.
 *
 * Limite deliberado: **isto NUNCA alimenta cálculo/métrica** — só o
 * autocomplete. Todo número continua vindo do agregado real (`cache.cjs` /
 * `leitor.cjs`), pra não criar a "segunda verdade que envelhece sozinha" que o
 * resto do módulo evita de propósito.
 */

const ARQUIVO = process.env.ALVOS_CATALOGO_PATH || path.join(DATA_DIR, 'alvos-catalogo.json');

function carregar(caminho = ARQUIVO) {
  try {
    const dado = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return dado && typeof dado === 'object' ? dado : {};
  } catch {
    return {};
  }
}

/**
 * Grava o espelho de UM cliente. Leitura vazia NÃO sobrescreve um espelho bom:
 * é exatamente o caso "cache frio / arquivo indisponível", e apagar a lista aí
 * seria perder os nomes justamente quando eles são mais necessários.
 */
function salvar(clientId, { produtos = [], clientes = [] } = {}, opts = {}) {
  const caminho = opts.caminho || ARQUIVO;
  if (produtos.length === 0 && clientes.length === 0) return carregar(caminho);

  const tudo = carregar(caminho);
  const novo = {
    ...tudo,
    [String(clientId)]: {
      produtos,
      clientes,
      // Data vem de fora: `new Date()` aqui tornaria o teste dependente do dia.
      atualizadoEm: opts.atualizadoEm || null,
    },
  };
  // Falha ao gravar o espelho NUNCA derruba quem estava só lendo o catálogo:
  // isto é otimização (sugestão de nome), não a fonte do dado. Pasta ausente é
  // o caso comum (primeira gravação numa máquina/ambiente novo).
  try {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, `${JSON.stringify(novo, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn(`catalogoSnapshot: não foi possível gravar o espelho do catálogo — ${err.message}`);
    return tudo;
  }
  return novo;
}

/** Espelho de UM cliente — listas vazias quando nunca foi gravado. */
function doCliente(clientId, opts = {}) {
  const tudo = opts.tudo || carregar(opts.caminho);
  const doIt = tudo[String(clientId)];
  return {
    produtos: doIt?.produtos ?? [],
    clientes: doIt?.clientes ?? [],
    atualizadoEm: doIt?.atualizadoEm ?? null,
  };
}

module.exports = { ARQUIVO, carregar, salvar, doCliente };
