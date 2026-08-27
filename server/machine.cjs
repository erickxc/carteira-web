/**
 * Identidade desta máquina para a fila (Etapa 2+ do plano de fila/controller).
 * `machineId` é gerado uma vez e persistido FORA do OneDrive (mesma pasta
 * local-only do SQLite, `SQLITE_DIR`) — não pode viver num arquivo sincronizado,
 * senão duas máquinas correndo do mesmo perfil sincronizado herdariam o mesmo id.
 * `proximoSeq()` dá um contador monotônico local, usado pra ordenar operações
 * da mesma máquina na fila (não é um id global, só desempate por origem).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SQLITE_DIR } = require('./config.cjs');

const MACHINE_ID_FILE = path.join(SQLITE_DIR, 'machine-id.txt');
const SEQ_FILE = path.join(SQLITE_DIR, 'machine-seq.txt');

function lerOuCriarMachineId() {
  if (fs.existsSync(MACHINE_ID_FILE)) return fs.readFileSync(MACHINE_ID_FILE, 'utf8').trim();
  const id = crypto.randomUUID();
  fs.writeFileSync(MACHINE_ID_FILE, id);
  return id;
}

const machineId = lerOuCriarMachineId();

/** Escreve com tmp+rename — mesmo padrão do resto do projeto pra arquivo local. */
function proximoSeq() {
  let atual = 0;
  try { atual = Number(fs.readFileSync(SEQ_FILE, 'utf8').trim()) || 0; } catch { /* primeira vez */ }
  const novo = atual + 1;
  const tmp = `${SEQ_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, String(novo));
  fs.renameSync(tmp, SEQ_FILE);
  return novo;
}

module.exports = { machineId, proximoSeq, MACHINE_ID_FILE, SEQ_FILE };
