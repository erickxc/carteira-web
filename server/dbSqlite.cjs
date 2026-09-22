const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SQLITE_DIR, SQLITE_FILE, SNAPSHOT_FILE, HEADERS_BY_SHEET, CATEGORIAS_SEED, MODELOS_SEED, CADENCIAS_SEED } = require('./config.cjs');
const { isClient } = require('./modo.cjs');

let db = null;

/**
 * Cache da última leitura BEM-SUCEDIDA do snapshot, por sheet — ver uso em
 * `getSheetDataRemota` logo abaixo. Dois níveis:
 *  - `ultimoSnapshotBom` (memória): rápido, mas começa vazio a cada boot do
 *    processo.
 *  - `SNAPSHOT_CACHE_FILE` (disco, `SQLITE_DIR` — LOCAL, fora do OneDrive):
 *    sobrevive a reiniciar o backend. Importa porque o cenário real que isso
 *    corrige é justo "acabou de reiniciar (update) bem na hora em que o
 *    OneDrive ainda não tinha propagado o snapshot novo" — sem persistência
 *    em disco, a memória vazia no boot faria cair em `[]` do mesmo jeito.
 */
const ultimoSnapshotBom = new Map();
const SNAPSHOT_CACHE_FILE = path.join(SQLITE_DIR, 'snapshot-cache.json');
let cacheDoDiscoCarregado = false;

function carregarCacheDoDiscoSeNecessario() {
  if (cacheDoDiscoCarregado) return;
  cacheDoDiscoCarregado = true;
  try {
    const bruto = JSON.parse(fs.readFileSync(SNAPSHOT_CACHE_FILE, 'utf8'));
    for (const [sheet, linhas] of Object.entries(bruto)) {
      if (!ultimoSnapshotBom.has(sheet)) ultimoSnapshotBom.set(sheet, linhas);
    }
  } catch {
    // Sem cache em disco ainda (primeiro boot desta máquina) — segue com [].
  }
}

function salvarCacheNoDisco() {
  try {
    fs.mkdirSync(SQLITE_DIR, { recursive: true });
    fs.writeFileSync(SNAPSHOT_CACHE_FILE, JSON.stringify(Object.fromEntries(ultimoSnapshotBom)));
  } catch (err) {
    console.warn('getSheetDataRemota: falha ao salvar o cache do snapshot em disco:', err.message);
  }
}

/**
 * Guarda estrutural (Etapa 2 do plano de fila/controller): em `APP_MODE=client`
 * (as outras 3 máquinas remotas) NENHUMA escrita direta no SQLite local é
 * permitida — o "banco real" é só o desta máquina (a Karol-2D). Toda escrita
 * remota precisa passar pela fila (Etapa 3+) e ser aplicada pelo controller.
 * Isso não depende de disciplina nas rotas: mesmo um bug numa rota que ainda
 * chame `saveSheetData`/`updateSheetRow`/`deleteSheetRow` direto é bloqueado aqui.
 */
function proibirEscritaEmModoCliente(nomeFn) {
  if (isClient) {
    throw new Error(`${nomeFn}: escrita direta no SQLite bloqueada em APP_MODE=client — use a fila.`);
  }
}

function conectar() {
  if (db) return db;
  db = new Database(SQLITE_FILE);
  // WAL: melhor concorrência leitura/escrita dentro do MESMO processo — não
  // tem relação com sincronização entre máquinas (o arquivo mora fora do
  // OneDrive de propósito, ver server/config.cjs).
  db.pragma('journal_mode = WAL');
  return db;
}

/** `id` é a chave primária de toda entidade, exceto `Cadencias` (usa `chave`). */
function pkDe(headers) {
  if (headers.includes('id')) return 'id';
  if (headers.includes('chave')) return 'chave';
  return headers[0];
}

/**
 * `CREATE TABLE IF NOT EXISTS` só cria a tabela na primeira vez — uma coluna
 * nova adicionada depois em `HEADERS_BY_SHEET` (ex.: novo campo estruturado
 * no evento) nunca aparecia na tabela real em produção, e a primeira escrita
 * quebrava com "no such column" (bug real, não hipotético). Migração leve:
 * some `ALTER TABLE ... ADD COLUMN` para os headers que faltam, toda vez que
 * a tabela é aberta — idempotente, e `PRAGMA table_info` é praticamente grátis.
 */
function garantirTabela(conexao, sheet, headers) {
  const pk = pkDe(headers);
  const colunas = headers.map((h) => (h === pk ? `"${h}" TEXT PRIMARY KEY` : `"${h}" TEXT`)).join(', ');
  conexao.exec(`CREATE TABLE IF NOT EXISTS "${sheet}" (${colunas})`);

  const existentes = new Set(conexao.prepare(`PRAGMA table_info("${sheet}")`).all().map((c) => c.name));
  for (const h of headers) {
    if (!existentes.has(h)) conexao.exec(`ALTER TABLE "${sheet}" ADD COLUMN "${h}" TEXT`);
  }
}

/**
 * Toda coluna não-PK é gravada como `JSON.stringify` e lida com `JSON.parse`
 * — preserva number/boolean/string/null com fidelidade total sem precisar
 * mapear tipo por coluna (mesmo padrão que o app já usa pra campos
 * estruturados como `servicos`/`checklist`, só que uniforme pra toda coluna
 * agora). Célula NULL vira chave OMITIDA no objeto — mesmo comportamento do
 * `sheet_to_json` do SheetJS hoje, que o resto do código já assume
 * (`?? []`/`|| fallback` espalhados pelo app).
 */
function linhaParaObjeto(headers, pk, row) {
  const obj = {};
  for (const h of headers) {
    if (h === pk) { obj[h] = row[h]; continue; }
    const raw = row[h];
    if (raw === null || raw === undefined) continue;
    try { obj[h] = JSON.parse(raw); } catch { obj[h] = raw; }
  }
  return obj;
}

function objetoParaLinha(headers, pk, obj) {
  const row = {};
  for (const h of headers) {
    if (h === pk) { row[h] = obj[h] != null ? String(obj[h]) : null; continue; }
    row[h] = h in obj ? JSON.stringify(obj[h]) : null;
  }
  return row;
}

function getSheetData(sheet) {
  const headers = HEADERS_BY_SHEET[sheet];
  if (!headers) return [];
  const conexao = conectar();
  garantirTabela(conexao, sheet, headers);
  const pk = pkDe(headers);
  const linhas = conexao.prepare(`SELECT * FROM "${sheet}"`).all();
  return linhas.map((row) => linhaParaObjeto(headers, pk, row));
}

/**
 * Leitura para as máquinas remotas (`APP_MODE=client`, Etapa 4 do plano de
 * fila): o SQLite local dessas máquinas nunca é semeado nem escrito (guarda
 * de escrita + `initDbSqlite` suprimido em `server.cjs`), então não há dado
 * real pra ler ali. `SNAPSHOT_FILE` é publicado periodicamente pelo
 * controller (`server/fila/controller.cjs`) dentro do OneDrive — abre em
 * `readonly` e conexão nova por chamada (sem cache): é lido só por requisição
 * HTTP, baixa frequência, e assim nunca disputa lock com o próximo
 * `fs.renameSync` do controller sobre o mesmo arquivo. Sem snapshot ainda
 * publicado (primeiro boot da máquina remota, sem cache em memória ainda),
 * devolve `[]` — mesmo comportamento de uma sheet vazia, não é um erro.
 *
 * Falha de LEITURA (diferente de "sem snapshot ainda") é outra história: o
 * `rename` do `publicarSnapshot` é atômico NA MÁQUINA SERVIDORA, mas o
 * arquivo mora dentro do OneDrive — nas máquinas remotas, o OneDrive ainda
 * precisa PROPAGAR essa troca, e nesse meio-tempo o arquivo local pode estar
 * parcialmente baixado ou placeholder (Files On-Demand). Isso já causou a
 * carteira aparecer ZERADA numa máquina remota (nada apagado de verdade — só
 * a leitura falhando e caindo no mesmo fallback de "vazio" usado pra "sem
 * snapshot"). Por isso, quando a leitura FALHA (não quando ela simplesmente
 * não acha linha nenhuma — isso continua um resultado válido), devolve a
 * ÚLTIMA leitura bem-sucedida guardada em memória em vez de `[]`.
 */
function getSheetDataRemota(sheet) {
  const headers = HEADERS_BY_SHEET[sheet];
  if (!headers) return [];
  carregarCacheDoDiscoSeNecessario();
  if (!fs.existsSync(SNAPSHOT_FILE)) return ultimoSnapshotBom.get(sheet) ?? [];
  const pk = pkDe(headers);
  let conexaoSnapshot;
  try {
    conexaoSnapshot = new Database(SNAPSHOT_FILE, { readonly: true });
    const linhas = conexaoSnapshot.prepare(`SELECT * FROM "${sheet}"`).all().map((row) => linhaParaObjeto(headers, pk, row));
    ultimoSnapshotBom.set(sheet, linhas);
    salvarCacheNoDisco();
    return linhas;
  } catch (err) {
    const cache = ultimoSnapshotBom.get(sheet);
    console.warn(
      `getSheetDataRemota: falha ao ler o snapshot para "${sheet}" (${err.message}) — `
      + (cache ? `servindo a última leitura boa em cache (${cache.length} linha(s)).` : 'sem cache anterior, devolvendo vazio.'),
    );
    return cache ?? [];
  } finally {
    if (conexaoSnapshot) conexaoSnapshot.close();
  }
}

/** Recria o conteúdo inteiro da tabela — mesma semântica de `saveSheetData` no
 * motor Excel (o caller já tem o array completo pronto), numa transação. */
function saveSheetData(sheet, data) {
  proibirEscritaEmModoCliente('saveSheetData');
  const headers = HEADERS_BY_SHEET[sheet];
  if (!headers) throw new Error(`saveSheetData: sheet desconhecida "${sheet}".`);
  const conexao = conectar();
  garantirTabela(conexao, sheet, headers);
  const pk = pkDe(headers);
  const colunasSql = headers.map((h) => `"${h}"`).join(', ');
  const placeholders = headers.map(() => '?').join(', ');
  const inserir = conexao.prepare(`INSERT INTO "${sheet}" (${colunasSql}) VALUES (${placeholders})`);
  const limpar = conexao.prepare(`DELETE FROM "${sheet}"`);
  const transacao = conexao.transaction((linhas) => {
    limpar.run();
    for (const obj of linhas) {
      const row = objetoParaLinha(headers, pk, obj);
      inserir.run(headers.map((h) => row[h]));
    }
  });
  transacao(data);
}

/** Update por linha única (mais eficiente que reescrever a tabela inteira) —
 * mesmo comportamento observável de `server/db.cjs:updateSheetRow` (merge raso
 * + `transform` opcional, devolve `null` se o id não existe). */
function updateSheetRow(sheet, id, patch, transform) {
  proibirEscritaEmModoCliente('updateSheetRow');
  const headers = HEADERS_BY_SHEET[sheet];
  if (!headers) return null;
  const conexao = conectar();
  garantirTabela(conexao, sheet, headers);
  const pk = pkDe(headers);
  const atual = conexao.prepare(`SELECT * FROM "${sheet}" WHERE "${pk}" = ?`).get(String(id));
  if (!atual) return null;
  const row = linhaParaObjeto(headers, pk, atual);
  const merged = { ...row, ...patch };
  const updated = transform ? transform(merged) : merged;
  const linha = objetoParaLinha(headers, pk, updated);
  const outrasColunas = headers.filter((h) => h !== pk);
  const setSql = outrasColunas.map((h) => `"${h}" = ?`).join(', ');
  const valores = outrasColunas.map((h) => linha[h]);
  conexao.prepare(`UPDATE "${sheet}" SET ${setSql} WHERE "${pk}" = ?`).run(...valores, String(id));
  return updated;
}

function deleteSheetRow(sheet, id) {
  proibirEscritaEmModoCliente('deleteSheetRow');
  const headers = HEADERS_BY_SHEET[sheet];
  if (!headers) return false;
  const conexao = conectar();
  garantirTabela(conexao, sheet, headers);
  const pk = pkDe(headers);
  const info = conexao.prepare(`DELETE FROM "${sheet}" WHERE "${pk}" = ?`).run(String(id));
  return info.changes > 0;
}

function seedComMetadados(rows, extra) {
  const now = new Date().toISOString();
  return rows.map((r) => ({ id: crypto.randomUUID(), createdAt: now, ...extra, ...r }));
}

function buildCategoriasSeed() {
  const now = new Date().toISOString();
  const rows = [];
  for (const [tipo, valores] of CATEGORIAS_SEED) {
    valores.forEach((valor, i) => rows.push({ id: crypto.randomUUID(), tipo, valor, ordem: i, createdAt: now }));
  }
  return rows;
}

/**
 * Cria todas as tabelas (uma por sheet de `HEADERS_BY_SHEET`) e faz o mesmo
 * seed idempotente que `server/db.cjs:initDB()` já faz no Excel: só semeia
 * Categorias/Modelos/Cadencias quando a tabela está vazia, e completa tipos de
 * categoria novos (ex.: adicionados depois) sem tocar nos já cadastrados.
 */
function initDbSqlite() {
  const conexao = conectar();
  for (const [sheet, headers] of Object.entries(HEADERS_BY_SHEET)) {
    garantirTabela(conexao, sheet, headers);
  }

  const categorias = getSheetData('Categorias');
  if (categorias.length === 0) {
    saveSheetData('Categorias', buildCategoriasSeed());
  } else {
    let mudou = false;
    const now = new Date().toISOString();
    for (const [tipo, valores] of CATEGORIAS_SEED) {
      if (!categorias.some((c) => c.tipo === tipo)) {
        valores.forEach((valor, i) => categorias.push({ id: crypto.randomUUID(), tipo, valor, ordem: i, createdAt: now }));
        mudou = true;
      }
    }
    if (mudou) saveSheetData('Categorias', categorias);
  }

  if (getSheetData('Modelos').length === 0) saveSheetData('Modelos', seedComMetadados(MODELOS_SEED));
  if (getSheetData('Cadencias').length === 0) saveSheetData('Cadencias', CADENCIAS_SEED);
}

/** Fecha a conexão aberta — usado só em teste (Windows não deixa remover um
 * diretório com um arquivo `.sqlite` ainda com handle aberto). */
function _fecharParaTestes() {
  if (db) { db.close(); db = null; }
}

module.exports = {
  getSheetData, getSheetDataRemota, saveSheetData, updateSheetRow, deleteSheetRow, initDbSqlite, _fecharParaTestes,
};
