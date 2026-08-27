const { getSheetData, getSheetDataRemota, saveSheetData, updateSheetRow, deleteSheetRow } = require('../dbSqlite.cjs');
const { isClient } = require('../modo.cjs');

/**
 * Repositório sobre o motor real (Etapa 1.5: SQLite — `server/dbSqlite.cjs`;
 * o Excel virou export/backup periódico, não é mais lido/escrito daqui).
 * Nome mantido (`repoPlanilha`) por não valer a pena tocar em todo import só
 * por cosmético — usado pelas rotas HTTP de hoje e pelo controller da fila.
 *
 * Leitura (Etapa 4): em `APP_MODE=client`, `get` lê do snapshot publicado
 * pelo controller (`getSheetDataRemota`) em vez do SQLite local — essa
 * máquina nunca tem dado real no arquivo local (guarda de escrita +
 * `initDbSqlite` suprimido). Escrita continua sempre pelo motor local — em
 * modo cliente, `save`/`update`/`delete` são bloqueados por
 * `server/dbSqlite.cjs` de qualquer forma (toda escrita remota passa pela
 * fila, `server/fila/mutacao.cjs`, nunca por aqui).
 */
function repoPlanilha() {
  return {
    get: (sheet) => (isClient ? getSheetDataRemota(sheet) : getSheetData(sheet)),
    save: (sheet, rows) => saveSheetData(sheet, rows),
    update: (sheet, id, patch, transform) => updateSheetRow(sheet, id, patch, transform),
    delete: (sheet, id) => deleteSheetRow(sheet, id),
  };
}

/**
 * Repositório em memória, mesma interface de `repoPlanilha()` — usado por
 * testes e, mais adiante, pelo overlay de operações pendentes do cliente
 * remoto (aplica a mesma lógica de domínio sem tocar o arquivo real).
 * Mimetiza fielmente `update`/`delete` de `server/db.cjs` (merge raso,
 * `String(row.id) !== String(id)`) para o comportamento não divergir.
 */
function repoMemoria(sheetsIniciais = {}) {
  const sheets = {};
  for (const [nome, linhas] of Object.entries(sheetsIniciais)) {
    sheets[nome] = linhas.map((l) => ({ ...l }));
  }
  return {
    get: (sheet) => (sheets[sheet] ?? []).map((l) => ({ ...l })),
    save: (sheet, rows) => { sheets[sheet] = rows.map((l) => ({ ...l })); },
    update: (sheet, id, patch, transform) => {
      const data = sheets[sheet] ?? [];
      let updated = null;
      const next = data.map((row) => {
        if (String(row.id) !== String(id)) return row;
        const merged = { ...row, ...patch };
        updated = transform ? transform(merged) : merged;
        return updated;
      });
      if (updated) sheets[sheet] = next;
      return updated;
    },
    delete: (sheet, id) => {
      const data = sheets[sheet] ?? [];
      const next = data.filter((row) => String(row.id) !== String(id));
      const found = next.length !== data.length;
      if (found) sheets[sheet] = next;
      return found;
    },
    /** Acesso cru ao estado atual — só para inspeção em teste. */
    _dump: () => sheets,
  };
}

module.exports = { repoPlanilha, repoMemoria };
