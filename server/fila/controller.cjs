/**
 * Controller da fila (Etapa 4 do plano) — roda só na máquina "server" (a
 * Karol-2D, dona do banco real). A cada ciclo:
 *   1. lê todas as operações pendentes (de qualquer máquina) em
 *      `filas/pendentes/`, ordenadas por `createdAt` (desempate por
 *      `machineId`+`seq`) — melhor esforço de ordem entre máquinas
 *      diferentes, não uma garantia forte (last-write-wins é o modelo aceito
 *      em v1, ver plano);
 *   2. aplica cada uma de verdade sobre o SQLite real, com a MESMA função de
 *      domínio que o overlay do cliente usa (`server/fila/aplicar.cjs`) —
 *      `create` é upsert idempotente por id (reprocessar depois de um crash
 *      nunca duplica linha);
 *   3. grava um ack em `filas/resultados/<operationId>.json` e move o
 *      arquivo da operação pra `filas/processadas/AAAA-MM/` — nunca reescreve
 *      o arquivo original (write-once, ver decisão de arquitetura #1/#2);
 *   4. loga um antes/depois em `filas/log/aplicadas-AAAA-MM.jsonl` (auditoria
 *      de last-write-wins, decisão #3).
 * Depois do ciclo, publica o snapshot de leitura (`server/fila/snapshot.cjs`)
 * — mesmo quando não havia nada pendente, porque o snapshot também é a
 * leitura inicial pra máquina remota que ainda não tinha nenhum.
 */
const fs = require('fs');
const path = require('path');
const { FILAS_DIR, PENDENTES_DIR, RESULTADOS_DIR, PROCESSADAS_DIR, LOG_DIR, LOCK_FILE } = require('./caminhos.cjs');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { aplicarOperacao } = require('./aplicar.cjs');
const { ENTIDADES } = require('./entidades.cjs');
const { publicarSnapshot } = require('./snapshot.cjs');
const { machineId } = require('../machine.cjs');

// Depois desse número de tentativas com erro, a operação é marcada como
// "skipped" e sai da fila (fica em resultados/ + processadas/ para
// investigação manual) — sem isso, uma operação com dado inválido travaria o
// processamento de tudo que vem depois dela pra sempre.
const MAX_TENTATIVAS = 5;
const REGEX_ARQUIVO_OPERACAO = /^[0-9a-f-]{36}\.json$/i;

// Lease do controller (`filas/controller.lock`): evita dois processos
// aplicando a fila ao mesmo tempo — cenário real, não hipotético, sempre que
// alguém sobe `npm start` (dev) e o `.exe` juntos na mesma máquina. TTL bem
// maior que o próprio ciclo (roda a cada 1min): se o dono do lock morrer sem
// liberar (crash), o lock expira sozinho em vez de travar a fila pra sempre.
const LOCK_TTL_MS = 2 * 60 * 1000;

function lockDeOutroProcesso() {
  if (!fs.existsSync(LOCK_FILE)) return null;
  let lock;
  try { lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); } catch { return null; }
  const expirado = Date.now() - new Date(lock.heartbeat).getTime() > LOCK_TTL_MS;
  if (expirado) return null;
  const éEsteProcesso = lock.machineId === machineId && lock.pid === process.pid;
  return éEsteProcesso ? null : lock;
}

function adquirirLock() {
  fs.mkdirSync(FILAS_DIR, { recursive: true });
  const tmp = `${LOCK_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ machineId, pid: process.pid, heartbeat: new Date().toISOString() }));
  fs.renameSync(tmp, LOCK_FILE);
}

function liberarLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch { /* já não existia — nada a fazer */ }
}

function mesCorrente(data = new Date()) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function lerOperacoesPendentes() {
  if (!fs.existsSync(PENDENTES_DIR)) return [];
  const entradas = fs.readdirSync(PENDENTES_DIR);
  const operacoes = [];
  for (const arquivo of entradas) {
    // Ignora silenciosamente qualquer nome fora do padrão "<uuid>.json" — é o
    // caso de uma cópia de conflito do OneDrive (ex.: "<uuid>-PCDAKAROL.json")
    // ou lixo qualquer; não tenta interpretar como operação, só não processa
    // (fica visível na pasta pra investigação manual, nunca é apagado aqui).
    if (!REGEX_ARQUIVO_OPERACAO.test(arquivo)) continue;
    try {
      operacoes.push({ arquivo, op: JSON.parse(fs.readFileSync(path.join(PENDENTES_DIR, arquivo), 'utf8')) });
    } catch (err) {
      console.warn(`Controller: falha ao ler operação pendente "${arquivo}" (ignorada este ciclo):`, err.message);
    }
  }
  operacoes.sort((a, b) => {
    if (a.op.createdAt !== b.op.createdAt) return a.op.createdAt < b.op.createdAt ? -1 : 1;
    if (a.op.machineId !== b.op.machineId) return a.op.machineId < b.op.machineId ? -1 : 1;
    return (a.op.seq ?? 0) - (b.op.seq ?? 0);
  });
  return operacoes;
}

function lerAck(operationId) {
  const arquivo = path.join(RESULTADOS_DIR, `${operationId}.json`);
  if (!fs.existsSync(arquivo)) return null;
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return null; }
}

function escreverAck(operationId, ack) {
  fs.mkdirSync(RESULTADOS_DIR, { recursive: true });
  const destino = path.join(RESULTADOS_DIR, `${operationId}.json`);
  const tmp = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ack, null, 2));
  fs.renameSync(tmp, destino);
}

function moverParaProcessadas(arquivo) {
  const destinoDir = path.join(PROCESSADAS_DIR, mesCorrente());
  fs.mkdirSync(destinoDir, { recursive: true });
  fs.renameSync(path.join(PENDENTES_DIR, arquivo), path.join(destinoDir, arquivo));
}

function registrarLog(linha) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(path.join(LOG_DIR, `aplicadas-${mesCorrente()}.jsonl`), `${JSON.stringify(linha)}\n`);
}

/**
 * `create` da fila é upsert idempotente por id (ver "Correção factual que
 * muda o desenho" no plano): se o registro já existe — reprocessamento após
 * um crash entre aplicar e mover/gravar ack —, aplica como update com o
 * mesmo `changes` em vez de criar uma linha duplicada.
 */
function aplicarComIdempotencia(repo, op) {
  const entidade = ENTIDADES[op.entity];
  if (!entidade) throw new Error(`Controller: entidade desconhecida "${op.entity}".`);
  if (op.operation === 'create') {
    const jaExiste = repo.get(entidade.sheet).some((r) => String(r.id) === String(op.recordId));
    if (jaExiste) return entidade.dominio.atualizar(repo, op.recordId, op.changes);
  }
  return aplicarOperacao(repo, op);
}

/** Um ciclo de aplicação (sem publicar snapshot) — separado só para teste. */
function processarUmCiclo() {
  const bloqueadoPor = lockDeOutroProcesso();
  if (bloqueadoPor) {
    console.warn(`Controller: outro processo já está processando a fila (machineId=${bloqueadoPor.machineId}, pid=${bloqueadoPor.pid}) — ciclo pulado.`);
    return { aplicadas: 0, comErro: 0, total: 0, bloqueado: true };
  }
  adquirirLock();
  try {
    return processarUmCicloSemLock();
  } finally {
    liberarLock();
  }
}

function processarUmCicloSemLock() {
  const repo = repoPlanilha();
  const pendentes = lerOperacoesPendentes();
  let aplicadas = 0;
  let comErro = 0;

  for (const { arquivo, op } of pendentes) {
    const ackExistente = lerAck(op.operationId);
    if (ackExistente?.status === 'applied') {
      // Já foi aplicada antes (crash entre aplicar e mover) — só move.
      moverParaProcessadas(arquivo);
      continue;
    }
    const tentativasAnteriores = ackExistente?.attempts ?? 0;
    const entidade = ENTIDADES[op.entity];
    try {
      const antes = entidade ? (repo.get(entidade.sheet).find((r) => String(r.id) === String(op.recordId)) ?? null) : null;
      const depois = aplicarComIdempotencia(repo, op);
      escreverAck(op.operationId, {
        operationId: op.operationId, status: 'applied', processedAt: new Date().toISOString(), attempts: tentativasAnteriores + 1,
      });
      registrarLog({
        operationId: op.operationId, entity: op.entity, operation: op.operation, recordId: op.recordId,
        machineId: op.machineId, userName: op.userName ?? null, antes, depois, appliedAt: new Date().toISOString(),
      });
      moverParaProcessadas(arquivo);
      aplicadas++;
    } catch (err) {
      comErro++;
      const tentativas = tentativasAnteriores + 1;
      const status = tentativas >= MAX_TENTATIVAS ? 'skipped' : 'error';
      escreverAck(op.operationId, {
        operationId: op.operationId, status, processedAt: new Date().toISOString(), attempts: tentativas, error: err.message,
      });
      console.warn(`Controller: falha ao aplicar operação ${op.operationId} (tentativa ${tentativas}/${MAX_TENTATIVAS}):`, err.message);
      if (status === 'skipped') {
        moverParaProcessadas(arquivo);
        console.warn(`Controller: operação ${op.operationId} marcada como "skipped" após ${MAX_TENTATIVAS} tentativas — requer investigação manual (ver filas/resultados/).`);
      }
    }
  }

  return { aplicadas, comErro, total: pendentes.length };
}

/** Ciclo completo: aplica pendentes + publica o snapshot de leitura (mesmo
 * sem nada pendente — é a leitura inicial de uma máquina remota nova). */
async function rodarCicloComSnapshot() {
  const resultado = processarUmCiclo();
  try {
    await publicarSnapshot();
  } catch (err) {
    console.warn('Controller: falha ao publicar snapshot de leitura:', err.message);
  }
  return resultado;
}

module.exports = { processarUmCiclo, rodarCicloComSnapshot, lerOperacoesPendentes, MAX_TENTATIVAS };
