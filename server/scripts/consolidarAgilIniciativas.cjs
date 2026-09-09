/**
 * Migração (docs/superpowers/specs/2026-09-09-agil-estrutura-design.md,
 * revisado depois do teste local): o board de Iniciativas deixa de ser 1 por
 * quadro (modelo antigo — `AgilBoard.ehIniciativas`/`iniciativasBoardId`) e
 * vira 1 FIXO por Área de trabalho (`AgilWorkspace.iniciativasBoardId`),
 * compartilhado por todos os quadros dela.
 *
 * Roda direto no SQLite real (`server/dbSqlite.cjs`) — o `server/db.cjs`
 * (Excel/SheetJS) é código morto, nunca executado no boot desde a migração
 * pro SQLite (Etapa 1.5); qualquer migração de dado precisa mirar o motor
 * real, não o mirror de export. **Não é mais um script manual só**: idempotente
 * (`if (w.iniciativasBoardId) continue`) e toda Área de trabalho PRECISA ter
 * o board fixo pra UI funcionar — chamada automaticamente no boot
 * (`server.cjs`, `isServer`), igual às antigas migrações do `db.cjs`.
 *
 * Por workspace, com 1+ boards `ehIniciativas`:
 *  - Escolhe UM canônico (o mais antigo, `createdAt`).
 *  - Move as tarefas dos outros boards "Iniciativas" duplicados pro canônico
 *    (mesmo id de tarefa preservado — `AgilTarefa.iniciativaId` que já
 *    apontava pra elas continua válido, sem reescrever), remapeando pra
 *    coluna de MESMO TÍTULO no canônico (case-insensitive) — nunca duplica
 *    coluna; sem match, cai na primeira coluna do canônico.
 *  - Descarta as colunas dos boards duplicados (já não têm tarefa nenhuma).
 *  - Remove os boards duplicados.
 *  - Seta `AgilWorkspace.iniciativasBoardId` pro canônico.
 * Workspace sem NENHUM board "Iniciativas": cria um novo (5 colunas padrão).
 *
 * `node server/scripts/consolidarAgilIniciativas.cjs --dry-run` mostra o que
 * o boot faria sem escrever — útil pra conferir antes de subir a versão nova
 * numa máquina com dado real acumulado.
 */
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { getSheetData, saveSheetData } = require('../dbSqlite.cjs');
const { SQLITE_FILE } = require('../config.cjs');

const CORES_PADRAO = ['#8a8a93', '#304373', '#d69a3c', '#7c5cbf', '#4cae7a'];
const TITULOS_PADRAO = ['Backlog', 'A fazer', 'Em andamento', 'Validação', 'Concluído'];

/**
 * `ehIniciativas`/`iniciativasBoardId` (modelo antigo) saíram de
 * `AGIL_BOARDS_HEADERS` (Spec 1) — `getSheetData('AgilBoards')` não os
 * devolve mais, mesmo a COLUNA continuando fisicamente na tabela (`ALTER
 * TABLE` só adiciona, nunca remove). Sem ler o valor legado direto por SQL, a
 * migração nunca acha os boards antigos e cria um board "Iniciativas" a mais
 * por engano — foi exatamente o bug encontrado testando isto ao vivo.
 */
function lerCamposLegados() {
  const legados = new Map();
  let db;
  try {
    db = new Database(SQLITE_FILE, { readonly: true });
    const colunas = new Set(db.prepare('PRAGMA table_info("AgilBoards")').all().map((c) => c.name));
    if (!colunas.has('ehIniciativas') && !colunas.has('iniciativasBoardId')) return legados;
    const linhas = db.prepare('SELECT id, ehIniciativas, iniciativasBoardId FROM "AgilBoards"').all();
    for (const l of linhas) {
      let ehIniciativas;
      try { ehIniciativas = l.ehIniciativas == null ? undefined : JSON.parse(l.ehIniciativas); } catch { ehIniciativas = undefined; }
      legados.set(String(l.id), { ehIniciativas });
    }
  } catch {
    // Tabela/coluna ainda não existe (banco novo) — nada a migrar, segue vazio.
  } finally {
    if (db) db.close();
  }
  return legados;
}

function consolidarAgilIniciativas({ dryRun = false } = {}) {
  const seco = dryRun;
  const workspaces = getSheetData('AgilWorkspaces');
  const boards = getSheetData('AgilBoards');
  const camposLegados = lerCamposLegados();
  boards.forEach((b) => { b.ehIniciativas = camposLegados.get(String(b.id))?.ehIniciativas; });
  const colunas = getSheetData('AgilColunas');
  const tarefas = getSheetData('AgilTarefas');

  let boardsMudou = false;
  let colunasMudou = false;
  let tarefasMudou = false;
  let workspacesMudou = false;
  const now = new Date().toISOString();

  for (const w of workspaces) {
    if (w.iniciativasBoardId) continue; // já migrada — idempotente

    const boardsDaWorkspace = boards.filter((b) => String(b.workspaceId) === String(w.id));
    const boardsIniciativas = boardsDaWorkspace
      .filter((b) => b.ehIniciativas)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    if (boardsIniciativas.length === 0) {
      const novoId = crypto.randomUUID();
      console.log(`Workspace "${w.nome}" (${w.id}): sem board Iniciativas — ${seco ? 'criaria' : 'criando'} um novo (${novoId}).`);
      if (!seco) {
        boards.push({ id: novoId, workspaceId: w.id, nome: 'Iniciativas', createdAt: now });
        TITULOS_PADRAO.forEach((titulo, ordem) => {
          colunas.push({ id: crypto.randomUUID(), boardId: novoId, titulo, ordem, cor: CORES_PADRAO[ordem], createdAt: now });
        });
        w.iniciativasBoardId = novoId;
        boardsMudou = true;
        colunasMudou = true;
        workspacesMudou = true;
      }
      continue;
    }

    const [canonico, ...duplicados] = boardsIniciativas;
    console.log(
      `Workspace "${w.nome}" (${w.id}): ${boardsIniciativas.length} board(s) Iniciativas — canônico "${canonico.nome}" (${canonico.id})` +
      (duplicados.length > 0 ? `, ${duplicados.length} duplicado(s) a consolidar.` : '.')
    );

    if (!seco) {
      w.iniciativasBoardId = canonico.id;
      workspacesMudou = true;

      const idsDuplicados = new Set(duplicados.map((b) => String(b.id)));
      if (idsDuplicados.size > 0) {
        // Tarefa do board duplicado vai pra coluna de MESMO TÍTULO no
        // canônico (case-insensitive) — nunca duplica a coluna. Sem match,
        // cai na primeira coluna do canônico (nunca perde a tarefa de vista).
        const colunasCanonico = colunas.filter((c) => String(c.boardId) === String(canonico.id));
        const porTitulo = new Map(colunasCanonico.map((c) => [String(c.titulo).trim().toLowerCase(), c.id]));
        const colunaPadrao = colunasCanonico[0]?.id;

        tarefas.forEach((t) => {
          if (!idsDuplicados.has(String(t.boardId))) return;
          const colunaOrigem = colunas.find((c) => String(c.id) === String(t.colunaId));
          const destino = (colunaOrigem && porTitulo.get(String(colunaOrigem.titulo).trim().toLowerCase())) || colunaPadrao;
          t.boardId = canonico.id;
          if (destino) t.colunaId = destino;
          tarefasMudou = true;
        });

        // As colunas dos boards duplicados não são mais necessárias — as
        // tarefas já foram remapeadas pra coluna equivalente do canônico.
        const antesColunas = colunas.length;
        const colunasFinais = colunas.filter((c) => !idsDuplicados.has(String(c.boardId)));
        if (colunasFinais.length !== antesColunas) {
          colunas.length = 0;
          colunas.push(...colunasFinais);
          colunasMudou = true;
        }
      }
    }
  }

  // Remove os boards "Iniciativas" duplicados (o canônico de cada workspace
  // já ficou de fora — não está em `idsDuplicados` de workspace nenhuma).
  if (!seco) {
    const idsCanonicos = new Set(workspaces.map((w) => w.iniciativasBoardId).filter(Boolean));
    const antes = boards.length;
    const boardsFinais = boards.filter((b) => !b.ehIniciativas || idsCanonicos.has(String(b.id)));
    if (boardsFinais.length !== antes) {
      boards.length = 0;
      boards.push(...boardsFinais.map(({ ehIniciativas, iniciativasBoardId, ...resto }) => resto));
      boardsMudou = true;
    } else if (boards.some((b) => 'ehIniciativas' in b || 'iniciativasBoardId' in b)) {
      // Mesmo sem remover nenhum board, limpa os campos legados dos que sobraram.
      boards.forEach((b, i) => { boards[i] = { ...b }; delete boards[i].ehIniciativas; delete boards[i].iniciativasBoardId; });
      boardsMudou = true;
    }

    if (workspacesMudou) saveSheetData('AgilWorkspaces', workspaces);
    if (boardsMudou) saveSheetData('AgilBoards', boards);
    if (colunasMudou) saveSheetData('AgilColunas', colunas);
    if (tarefasMudou) saveSheetData('AgilTarefas', tarefas);
  }

  if (seco) console.log('\nDry-run: nada foi alterado.');
  return { workspacesMudou, boardsMudou, colunasMudou, tarefasMudou };
}

module.exports = { consolidarAgilIniciativas };

if (require.main === module) {
  const seco = process.argv.includes('--dry-run');
  consolidarAgilIniciativas({ dryRun: seco });
}
