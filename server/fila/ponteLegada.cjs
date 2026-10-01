/**
 * Ponte da migração de pasta (1.4.51: "6 - Erick\Carteira Web" →
 * "Ecossistema-Monitoria\Carteira\dados"). Máquina cliente que ainda não
 * atualizou continua lendo e gravando na pasta ANTIGA; sem a ponte, o que ela
 * grava nunca chega ao servidor. Roda no ciclo do controller (só servidor), e
 * só se `DATA_DIR_LEGADO` estiver no `.env`:
 *   - antes: arquivos novos/alterados da pasta antiga → nova (anexos, dossiês,
 *     reunioes_json, alvos...) e operações pendentes da fila antiga → nova;
 *   - depois: ack dessas operações, snapshot de leitura e anexos novos →
 *     pasta antiga.
 * ponytail: provisório — remover junto com `DATA_DIR_LEGADO` quando as 3
 * máquinas cliente estiverem na 1.4.51+.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR, DATA_DIR_LEGADO, SNAPSHOT_FILE } = require('../config.cjs');
const { PENDENTES_DIR, RESULTADOS_DIR } = require('./caminhos.cjs');

const REGEX_OPERACAO = /^([0-9a-f-]{36})\.json$/i;
// `filas/` tem tratamento próprio; backups não são dado vivo.
const IGNORAR_NA_RAIZ = new Set(['filas', 'backups', 'backups-dossies']);
// Operações trazidas da fila antiga cujo ack ainda precisa voltar pra lá.
// Em memória: se o servidor reiniciar no meio, a máquina antiga só vê o ack
// depois de atualizar (o dado já foi aplicado de qualquer jeito).
const trazidas = new Set();
// `utimesSync` arredonda a data (sub-milissegundo): sem folga, o anexo levado
// à pasta antiga com a data da origem pareceria "mais novo" e voltaria.
const TOLERANCIA_MS = 1000;

/** Copia o que é novo ou mais recente na origem (last-write-wins por mtime). */
function copiarNovidades(origem, destino, raiz = true) {
  for (const entrada of fs.readdirSync(origem, { withFileTypes: true })) {
    if (raiz && IGNORAR_NA_RAIZ.has(entrada.name)) continue;
    const de = path.join(origem, entrada.name);
    const para = path.join(destino, entrada.name);
    if (entrada.isDirectory()) {
      fs.mkdirSync(para, { recursive: true });
      copiarNovidades(de, para, false);
    } else if (!fs.existsSync(para) || fs.statSync(de).mtimeMs - fs.statSync(para).mtimeMs > TOLERANCIA_MS) {
      fs.copyFileSync(de, para);
    }
  }
}

/** Anexos têm nome único (uuid): basta levar os que faltam na pasta antiga,
 *  pra máquina ainda não atualizada abrir anexo enviado de outra máquina. */
function levarAnexosNovos() {
  const de = path.join(DATA_DIR, 'uploads');
  const para = path.join(DATA_DIR_LEGADO, 'uploads');
  if (!fs.existsSync(de)) return;
  fs.mkdirSync(para, { recursive: true });
  for (const arquivo of fs.readdirSync(de)) {
    const origem = path.join(de, arquivo);
    const destino = path.join(para, arquivo);
    if (fs.existsSync(destino)) continue;
    fs.copyFileSync(origem, destino);
    // Mesma data da origem: senão `copiarNovidades` o veria "mais novo" e o
    // traria de volta no ciclo seguinte.
    const { atime, mtime } = fs.statSync(origem);
    fs.utimesSync(destino, atime, mtime);
  }
}

function puxarPendentes() {
  const dir = path.join(DATA_DIR_LEGADO, 'filas', 'pendentes');
  if (!fs.existsSync(dir)) return;
  for (const arquivo of fs.readdirSync(dir)) {
    const m = REGEX_OPERACAO.exec(arquivo);
    if (!m) continue;
    fs.mkdirSync(PENDENTES_DIR, { recursive: true });
    fs.renameSync(path.join(dir, arquivo), path.join(PENDENTES_DIR, arquivo));
    trazidas.add(m[1]);
  }
}

function copiarAtomico(de, para) {
  fs.mkdirSync(path.dirname(para), { recursive: true });
  const tmp = `${para}.${process.pid}.tmp`;
  fs.copyFileSync(de, tmp);
  fs.renameSync(tmp, para);
}

function devolverAcks() {
  for (const id of trazidas) {
    const ack = path.join(RESULTADOS_DIR, `${id}.json`);
    if (!fs.existsSync(ack)) continue;
    copiarAtomico(ack, path.join(DATA_DIR_LEGADO, 'filas', 'resultados', `${id}.json`));
    const { status } = JSON.parse(fs.readFileSync(ack, 'utf8'));
    if (status === 'applied' || status === 'skipped') trazidas.delete(id);
  }
}

function comAviso(nome, fn) {
  try { fn(); } catch (err) { console.warn(`Ponte da pasta antiga (${nome}):`, err.message); }
}

function antesDoCiclo() {
  if (!DATA_DIR_LEGADO || !fs.existsSync(DATA_DIR_LEGADO)) return;
  comAviso('arquivos', () => copiarNovidades(DATA_DIR_LEGADO, DATA_DIR));
  comAviso('fila', puxarPendentes);
}

function depoisDoCiclo() {
  if (!DATA_DIR_LEGADO || !fs.existsSync(DATA_DIR_LEGADO)) return;
  comAviso('acks', devolverAcks);
  comAviso('anexos', levarAnexosNovos);
  comAviso('snapshot', () => {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      copiarAtomico(SNAPSHOT_FILE, path.join(DATA_DIR_LEGADO, 'filas', 'leitura', path.basename(SNAPSHOT_FILE)));
    }
  });
}

module.exports = { antesDoCiclo, depoisDoCiclo };
