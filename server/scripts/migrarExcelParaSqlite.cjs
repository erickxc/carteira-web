/**
 * Migração única: lê um `database_dev.xlsx` (ou o caminho passado por
 * argumento) e grava cada sheet no SQLite (Etapa 1.5 do plano de fila +
 * SQLite). Idempotente por sheet — `saveSheetData` recria o conteúdo da
 * tabela inteira, então rodar de novo sobre a mesma origem é seguro (mesmo
 * resultado), mas SUBSTITUI qualquer dado já gravado direto no SQLite desde a
 * última migração (não faz merge).
 *
 * Uso:  node server/scripts/migrarExcelParaSqlite.cjs [caminho-do-xlsx]
 * Sem argumento, usa o `DB_FILE` de produção (`server/config.cjs`).
 */
const xlsx = require('xlsx');
const { HEADERS_BY_SHEET } = require('../config.cjs');
const dbSqlite = require('../dbSqlite.cjs');

/** Devolve `{ [sheet]: quantidadeDeLinhasMigradas }`. */
function migrarExcelParaSqlite(origemXlsxPath) {
  const wb = xlsx.readFile(origemXlsxPath);
  const resultado = {};
  for (const sheet of Object.keys(HEADERS_BY_SHEET)) {
    if (!wb.Sheets[sheet]) { resultado[sheet] = 0; continue; }
    const linhas = xlsx.utils.sheet_to_json(wb.Sheets[sheet]);
    dbSqlite.saveSheetData(sheet, linhas);
    resultado[sheet] = linhas.length;
  }
  return resultado;
}

if (require.main === module) {
  const { DB_FILE } = require('../config.cjs');
  const origem = process.argv[2] || DB_FILE;
  console.log(`Migrando de "${origem}" para o SQLite...`);
  const resultado = migrarExcelParaSqlite(origem);
  for (const [sheet, n] of Object.entries(resultado)) {
    if (n > 0) console.log(`  ${sheet}: ${n} linha(s)`);
  }
  console.log('OK.');
}

module.exports = { migrarExcelParaSqlite };
