const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config.cjs');
const { normalizar } = require('./entidades.cjs');
const { tagValida } = require('./tags.cjs');

/**
 * Ficha do CLIENTE FINAL (o comprador de uma loja, não a loja em si), escopada
 * por `clientId` (cliente da carteira): o mesmo nome pode comprar de mais de
 * uma loja sua, com situação diferente em cada — decisão do usuário.
 *
 * Dois atributos, de origens diferentes de propósito:
 *  - **tags**: vocabulário COMPARTILHADO do Ecossistema (`Bancos/tags.json`,
 *    ver `tags.cjs`) — Alerta, Inadimplente, Cliente Balcão, Encerrou operação.
 *    Múltiplas por cliente final (não são mutuamente exclusivas).
 *  - **grupo**: G1/G2/G3, o agrupamento de importância que já aparecia solto
 *    na prosa das atas ("Grupo 1 inclui Cooperativa Regional..."). Vem da
 *    categoria `grupo_referencia` deste app (editável em Configurações), não
 *    do arquivo compartilhado — é classificação nossa, não do ecossistema.
 *
 * Mesmo padrão de `acompanhamento.cjs`: decisão humana, JSON no OneDrive
 * (`DATA_DIR`), não SQLite — funciona em máquina cliente sem passar pela fila.
 */

const ARQUIVO_STATUS = process.env.ALVOS_CLIENTES_FINAIS_PATH
  || path.join(DATA_DIR, 'alvos-clientesFinais.json');

function carregarStatus(caminho = ARQUIVO_STATUS) {
  try {
    const dado = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return dado && typeof dado === 'object' ? dado : {};
  } catch {
    return {};
  }
}

function gravar(caminho, tudo) {
  fs.writeFileSync(caminho, `${JSON.stringify(tudo, null, 2)}\n`, 'utf8');
}

/** Lê o registro atual de um cliente final (ou o esqueleto vazio). */
function registroAtual(tudo, clientId, nome) {
  const doCliente = tudo[String(clientId)] || {};
  return doCliente[normalizar(nome)] || { nome, tags: [], grupo: null };
}

/**
 * Grava tags e/ou grupo de UM cliente final, preservando o resto. Campo
 * omitido em `patch` fica como está; `grupo: null` limpa o grupo; `tags: []`
 * limpa as tags. Registro sem tag NEM grupo é removido (não deixa lixo).
 */
function definir(clientId, nome, patch = {}, opts = {}) {
  const caminho = opts.caminho || ARQUIVO_STATUS;
  const tudo = carregarStatus(caminho);
  const atual = registroAtual(tudo, clientId, nome);

  let tags = atual.tags ?? [];
  if (patch.tags !== undefined) {
    tags = (patch.tags ?? []).map((t) => String(t).trim()).filter(Boolean);
    for (const tag of tags) {
      if (!tagValida(tag, opts.caminhoTags)) {
        throw new Error(`Tag inválida: "${tag}". Use uma das tags cadastradas em tags.json.`);
      }
    }
  }
  const grupo = patch.grupo !== undefined ? (patch.grupo || null) : (atual.grupo ?? null);
  const observacao = patch.observacao !== undefined
    ? (patch.observacao ? String(patch.observacao).slice(0, 300) : undefined)
    : atual.observacao;

  const doCliente = { ...(tudo[String(clientId)] || {}) };
  const chave = normalizar(nome);

  if (tags.length === 0 && !grupo) {
    delete doCliente[chave];
  } else {
    doCliente[chave] = {
      nome,
      tags,
      grupo,
      // Data vem de fora: `new Date()` aqui tornaria o teste dependente do dia.
      atualizadoEm: opts.atualizadoEm || null,
      observacao,
    };
  }

  const novo = { ...tudo, [String(clientId)]: doCliente };
  gravar(caminho, novo);
  return novo;
}

/** Todos os clientes finais com ficha registrada para UMA loja. */
function fichasDoCliente(clientId, opts = {}) {
  const tudo = opts.status || carregarStatus(opts.caminho);
  return Object.values(tudo[String(clientId)] || {});
}

/** Ficha de UM cliente final de UMA loja — `null` se nunca foi registrada. */
function buscarFicha(clientId, nome, opts = {}) {
  const tudo = opts.status || carregarStatus(opts.caminho);
  return (tudo[String(clientId)] || {})[normalizar(nome)] || null;
}

module.exports = {
  ARQUIVO_STATUS,
  carregarStatus,
  definir,
  fichasDoCliente,
  buscarFicha,
};
