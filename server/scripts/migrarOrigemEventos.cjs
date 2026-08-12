/**
 * Migração única: marca `origem = 'nos'` em todo Contato/Ligação já existente
 * que ainda não tem o campo.
 *
 * Por que faz sentido: até o campo existir, só o monitor registrava interações
 * no sistema — o cliente não tinha como. Então todo histórico é, por definição,
 * iniciativa interna. Sem isso, "contato recebido do cliente" fica misturado
 * com "não informado" e nenhuma das duas leituras é confiável.
 *
 * Reuniões e Relatórios ficam de fora: neles "quem procurou quem" não se aplica
 * (um é agendamento, o outro é entrega nossa).
 *
 * Uso:  node server/scripts/migrarOrigemEventos.cjs [--dry-run]
 * Faz backup do arquivo antes de gravar.
 */
const path = require('path');
const xlsx = require('xlsx');
const { DB_FILE } = require('../config.cjs');
const { getSheetData, saveSheetData } = require('../db.cjs');
const { backupDiario } = require('../backup.cjs');

const dryRun = process.argv.includes('--dry-run');
const ehInteracao = (tipo) => /contato|liga[çc]/i.test(String(tipo || ''));

function main() {
  const eventos = getSheetData('Agenda');
  console.log(`Agenda: ${eventos.length} evento(s) no total.`);

  const alvo = eventos.filter((e) => ehInteracao(e.type) && !String(e.origem || '').trim());
  const jaMarcados = eventos.filter((e) => String(e.origem || '').trim());

  console.log(`Contato/Ligação sem origem: ${alvo.length}`);
  console.log(`Já com origem definida (intocados): ${jaMarcados.length}`);

  if (alvo.length === 0) {
    console.log('Nada a migrar.');
    return;
  }

  // Amostra para conferência antes de gravar.
  alvo.slice(0, 5).forEach((e) => {
    console.log(`  ex.: ${e.date?.slice(0, 10)} · ${e.clientName} · ${e.type}`);
  });

  if (dryRun) {
    console.log('\n--dry-run: nada foi gravado.');
    return;
  }

  try {
    const bkp = backupDiario();
    if (bkp) console.log(`Backup: ${bkp}`);
  } catch (err) {
    // Sem backup, não grava: a migração toca muitas linhas de uma vez.
    console.error(`Falha ao gerar backup, abortando: ${err.message}`);
    process.exit(1);
  }

  const atualizados = eventos.map((e) =>
    ehInteracao(e.type) && !String(e.origem || '').trim() ? { ...e, origem: 'nos' } : e
  );

  saveSheetData('Agenda', atualizados);
  console.log(`\nOK: ${alvo.length} evento(s) marcados como origem='nos'.`);
  console.log(`Arquivo: ${DB_FILE}`);
}

main();
