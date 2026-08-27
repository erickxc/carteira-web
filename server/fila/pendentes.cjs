/**
 * Overlay de operações pendentes (Etapa 3, item 4 do plano — "obrigatório no
 * cliente remoto, não é opcional"): aplica em memória, por cima de uma
 * leitura, as operações que ESTA máquina já escreveu na fila e que ainda não
 * têm ack do controller — sem isso, a revalidação periódica do frontend
 * reverteria na tela o que a pessoa acabou de salvar, porque a leitura ainda
 * não reflete uma operação que só existe na fila.
 */
const fs = require('fs');
const path = require('path');
const { PENDENTES_DIR, RESULTADOS_DIR } = require('./caminhos.cjs');
const { machineId } = require('../machine.cjs');
const { repoMemoria } = require('../dominio/repo.cjs');
const { aplicarOperacao } = require('./aplicar.cjs');
const { ENTIDADES } = require('./entidades.cjs');

function lerAck(operationId) {
  const arquivo = path.join(RESULTADOS_DIR, `${operationId}.json`);
  if (!fs.existsSync(arquivo)) return null;
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return null; }
}

/**
 * Ainda precisa aparecer no overlay: sem ack (nunca tentada) OU ack com
 * status "error" (falhou, mas o controller ainda vai tentar de novo — não é
 * definitivo). Só sai do overlay quando "applied" (já é dado real, o overlay
 * ficaria redundante) ou "skipped" (desistiu depois de MAX_TENTATIVAS,
 * exige investigação manual — não faz sentido continuar fingindo que aplicou).
 */
function aindaPendente(operationId) {
  const ack = lerAck(operationId);
  return !ack || ack.status === 'error';
}

/** Só as operações desta máquina ainda não resolvidas (ver `aindaPendente`). */
function listarPendentesProprias() {
  if (!fs.existsSync(PENDENTES_DIR)) return [];
  return fs.readdirSync(PENDENTES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(PENDENTES_DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .filter((op) => op.machineId === machineId)
    .filter((op) => aindaPendente(op.operationId))
    .sort((a, b) => a.seq - b.seq);
}

/** `dados`: a leitura atual da sheet (do motor local ou do snapshot, Etapa 4).
 * Devolve uma cópia com as operações pendentes já aplicadas — nunca grava. */
function aplicarOverlay(sheet, dados) {
  const pendentes = listarPendentesProprias().filter((op) => ENTIDADES[op.entity]?.sheet === sheet);
  if (pendentes.length === 0) return dados;
  const memRepo = repoMemoria({ [sheet]: dados });
  for (const op of pendentes) {
    try {
      aplicarOperacao(memRepo, op, { efeitosExternos: false });
    } catch (err) {
      console.warn(`Overlay: falha ao aplicar operação pendente ${op.operationId}:`, err.message);
    }
  }
  return memRepo.get(sheet);
}

module.exports = { listarPendentesProprias, aplicarOverlay };
