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

/**
 * `porEntidade`: quebra da contagem por entidade (Agenda/Acoes/AgilTarefas/...)
 * — pedido depois de um caso real em que "178 pendentes" ficava preso do lado
 * do cliente mesmo com o OneDrive dele reportando sincronizado (o ack em
 * `resultados/` que o controller escreve na máquina servidora é OUTRO arquivo
 * que precisa propagar de volta por sync; se a sincronização de descida ficou
 * incompleta/atrasada numa pasta específica, o número fica preso sem indicar
 * ONDE). Não resolve o atraso de sincronização em si (fora do alcance do
 * app — é o OneDrive do Windows), mas transforma "178" opaco em algo
 * diagnosticável (ex.: "170 em Agenda" aponta pra uma importação em lote
 * específica, não uma trava geral).
 */
function statusFila() {
  if (!fs.existsSync(PENDENTES_DIR)) return { pendentes: 0, comErro: 0, ultimoErro: null, porEntidade: {} };
  let pendentes = 0;
  let comErro = 0;
  let ultimoErro = null;
  const porEntidade = {};
  for (const arquivo of fs.readdirSync(PENDENTES_DIR)) {
    if (!arquivo.endsWith('.json')) continue;
    let op;
    try { op = JSON.parse(fs.readFileSync(path.join(PENDENTES_DIR, arquivo), 'utf8')); } catch { continue; }
    if (op.machineId !== machineId) continue;
    const ack = lerAck(op.operationId);
    if (ack?.status === 'applied' || ack?.status === 'skipped') continue; // transitório, some no próximo ciclo
    pendentes++;
    porEntidade[op.entity] = (porEntidade[op.entity] ?? 0) + 1;
    if (ack?.status === 'error') { comErro++; ultimoErro = ack.error; }
  }
  return { pendentes, comErro, ultimoErro, porEntidade };
}

module.exports = { statusFila };
