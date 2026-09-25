/**
 * Migração única: preenche o serviço de eventos antigos SÓ quando é certo
 * (`servicoPadraoDoEvento`): Precificação → Price, Relatório → Monitoria, e
 * demais tipos quando o cliente contrata um único entre Monitoria e Price.
 * Cliente com os dois serviços fica como está e vai para a lista de revisão
 * manual (filtro "Só sem serviço" na Agenda). Idempotente: só olha evento
 * sem serviço.
 *
 * Uso:  node server/scripts/preencherServicoEventos.cjs            (simula, não grava)
 *       node server/scripts/preencherServicoEventos.cjs --aplicar  (backup do SQLite e grava)
 */
const path = require('path');
const Database = require('better-sqlite3');
const { SQLITE_FILE, SQLITE_DIR } = require('../config.cjs');
const { isClient } = require('../modo.cjs');
const { repoPlanilha } = require('../dominio/repo.cjs');
const agendaDominio = require('../dominio/agenda.cjs');
const { listaJSON, servicoPadraoDoEvento } = require('../../shared/cadenciaServico.cjs');

function planejar(eventos, clientes) {
  const porId = new Map(clientes.map((c) => [String(c.id), c]));
  const preencher = [];
  const revisar = [];
  for (const e of eventos) {
    if (listaJSON(e.servicos).length > 0) continue;
    const cliente = porId.get(String(e.clientId));
    const servicos = servicoPadraoDoEvento(e, cliente);
    if (servicos) preencher.push({ evento: e, servicos });
    else revisar.push({ evento: e, motivo: cliente ? 'cliente tem Monitoria e Price' : 'cliente removido' });
  }
  return { preencher, revisar };
}

async function main() {
  if (isClient) {
    console.error('Rode na máquina servidora (APP_MODE=server): em modo cliente a escrita direta é bloqueada.');
    process.exit(1);
  }
  const aplicar = process.argv.includes('--aplicar');
  const repo = repoPlanilha();
  const { preencher, revisar } = planejar(repo.get('Agenda'), repo.get('Clientes'));

  const porTipo = (lista) => lista.reduce((m, x) => ({ ...m, [x.evento.type]: (m[x.evento.type] || 0) + 1 }), {});
  console.log(`Preencher automaticamente: ${preencher.length}`, porTipo(preencher));
  console.log(`Revisar à mão: ${revisar.length}`, porTipo(revisar));
  revisar.slice(0, 10).forEach(({ evento: e, motivo }) => console.log(`  ${String(e.date).slice(0, 10)} · ${e.type} · ${e.clientName} (${motivo})`));

  if (!aplicar) {
    console.log('\nSimulação: nada foi gravado. Use --aplicar para gravar.');
    return;
  }
  if (preencher.length === 0) { console.log('Nada a preencher.'); return; }

  // Backup consistente (API do SQLite, não cópia de arquivo: o banco usa WAL).
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = path.join(SQLITE_DIR, `carteira-antes-servico-${carimbo}.sqlite`);
  const origem = new Database(SQLITE_FILE, { readonly: true });
  try { await origem.backup(destino); } finally { origem.close(); }
  console.log(`Backup: ${destino}`);

  for (const { evento, servicos } of preencher) agendaDominio.atualizar(repo, evento.id, { servicos });
  console.log(`Gravado: ${preencher.length} evento(s).`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { planejar };
