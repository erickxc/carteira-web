const xlsx = require('xlsx');
const fs = require('fs');
const crypto = require('crypto');
const {
  DB_FILE, HEADERS_BY_SHEET,
  CLIENTES_HEADERS, AGENDA_HEADERS, LEMBRETES_HEADERS, CATEGORIAS_HEADERS, ACOES_HEADERS, MODELOS_HEADERS, CADENCIAS_HEADERS,
  AGENDA_SERIES_HEADERS,
  AGIL_WORKSPACES_HEADERS, AGIL_BOARDS_HEADERS, AGIL_COLUNAS_HEADERS, AGIL_TAREFAS_HEADERS, AGIL_SWIMLANES_HEADERS, AGIL_SUBTAREFAS_HEADERS, AGIL_COMENTARIOS_HEADERS, AGIL_FRENTES_HEADERS,
  CADENCIAS_SEED, MODELOS_SEED, CATEGORIAS_SEED,
} = require('./config.cjs');

// Sleep síncrono (bloqueia o event loop por poucos ms). Uso pontual para
// aguardar o OneDrive liberar o lock do arquivo entre tentativas de I/O.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * O OneDrive abre o database.xlsx com lock exclusivo durante a sincronização,
 * fazendo leituras/escritas falharem com EBUSY/EPERM de forma intermitente.
 * Reexecuta a operação de I/O algumas vezes com backoff curto antes de desistir.
 */
function comRetryIO(fn) {
  const MAX = 10;
  let ultimoErro;
  for (let tentativa = 1; tentativa <= MAX; tentativa++) {
    try {
      return fn();
    } catch (err) {
      if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
        ultimoErro = err;
        sleepSync(150 * tentativa); // backoff crescente: 150ms, 300ms, ...
        continue;
      }
      throw err;
    }
  }
  throw ultimoErro;
}

// ---------------------------------------------------------------------------
// Cache de leitura
// Antes, CADA chamada de getSheetData reabria e reparseava o workbook inteiro:
// carregar o app dispara 7 GETs (clientes, agenda, lembretes, categorias,
// acoes, modelos, cadencias) = 7 parses completos do mesmo arquivo.
// O cache é invalidado pelo mtime do arquivo, não só pelas nossas escritas —
// assim uma edição feita direto no Excel (ou uma versão baixada pelo OneDrive)
// continua sendo enxergada, ao custo de um fs.statSync por leitura.
// ---------------------------------------------------------------------------
let cache = null; // { mtimeMs, size, wb, sheets: { [nome]: linhas } }

function mtimeAtual() {
  try {
    const st = fs.statSync(DB_FILE);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

function lerWorkbook() {
  const stat = mtimeAtual();
  if (cache && stat && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.wb;
  const wb = comRetryIO(() => xlsx.readFile(DB_FILE));
  cache = { ...(stat || { mtimeMs: 0, size: 0 }), wb, sheets: {} };
  return wb;
}

/**
 * Grava o workbook de forma atômica: escreve num arquivo temporário e só então
 * renomeia por cima do banco. `xlsx.writeFile` direto no DB_FILE deixa uma
 * janela em que o arquivo está truncado/parcial — um crash, um desligamento ou
 * o OneDrive travando nesse instante corrompe o banco inteiro. O rename é
 * atômico no NTFS (MoveFileEx com REPLACE_EXISTING), então o arquivo nunca é
 * visto num estado intermediário.
 */
function gravarWorkbook(wb) {
  const tmp = `${DB_FILE}.tmp`;
  try {
    // bookType explícito é OBRIGATÓRIO aqui: o SheetJS deduz o formato pela
    // extensão do caminho, e o arquivo temporário termina em `.tmp` — sem isso
    // ele lança "Unrecognized bookType |tmp|" e nenhuma escrita funciona.
    comRetryIO(() => xlsx.writeFile(wb, tmp, { bookType: 'xlsx' }));
    comRetryIO(() => fs.renameSync(tmp, DB_FILE));
  } catch (err) {
    // Sem isso o temporário (possivelmente parcial) fica para trás e o
    // OneDrive ainda tenta sincronizá-lo.
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
  const stat = mtimeAtual();
  if (cache && stat) { cache.mtimeMs = stat.mtimeMs; cache.size = stat.size; }
  else cache = null;
}

function getSheetData(sheetName) {
  const wb = lerWorkbook();
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  if (!cache.sheets[sheetName]) cache.sheets[sheetName] = xlsx.utils.sheet_to_json(sheet) || [];
  // Cópia rasa: os chamadores mutam o array (data.push(...)) e mesclam as
  // linhas ({ ...row, ...patch }). Devolver as referências do cache deixaria o
  // cache sujo com dados que talvez nem cheguem a ser gravados.
  return cache.sheets[sheetName].map((linha) => ({ ...linha }));
}

function saveSheetData(sheetName, data) {
  const wb = lerWorkbook();
  const header = HEADERS_BY_SHEET[sheetName];
  wb.Sheets[sheetName] = header ? xlsx.utils.json_to_sheet(data, { header }) : xlsx.utils.json_to_sheet(data);
  gravarWorkbook(wb);
  // Invalida só esta aba (as outras não mudaram): a próxima leitura reparseia
  // do workbook em memória. Cachear `data` direto seria mais rápido, mas o
  // round-trip json_to_sheet/sheet_to_json normaliza valores (vazios omitidos,
  // tipos coeridos) e o cache passaria a divergir do que está no arquivo.
  if (cache) delete cache.sheets[sheetName];
}

/**
 * Atualiza (merge) a linha de id `id` na planilha `sheetName`. `transform`,
 * se passado, recebe o objeto já mesclado e devolve o objeto final a gravar
 * (usado por rotas que precisam normalizar/derivar campos, ex.: Clientes e
 * Acoes). Devolve a linha atualizada, ou `null` se nenhum id bateu — permite
 * às rotas responderem 404 em vez de "success: true" silencioso.
 */
function updateSheetRow(sheetName, id, patch, transform) {
  const data = getSheetData(sheetName);
  let updated = null;
  const next = data.map((row) => {
    if (String(row.id) !== String(id)) return row;
    const merged = { ...row, ...patch };
    updated = transform ? transform(merged) : merged;
    return updated;
  });
  if (updated) saveSheetData(sheetName, next);
  return updated;
}

/** Remove a linha de id `id` na planilha `sheetName`. Devolve `true` se algo
 * foi de fato removido — permite às rotas responderem 404 quando o id não existe. */
function deleteSheetRow(sheetName, id) {
  const data = getSheetData(sheetName);
  const next = data.filter((row) => String(row.id) !== String(id));
  const found = next.length !== data.length;
  if (found) saveSheetData(sheetName, next);
  return found;
}

/**
 * Mantém as colunas legadas do schema real coerentes com os campos novos:
 * - monitoria/price/controladoria (bool) derivados da lista `servicos`
 * - suspenso (bool) derivado do `status`
 * Assim, quando o app virar para o banco real, o app antigo continua enxergando
 * dados consistentes nessas colunas. Recebe/devolve o objeto do cliente.
 */
function syncClienteColumns(cliente) {
  let servicos = [];
  try {
    servicos = Array.isArray(cliente.servicos) ? cliente.servicos : JSON.parse(cliente.servicos || '[]');
  } catch {
    console.error(`syncClienteColumns: servicos não era JSON válido para "${cliente.empresa}" — resetado para [] em vez de perder o save. Valor recebido:`, cliente.servicos);
    servicos = [];
  }
  const has = (nome) => servicos.some((s) => String(s).toLowerCase() === nome);
  return {
    ...cliente,
    monitoria: has('monitoria'),
    price: has('precificação') || has('precificacao') || has('price'),
    controladoria: has('controladoria'),
    suspenso: String(cliente.status || '').toLowerCase() === 'suspenso',
  };
}

function seedComMetadados(rows, extra) {
  const now = new Date().toISOString();
  return rows.map((r) => ({ id: crypto.randomUUID(), createdAt: now, ...extra, ...r }));
}

function buildCategoriasSeed() {
  const now = new Date().toISOString();
  const rows = [];
  for (const [tipo, valores] of CATEGORIAS_SEED) {
    valores.forEach((valor, i) => {
      rows.push({ id: crypto.randomUUID(), tipo, valor, ordem: i, createdAt: now });
    });
  }
  return rows;
}

function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: CLIENTES_HEADERS }), 'Clientes');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGENDA_HEADERS }), 'Agenda');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: LEMBRETES_HEADERS }), 'Lembretes');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(buildCategoriasSeed(), { header: CATEGORIAS_HEADERS }), 'Categorias');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: ACOES_HEADERS }), 'Acoes');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(seedComMetadados(MODELOS_SEED), { header: MODELOS_HEADERS }), 'Modelos');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(CADENCIAS_SEED, { header: CADENCIAS_HEADERS }), 'Cadencias');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGENDA_SERIES_HEADERS }), 'AgendaSeries');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGIL_WORKSPACES_HEADERS }), 'AgilWorkspaces');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGIL_BOARDS_HEADERS }), 'AgilBoards');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGIL_COLUNAS_HEADERS }), 'AgilColunas');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGIL_TAREFAS_HEADERS }), 'AgilTarefas');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGIL_SWIMLANES_HEADERS }), 'AgilSwimlanes');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGIL_FRENTES_HEADERS }), 'AgilFrentes');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGIL_SUBTAREFAS_HEADERS }), 'AgilSubtarefas');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGIL_COMENTARIOS_HEADERS }), 'AgilComentarios');
    gravarWorkbook(wb);
  } else {
    // Banco já existe: garante a planilha Categorias e faz seed idempotente dos
    // tipos que ainda não existem (ex.: tipo_lembrete adicionado depois), sem
    // tocar nas categorias já cadastradas pelo usuário.
    const wb = lerWorkbook();
    let mudou = false;
    let categorias = wb.SheetNames.includes('Categorias')
      ? xlsx.utils.sheet_to_json(wb.Sheets['Categorias'])
      : [];
    if (!wb.SheetNames.includes('Categorias')) {
      categorias = buildCategoriasSeed();
      mudou = true;
    } else {
      const now = new Date().toISOString();
      for (const [tipo, valores] of CATEGORIAS_SEED) {
        if (!categorias.some((c) => c.tipo === tipo)) {
          valores.forEach((valor, i) => categorias.push({ id: crypto.randomUUID(), tipo, valor, ordem: i, createdAt: now }));
          mudou = true;
        }
      }
      // Valor novo dentro de um tipo que já existe: o loop acima só cobre tipo
      // inteiro ausente (ex.: tipo_lembrete adicionado depois), não um valor a
      // mais dentro de um tipo já cadastrado — bases já existentes (produção)
      // não recebem o valor novo do seed nesse caso, precisa de backfill
      // explícito. Feito valor a valor (não genérico por todo CATEGORIAS_SEED)
      // pra nunca resurrecionar um valor que o usuário tenha apagado de propósito.
      if (!categorias.some((c) => c.tipo === 'tipo_evento' && c.valor === 'Precificação')) {
        // max+1 (não `.length`): a lista real já tem `ordem` com lacunas/
        // repetições de edições manuais anteriores — usar length colidiria
        // com uma ordem existente em vez de ir pro fim.
        const ordem = categorias.filter((c) => c.tipo === 'tipo_evento').reduce((max, c) => Math.max(max, Number(c.ordem) || 0), -1) + 1;
        categorias.push({ id: crypto.randomUUID(), tipo: 'tipo_evento', valor: 'Precificação', ordem, createdAt: now });
        mudou = true;
      }
    }
    if (mudou) {
      wb.Sheets['Categorias'] = xlsx.utils.json_to_sheet(categorias, { header: CATEGORIAS_HEADERS });
      if (!wb.SheetNames.includes('Categorias')) wb.SheetNames.push('Categorias');
      gravarWorkbook(wb);
      if (cache) delete cache.sheets['Categorias'];
    }

    // Garante as planilhas novas (Acoes/Modelos/Cadencias) sem tocar nas existentes.
    const novas = [
      { nome: 'Acoes', header: ACOES_HEADERS, rows: [] },
      { nome: 'Modelos', header: MODELOS_HEADERS, rows: seedComMetadados(MODELOS_SEED) },
      { nome: 'Cadencias', header: CADENCIAS_HEADERS, rows: CADENCIAS_SEED },
      { nome: 'AgendaSeries', header: AGENDA_SERIES_HEADERS, rows: [] },
      { nome: 'AgilWorkspaces', header: AGIL_WORKSPACES_HEADERS, rows: [] },
      { nome: 'AgilBoards', header: AGIL_BOARDS_HEADERS, rows: [] },
      { nome: 'AgilColunas', header: AGIL_COLUNAS_HEADERS, rows: [] },
      { nome: 'AgilTarefas', header: AGIL_TAREFAS_HEADERS, rows: [] },
      { nome: 'AgilSwimlanes', header: AGIL_SWIMLANES_HEADERS, rows: [] },
      { nome: 'AgilFrentes', header: AGIL_FRENTES_HEADERS, rows: [] },
      { nome: 'AgilSubtarefas', header: AGIL_SUBTAREFAS_HEADERS, rows: [] },
      { nome: 'AgilComentarios', header: AGIL_COMENTARIOS_HEADERS, rows: [] },
    ];
    let mudou2 = false;
    for (const s of novas) {
      if (!wb.SheetNames.includes(s.nome)) {
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(s.rows, { header: s.header }), s.nome);
        mudou2 = true;
      }
    }
    if (mudou2) gravarWorkbook(wb);

    // Boards criados antes das swimlanes existirem (v1 do módulo Ágil) não têm
    // nenhuma linha em AgilSwimlanes — sem uma swimlane "Geral", suas tarefas
    // não têm onde aparecer na grade colunas×swimlanes. Migração idempotente:
    // só cria a swimlane para boards que ainda não têm nenhuma.
    {
      const wb2 = lerWorkbook();
      const boards = wb2.SheetNames.includes('AgilBoards') ? xlsx.utils.sheet_to_json(wb2.Sheets['AgilBoards']) : [];
      let swimlanes = wb2.SheetNames.includes('AgilSwimlanes') ? xlsx.utils.sheet_to_json(wb2.Sheets['AgilSwimlanes']) : [];
      const comSwimlane = new Set(swimlanes.map((s) => String(s.boardId)));
      const faltantes = boards.filter((b) => !comSwimlane.has(String(b.id)));
      let mudouSwimlanes = false;
      if (faltantes.length > 0) {
        const now = new Date().toISOString();
        const novasSwimlanes = faltantes.map((b) => ({ id: crypto.randomUUID(), boardId: b.id, titulo: 'Geral', ordem: 0, createdAt: now }));
        swimlanes = [...swimlanes, ...novasSwimlanes];
        wb2.Sheets['AgilSwimlanes'] = xlsx.utils.json_to_sheet(swimlanes, { header: AGIL_SWIMLANES_HEADERS });
        mudouSwimlanes = true;
      }

      // Tarefas criadas antes de swimlanes existirem ficam sem `swimlaneId` —
      // sem preencher, elas somem silenciosamente da grade colunas×swimlanes no
      // frontend (célula "coluna::undefined" não bate com nenhuma swimlane
      // real). Preenche com a primeira swimlane (ordem 0) do board da tarefa.
      const primeiraSwimlanePorBoard = new Map();
      swimlanes.forEach((s) => {
        const atual = primeiraSwimlanePorBoard.get(String(s.boardId));
        if (!atual || s.ordem < atual.ordem) primeiraSwimlanePorBoard.set(String(s.boardId), s);
      });
      const tarefas = wb2.SheetNames.includes('AgilTarefas') ? xlsx.utils.sheet_to_json(wb2.Sheets['AgilTarefas']) : [];
      let mudouTarefas = false;
      // Numeração sequencial por board para tarefas criadas antes do campo
      // `numero` existir — mantém o maior número já usado em cada board e
      // continua dali, para nunca reaproveitar um número.
      const proximoNumeroPorBoard = new Map();
      tarefas.forEach((t) => {
        const board = String(t.boardId);
        const atual = proximoNumeroPorBoard.get(board) ?? 0;
        proximoNumeroPorBoard.set(board, Math.max(atual, Number(t.numero) || 0));
      });
      const tarefasCorrigidas = tarefas.map((t) => {
        let corrigida = t;
        if (!corrigida.swimlaneId) {
          const swimlane = primeiraSwimlanePorBoard.get(String(corrigida.boardId));
          if (swimlane) {
            corrigida = { ...corrigida, swimlaneId: swimlane.id };
            mudouTarefas = true;
          }
        }
        if (!corrigida.numero) {
          const board = String(corrigida.boardId);
          const numero = (proximoNumeroPorBoard.get(board) ?? 0) + 1;
          proximoNumeroPorBoard.set(board, numero);
          corrigida = { ...corrigida, numero };
          mudouTarefas = true;
        }
        return corrigida;
      });
      if (mudouTarefas) wb2.Sheets['AgilTarefas'] = xlsx.utils.json_to_sheet(tarefasCorrigidas, { header: AGIL_TAREFAS_HEADERS });

      if (mudouSwimlanes || mudouTarefas) {
        gravarWorkbook(wb2);
        if (cache) {
          delete cache.sheets['AgilSwimlanes'];
          delete cache.sheets['AgilTarefas'];
        }
      }
    }

    // Boards criados antes de Áreas de trabalho existirem não têm
    // `workspaceId` — sem uma workspace, o board não aparece em nenhum
    // seletor. Migração idempotente: cria a workspace "Geral" só se faltar
    // algum board sem workspace, e atribui a ela só esses boards (nunca move
    // um board que já tem workspace).
    {
      const wb3 = lerWorkbook();
      let boards = wb3.SheetNames.includes('AgilBoards') ? xlsx.utils.sheet_to_json(wb3.Sheets['AgilBoards']) : [];
      const semWorkspace = boards.filter((b) => !b.workspaceId);
      if (semWorkspace.length > 0) {
        let workspaces = wb3.SheetNames.includes('AgilWorkspaces') ? xlsx.utils.sheet_to_json(wb3.Sheets['AgilWorkspaces']) : [];
        const now = new Date().toISOString();
        let geral = workspaces.find((w) => w.nome === 'Geral');
        if (!geral) {
          geral = { id: crypto.randomUUID(), nome: 'Geral', descricao: '', ordem: workspaces.length, createdAt: now };
          workspaces = [...workspaces, geral];
          wb3.Sheets['AgilWorkspaces'] = xlsx.utils.json_to_sheet(workspaces, { header: AGIL_WORKSPACES_HEADERS });
          if (!wb3.SheetNames.includes('AgilWorkspaces')) wb3.SheetNames.push('AgilWorkspaces');
        }
        boards = boards.map((b) => (b.workspaceId ? b : { ...b, workspaceId: geral.id }));
        wb3.Sheets['AgilBoards'] = xlsx.utils.json_to_sheet(boards, { header: AGIL_BOARDS_HEADERS });
        gravarWorkbook(wb3);
        if (cache) {
          delete cache.sheets['AgilWorkspaces'];
          delete cache.sheets['AgilBoards'];
        }
      }
    }

    // Iniciativas é workflow PADRÃO de todo board (Kanbanize: "Initiatives
    // Workflow" vem embutido, não é algo que se vincula manualmente) — boards
    // criados antes dessa regra existir não têm `iniciativasBoardId`. Migração
    // idempotente: cria o board companheiro (com colunas padrão coloridas) só
    // para quem ainda não tem, nunca mexe em quem já tem.
    {
      const wb4 = lerWorkbook();
      let boards = wb4.SheetNames.includes('AgilBoards') ? xlsx.utils.sheet_to_json(wb4.Sheets['AgilBoards']) : [];
      const faltantes = boards.filter((b) => !b.ehIniciativas && !b.iniciativasBoardId);
      if (faltantes.length > 0) {
        const now = new Date().toISOString();
        const coresPadrao = ['#304373', '#d69a3c', '#4cae7a'];
        const titulosPadrao = ['A Fazer', 'Em Andamento', 'Concluído'];
        let colunas = wb4.SheetNames.includes('AgilColunas') ? xlsx.utils.sheet_to_json(wb4.Sheets['AgilColunas']) : [];
        let swimlanes = wb4.SheetNames.includes('AgilSwimlanes') ? xlsx.utils.sheet_to_json(wb4.Sheets['AgilSwimlanes']) : [];

        for (const b of faltantes) {
          const iniciativas = { id: crypto.randomUUID(), workspaceId: b.workspaceId, nome: 'Iniciativas', ehIniciativas: true, createdAt: now };
          boards = [...boards, iniciativas];
          titulosPadrao.forEach((titulo, ordem) => {
            colunas.push({ id: crypto.randomUUID(), boardId: iniciativas.id, titulo, ordem, cor: coresPadrao[ordem], createdAt: now });
          });
          swimlanes.push({ id: crypto.randomUUID(), boardId: iniciativas.id, titulo: 'Geral', ordem: 0, createdAt: now });
          boards = boards.map((x) => (x.id === b.id ? { ...x, iniciativasBoardId: iniciativas.id } : x));
        }

        wb4.Sheets['AgilBoards'] = xlsx.utils.json_to_sheet(boards, { header: AGIL_BOARDS_HEADERS });
        wb4.Sheets['AgilColunas'] = xlsx.utils.json_to_sheet(colunas, { header: AGIL_COLUNAS_HEADERS });
        wb4.Sheets['AgilSwimlanes'] = xlsx.utils.json_to_sheet(swimlanes, { header: AGIL_SWIMLANES_HEADERS });
        gravarWorkbook(wb4);
        if (cache) {
          delete cache.sheets['AgilBoards'];
          delete cache.sheets['AgilColunas'];
          delete cache.sheets['AgilSwimlanes'];
        }
      }
    }
  }
}

module.exports = {
  comRetryIO,
  getSheetData, saveSheetData, updateSheetRow, deleteSheetRow,
  syncClienteColumns, initDB,
};
