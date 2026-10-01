/**
 * (Re)cria a cópia de dados do ambiente de desenvolvimento em `.dev/`, a
 * partir da produção desta máquina. Só LÊ a produção. Rodar com o
 * `start:dev` parado (sobrescreve a cópia inteira).
 *
 *   node scripts/prepararDev.cjs
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR, SQLITE_FILE, SQLITE_DIR } = require('../server/config.cjs');

const DEV = path.join(__dirname, '..', '.dev');
if (path.resolve(DATA_DIR).startsWith(path.resolve(DEV))) {
  console.error('Rodando com o ambiente dev carregado — rode sem --env-file.');
  process.exit(1);
}

const destDados = path.join(DEV, 'onedrive', 'dados');
const destSqlite = path.join(DEV, 'sqlite');
fs.rmSync(DEV, { recursive: true, force: true });

// Backups e planilhas pré-migração não servem pra dev e só pesam.
fs.cpSync(DATA_DIR, destDados, {
  recursive: true,
  filter: (src) => !/^backups|pre-migracao/.test(path.basename(src)),
});
fs.mkdirSync(destSqlite, { recursive: true });

// Token do Claude CLI da GUI, pra o chat do monitorIA funcionar igual.
const claude = path.join(SQLITE_DIR, 'claude-cli.json');
if (fs.existsSync(claude)) fs.copyFileSync(claude, path.join(destSqlite, 'claude-cli.json'));

// backup() em vez de copiar o arquivo: o banco está em WAL e em uso.
const origem = new Database(SQLITE_FILE, { readonly: true, fileMustExist: true });
origem.backup(path.join(destSqlite, 'carteira.sqlite'))
  .then(() => console.log(`Dados de dev prontos em ${DEV}`))
  .finally(() => origem.close());
