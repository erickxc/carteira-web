/**
 * Limpeza pontual: apaga o que sobrou da feature "Frente" do Ágil (categoria
 * colorida por tarefa), removida por decisão do usuário — não estava sendo
 * usada e só somava complexidade ao quadro.
 *
 * Roda UMA vez, à mão (`node server/scripts/removerAgilFrentes.cjs`), e não no
 * boot: é destrutivo e irreversível, então não pode acontecer como efeito
 * colateral de subir o app numa máquina qualquer. O código do app já não lê
 * nem escreve nada disso — este script só recolhe o lixo.
 *
 * `--dry-run` mostra o que faria sem escrever.
 */
// Conexão própria (o módulo `dbSqlite.cjs` não expõe a dele): script pontual,
// fora do ciclo de vida do app, e assim não depende de `APP_MODE` nem da
// guarda de escrita em modo cliente — mas atenção, deve rodar na máquina
// SERVIDORA, que é a dona do banco.
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

  if (tabelaExiste(db, 'AgilFrentes')) {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM "AgilFrentes"').get();
    console.log(`AgilFrentes: ${total} registro(s) — ${seco ? 'seria removida' : 'removendo tabela'}...`);
    if (!seco) db.exec('DROP TABLE "AgilFrentes"');
  } else {
    console.log('AgilFrentes: tabela não existe (nada a fazer).');
  }

  if (tabelaExiste(db, 'AgilTarefas') && colunaExiste(db, 'AgilTarefas', 'frenteId')) {
    const { marcadas } = db.prepare(
      `SELECT COUNT(*) AS marcadas FROM "AgilTarefas" WHERE frenteId IS NOT NULL AND frenteId <> ''`
    ).get();
    console.log(`AgilTarefas.frenteId: ${marcadas} tarefa(s) com frente marcada — ${seco ? 'seria removida' : 'removendo coluna'}...`);
    if (!seco) {
      // DROP COLUMN existe desde o SQLite 3.35; se a build for antiga, ao menos
      // zera o valor (a coluna órfã sem dado não afeta o app, que já não a lê).
      try {
        db.exec('ALTER TABLE "AgilTarefas" DROP COLUMN frenteId');
      } catch (err) {
        console.warn(`DROP COLUMN indisponível (${err.message}) — zerando os valores em vez de remover a coluna.`);
        db.exec(`UPDATE "AgilTarefas" SET frenteId = NULL`);
      }
    }
  } else {
    console.log('AgilTarefas.frenteId: coluna não existe (nada a fazer).');
  }

  console.log(seco ? '\nDry-run: nada foi alterado.' : '\nLimpeza concluída.');
}

main();
