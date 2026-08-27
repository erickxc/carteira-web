const { addDays, format, startOfDay } = require('date-fns');
const { isBusinessDay } = require('./feriados.cjs');
const { buildFilaCadencia, rotuloRelogio, listaJSON } = require('./cadenciaServico.cjs');

/**
 * Porta de `src/utils/sugestaoAgenda.ts` — sugestões de encaixe na agenda pros
 * clientes com cadência mais atrasada. SUGESTIVO: nada é criado nem gravado
 * aqui, só devolve a lista (quem agenda de fato é `criar_evento`, e só se o
 * usuário pedir).
 *
 * Mesma duplicação deliberada de `cadenciaServico.cjs` (frontend `.ts` vs
 * backend `.cjs`) — se a regra mudar lá, muda aqui.
 *
 * Regras, determinísticas de propósito (previsível e explicável, sem IA):
 *  1. Ordem = a mesma fila de cadência de Ações (`buildFilaCadencia`), então a
 *     sugestão nunca discorda daquela tela.
 *  2. Só dias úteis (fim de semana e feriado fora).
 *  3. Não sugere horário já ocupado por reunião do mesmo monitor.
 *  4. Teto de 2 por dia por monitor (não empilha a semana num dia).
 *  5. Cliente com reunião futura já marcada não entra (já está coberto).
 */

const HORARIOS = ['09:00', '10:30', '14:00', '15:30'];
const MAX_POR_DIA_POR_MONITOR = 2;
const naoOcupa = (e) => /cancel|reagend/i.test(e.status || '');

function sugerirAgenda(clientes, agenda, acoes, cadencias, opcoes = {}) {
  const agora = opcoes.agora ?? new Date();
  const janelaDias = opcoes.dias ?? 10;
  const maxSugestoes = opcoes.max ?? 8;

  const fila = buildFilaCadencia(clientes, agenda, acoes, cadencias, agora)
    .filter((f) => f.precisaAcao)
    .filter((f) => !f.relogios.some((r) => r.proximo !== null));

  const ocupados = new Set();
  const cargaPorDia = new Map();

  for (const e of agenda) {
    if (!/reuni/i.test(e.type || '') || naoOcupa(e)) continue;
    const d = e.date ? new Date(e.date) : null;
    if (!d || isNaN(d.getTime())) continue;
    const monitoresEv = listaJSON(e.monitores);
    const lista = monitoresEv.length > 0 ? monitoresEv : [''];
    lista.forEach((mon) => {
      const chaveDia = `${format(d, 'yyyy-MM-dd')}|${mon}`;
      cargaPorDia.set(chaveDia, (cargaPorDia.get(chaveDia) ?? 0) + 1);
      if (e.time) ocupados.add(`${format(d, 'yyyy-MM-dd')}|${e.time}|${mon}`);
    });
  }

  const diasUteis = [];
  for (let i = 1; i <= janelaDias && diasUteis.length < janelaDias; i++) {
    const d = startOfDay(addDays(agora, i));
    if (isBusinessDay(d)) diasUteis.push(d);
  }

  const out = [];
  for (const item of fila) {
    if (out.length >= maxSugestoes) break;
    const monitor = item.cliente.monitor || '';
    const pior = [...item.relogios].sort((a, b) => b.atrasoReal - a.atrasoReal)[0];
    if (!pior) continue;

    let alocado = false;
    for (const dia of diasUteis) {
      if (alocado) break;
      const chaveDia = `${format(dia, 'yyyy-MM-dd')}|${monitor}`;
      if ((cargaPorDia.get(chaveDia) ?? 0) >= MAX_POR_DIA_POR_MONITOR) continue;
      for (const hora of HORARIOS) {
        if (ocupados.has(`${format(dia, 'yyyy-MM-dd')}|${hora}|${monitor}`)) continue;
        out.push({
          empresa: item.cliente.empresa,
          clientId: item.cliente.id,
          motivo: rotuloRelogio(pior),
          servico: pior.servico,
          dia: format(dia, 'yyyy-MM-dd'),
          hora,
          monitor,
        });
        ocupados.add(`${format(dia, 'yyyy-MM-dd')}|${hora}|${monitor}`);
        cargaPorDia.set(chaveDia, (cargaPorDia.get(chaveDia) ?? 0) + 1);
        alocado = true;
        break;
      }
    }
  }
  return out;
}

module.exports = { sugerirAgenda };
