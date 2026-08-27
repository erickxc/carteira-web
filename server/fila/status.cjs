/**
 * Contagem de operações desta máquina ainda não confirmadas pelo controller
 * — usado pelo indicador "N alterações aguardando sincronização" na UI
 * (`GET /api/fila/status`, Etapa 4). Não cobre operações já marcadas
 * "skipped" e movidas pra `processadas/` (falha definitiva após
 * `MAX_TENTATIVAS`, ver `server/fila/controller.cjs`) — essas exigem
 * investigação manual direto em `filas/resultados/`, não aparecem aqui.
 */
const fs = require('fs');
const path = require('path');
const { PENDENTES_DIR, RESULTADOS_DIR } = require('./caminhos.cjs');
const { machineId } = require('../machine.cjs');

function lerAck(operationId) {
  const arquivo = path.join(RESULTADOS_DIR, `${operationId}.json`);
  if (!fs.existsSync(arquivo)) return null;
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return null; }
}

function statusFila() {
  if (!fs.existsSync(PENDENTES_DIR)) return { pendentes: 0, comErro: 0, ultimoErro: null };
  let pendentes = 0;
  let comErro = 0;
  let ultimoErro = null;
  for (const arquivo of fs.readdirSync(PENDENTES_DIR)) {
    if (!arquivo.endsWith('.json')) continue;
    let op;
    try { op = JSON.parse(fs.readFileSync(path.join(PENDENTES_DIR, arquivo), 'utf8')); } catch { continue; }
    if (op.machineId !== machineId) continue;
    const ack = lerAck(op.operationId);
    if (ack?.status === 'applied' || ack?.status === 'skipped') continue; // transitório, some no próximo ciclo
    pendentes++;
    if (ack?.status === 'error') { comErro++; ultimoErro = ack.error; }
  }
  return { pendentes, comErro, ultimoErro };
}

module.exports = { statusFila };
