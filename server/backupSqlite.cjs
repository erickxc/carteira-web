const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const Database = require('better-sqlite3');
const { SQLITE_FILE, BACKUP_ONEDRIVE_DIR, HEADERS_BY_SHEET } = require('./config.cjs');
const { getSheetData } = require('./dbSqlite.cjs');

// Mesma retenção/critério de nomeação por dia que `server/backup.cjs` já usa
// pro Excel — ver lá o motivo (nome do arquivo, não mtime, sobrevive à
// resincronização do OneDrive).
const DIAS_RETIDOS = 30;
const BACKUPS_DIR = path.join(BACKUP_ONEDRIVE_DIR, 'backups');

function hojeLocal(agora = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
}

function limparAntigos(padraoArquivo) {
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_RETIDOS);
  const corte = hojeLocal(limite);
  for (const arquivo of fs.readdirSync(BACKUPS_DIR)) {
    const m = padraoArquivo.exec(arquivo);
    if (m && m[1] < corte) {
      try { fs.unlinkSync(path.join(BACKUPS_DIR, arquivo)); } catch (err) {
        console.warn(`backupSqlite: não foi possível remover ${arquivo}: ${err.message}`);
      }
    }
  }
}

/**
 * Snapshot "hot" do SQLite (sempre consistente, mesmo com o banco em uso) —
 * `better-sqlite3` é a única API assíncrona da lib, o resto do projeto
 * continua 100% síncrono. Escreve com nome temporário e `rename` pro destino
 * final: o OneDrive nunca vê o arquivo num estado parcial (mesmo padrão de
 * `server/db.cjs:gravarWorkbook`).
 */
async function snapshotSqlite(dia = hojeLocal()) {
  if (!fs.existsSync(SQLITE_FILE)) return null;
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const destino = path.join(BACKUPS_DIR, `carteira-${dia}.sqlite`);
  if (fs.existsSync(destino)) return null;
  const tmp = `${destino}.tmp`;
  const origem = new Database(SQLITE_FILE, { readonly: true });
  try {
    await origem.backup(tmp);
  } finally {
    origem.close();
  }
  fs.renameSync(tmp, destino);
  limparAntigos(/^carteira-(\d{4}-\d{2}-\d{2})\.sqlite$/);
  return destino;
}

/**
 * Serializa arrays/objetos como JSON string por célula — mesma convenção que
 * o app sempre usou pro Excel (SheetJS não grava array/objeto direto numa
 * célula; ficaria "[object Object]"). Number/boolean/string/null passam como
 * estão, igual sempre foi.
 */
function paraCelulaXlsx(valor) {
  if (valor !== null && typeof valor === 'object') return JSON.stringify(valor);
  return valor;
}

function linhaParaXlsx(headers, obj) {
  const linha = {};
  for (const h of headers) {
    if (!(h in obj)) continue; // omitido = célula vazia, mesmo comportamento de sempre
    linha[h] = paraCelulaXlsx(obj[h]);
  }
  return linha;
}

/** Export do SQLite pra `.xlsx` — mesmo layout/headers de sempre
 * (`HEADERS_BY_SHEET`), pra quem for abrir no Excel ver exatamente o que já
 * conhecia. Nome fixo `database_dev.xlsx` (mirror sempre atualizado) +
 * cópia datada em `backups/` (histórico, mesma retenção do snapshot SQLite). */
function exportarXlsx(dia = hojeLocal()) {
  const wb = xlsx.utils.book_new();
  for (const [sheet, headers] of Object.entries(HEADERS_BY_SHEET)) {
    const linhas = getSheetData(sheet).map((obj) => linhaParaXlsx(headers, obj));
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(linhas, { header: headers }), sheet);
  }

  if (!fs.existsSync(BACKUP_ONEDRIVE_DIR)) fs.mkdirSync(BACKUP_ONEDRIVE_DIR, { recursive: true });
  const destinoAtual = path.join(BACKUP_ONEDRIVE_DIR, 'database_dev.xlsx');
  const tmpAtual = `${destinoAtual}.tmp`;
  xlsx.writeFile(wb, tmpAtual, { bookType: 'xlsx' });
  fs.renameSync(tmpAtual, destinoAtual);

  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const destinoHistorico = path.join(BACKUPS_DIR, `database_dev-${dia}.xlsx`);
  if (!fs.existsSync(destinoHistorico)) {
    const tmpHistorico = `${destinoHistorico}.tmp`;
    xlsx.writeFile(wb, tmpHistorico, { bookType: 'xlsx' });
    fs.renameSync(tmpHistorico, destinoHistorico);
    limparAntigos(/^database_dev-(\d{4}-\d{2}-\d{2})\.xlsx$/);
  }

  return destinoAtual;
}

/** Roda os dois exports (chamado 1x no boot + cron diário, mesmo padrão de
 * `server.cjs:rodarBackup`). */
async function rodarBackupSqlite() {
  const sqlitePath = await snapshotSqlite();
  const xlsxPath = exportarXlsx();
  return { sqlitePath, xlsxPath };
}

module.exports = { snapshotSqlite, exportarXlsx, rodarBackupSqlite, BACKUPS_DIR };
