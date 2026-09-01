const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config.cjs');
const { normalizar } = require('./entidades.cjs');

/**
 * Situação (inadimplente / regular / situação externa) de um CLIENTE FINAL —
 * o comprador de uma loja, não a loja em si. Escopado por `clientId` (cliente
 * da carteira/loja): o mesmo nome de cliente final pode comprar de mais de
 * uma loja sua, com uma relação de crédito diferente em cada uma — decisão
 * do usuário, ver conversa que motivou este módulo.
 *
 * Mesmo padrão de `acompanhamento.cjs` (mesma pasta) de propósito: é decisão
 * humana, não dado derivado, então mora em JSON no OneDrive (`DATA_DIR`) e
 * não no SQLite — funciona em máquina cliente sem passar pela fila, mesmo
 * caminho do dossiê e do acompanhamento.
 */

const ARQUIVO_STATUS = process.env.ALVOS_CLIENTES_FINAIS_PATH
  || path.join(DATA_DIR, 'alvos-clientesFinais.json');

const STATUS_VALIDOS = ['inadimplente', 'regular', 'situacao_externa'];

function carregarStatus(caminho = ARQUIVO_STATUS) {
  try {
    const dado = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return dado && typeof dado === 'object' ? dado : {};
  } catch {
    return {};
  }
}

/**
 * Grava a situação de UM cliente final de UMA loja, preservando o resto.
 * `status` nulo remove o registro.
 */
function definirStatus(clientId, nomeClienteFinal, status, opts = {}) {
  const caminho = opts.caminho || ARQUIVO_STATUS;
  if (status !== null && !STATUS_VALIDOS.includes(status)) {
    throw new Error(`Status inválido: "${status}". Use ${STATUS_VALIDOS.join(', ')}.`);
  }
  const tudo = carregarStatus(caminho);
  const doCliente = { ...(tudo[String(clientId)] || {}) };
  const chave = normalizar(nomeClienteFinal);

  if (status === null) {
    delete doCliente[chave];
  } else {
    doCliente[chave] = {
      nome: nomeClienteFinal,
      status,
      // Data vem de fora: `new Date()` aqui tornaria o teste dependente do dia.
      atualizadoEm: opts.atualizadoEm || null,
      observacao: opts.observacao ? String(opts.observacao).slice(0, 300) : undefined,
    };
  }

  const novo = { ...tudo, [String(clientId)]: doCliente };
  fs.writeFileSync(caminho, `${JSON.stringify(novo, null, 2)}\n`, 'utf8');
  return novo;
}

/** Todos os clientes finais com situação registrada para UMA loja. */
function statusDoCliente(clientId, opts = {}) {
  const tudo = opts.status || carregarStatus(opts.caminho);
  return Object.values(tudo[String(clientId)] || {});
}

/** Situação de UM cliente final de UMA loja — `null` se nunca foi registrada. */
function buscarStatusUm(clientId, nomeClienteFinal, opts = {}) {
  const tudo = opts.status || carregarStatus(opts.caminho);
  return (tudo[String(clientId)] || {})[normalizar(nomeClienteFinal)] || null;
}

module.exports = {
  ARQUIVO_STATUS,
  STATUS_VALIDOS,
  carregarStatus,
  definirStatus,
  statusDoCliente,
  buscarStatusUm,
};
