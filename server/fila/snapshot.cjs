/**
 * Publica um snapshot somente-leitura do SQLite real dentro do OneDrive —
 * Etapa 4 do plano de fila/controller: é o que resolve a leitura remota (as
 * outras 3 máquinas nunca têm o SQLite vivo, que é local-only de propósito).
 * `.backup()` do better-sqlite3 é "hot" (sempre consistente, mesmo com o
 * banco em uso) — mesma técnica já usada em `server/backupSqlite.cjs`, só que
 * aqui é operacional (roda a cada ciclo do controller, minutos) em vez de
 * diário. tmp+rename garante que o OneDrive nunca vê o arquivo pela metade.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const { SQLITE_FILE, SNAPSHOT_DIR, SNAPSHOT_FILE } = require('../config.cjs');

async function publicarSnapshot() {
  if (!fs.existsSync(SQLITE_FILE)) return null;
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const tmp = `${SNAPSHOT_FILE}.${process.pid}.tmp`;
  const origem = new Database(SQLITE_FILE, { readonly: true });
  try {
    await origem.backup(tmp);
  } finally {
    origem.close();
  }
  fs.renameSync(tmp, SNAPSHOT_FILE);
  return SNAPSHOT_FILE;
}

module.exports = { publicarSnapshot };
