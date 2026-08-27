/**
 * Escreve uma operação pendente na fila — Etapa 3 do plano. Um arquivo por
 * operação (nunca reescrito depois, write-once com tmp+rename), pra não sofrer
 * o "reenvia o arquivo inteiro" do OneDrive em append/rewrite (motivo
 * documentado no plano, "Decisões de arquitetura" item 1).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PENDENTES_DIR } = require('./caminhos.cjs');
const { machineId, proximoSeq } = require('../machine.cjs');

function escreverOperacao({ entity, operation, recordId, changes, userName }) {
  fs.mkdirSync(PENDENTES_DIR, { recursive: true });
  const operationId = crypto.randomUUID();
  const op = {
    schemaVersion: 1,
    operationId,
    machineId,
    userName: userName || null,
    seq: proximoSeq(),
    createdAt: new Date().toISOString(),
    entity,
    operation,
    recordId,
    changes: changes || {},
  };
  const destino = path.join(PENDENTES_DIR, `${operationId}.json`);
  const tmp = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(op, null, 2));
  fs.renameSync(tmp, destino);
  return op;
}

module.exports = { escreverOperacao };
