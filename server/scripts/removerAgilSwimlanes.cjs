/**
 * Limpeza pontual: apaga o que sobrou da feature "Raia" (swimlane) do Ágil,
 * removida por decisão do usuário (docs/superpowers/specs/2026-09-09-agil-estrutura-design.md)
 * — divisão horizontal livre demais, sem uso padronizado, apontada como fonte
 * de confusão. O que ela tentava resolver (segmentar a visão por responsável)
 * passa a ser um filtro na tela, não uma divisão de dado.
 *
 * Roda UMA vez, à mão (`node server/scripts/removerAgilSwimlanes.cjs`), e não
 * no boot: é destrutivo e irreversível. Nenhuma tarefa se perde — só a coluna
 * `swimlaneId` some, o `colunaId` (que define onde o card aparece) não é tocado.
 *
 * `--dry-run` mostra o que faria sem escrever. Mesmo padrão de
 * `server/scripts/removerAgilFrentes.cjs` (a versão antiga da Frente).
 */
const Database = require('better-sqlite3');
const { SQLITE_FILE } = require('../config.cjs');

const seco = process.argv.includes('--dry-run');

function tabelaExiste(db, nome) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome));
}

function colunaExiste(db, tabela, coluna) {
  return db.prepare(`PRAGMA table_info("${tabela}")`).all().some((c) => c.name === coluna);
}

function main() {
  console.log(`Banco: ${SQLITE_FILE}\n`);
  const db = new Database(SQLITE_FILE);

  if (tabelaExiste(db, 'AgilSwimlanes')) {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM "AgilSwimlanes"').get();
    console.log(`AgilSwimlanes: ${total} registro(s) — ${seco ? 'seria removida' : 'removendo tabela'}...`);
    if (!seco) db.exec('DROP TABLE "AgilSwimlanes"');
  } else {
    console.log('AgilSwimlanes: tabela não existe (nada a fazer).');
  }

  if (tabelaExiste(db, 'AgilTarefas') && colunaExiste(db, 'AgilTarefas', 'swimlaneId')) {
    const { marcadas } = db.prepare(
      `SELECT COUNT(*) AS marcadas FROM "AgilTarefas" WHERE swimlaneId IS NOT NULL AND swimlaneId <> ''`
    ).get();
    console.log(`AgilTarefas.swimlaneId: ${marcadas} tarefa(s) com raia marcada — ${seco ? 'seria removida' : 'removendo coluna'}...`);
    if (!seco) {
      try {
        db.exec('ALTER TABLE "AgilTarefas" DROP COLUMN swimlaneId');
      } catch (err) {
        console.warn(`DROP COLUMN indisponível (${err.message}) — zerando os valores em vez de remover a coluna.`);
        db.exec(`UPDATE "AgilTarefas" SET swimlaneId = NULL`);
      }
    }
  } else {
    console.log('AgilTarefas.swimlaneId: coluna não existe (nada a fazer).');
  }

  console.log(seco ? '\nDry-run: nada foi alterado.' : '\nLimpeza concluída.');
}

main();
