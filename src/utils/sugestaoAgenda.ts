import { addDays, format, startOfDay } from 'date-fns';
import { isBusinessDay } from './holidays';
import { buildFilaCadencia, rotuloRelogio } from './cadenciaServico';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

export interface SugestaoSlot {
  cliente: Cliente;
  /** Por que este cliente entrou na sugestão (relógio mais urgente). */
  motivo: string;
  /** Serviço que puxou a urgência (Monitoria/Price). */
  servico: string;
  /** Dia útil sugerido. */
  dia: Date;
  /** Horário sugerido (HH:mm) livre para o monitor naquele dia. */
  hora: string;
  monitor: string;
}

/** Horários candidatos, na ordem de preferência. */
const HORARIOS = ['09:00', '10:30', '14:00', '15:30'];
/** Teto de sugestões por dia por monitor — evita empilhar a semana toda num dia. */
const MAX_POR_DIA_POR_MONITOR = 2;

const naoOcupa = (e: EventoAgenda) => /cancel|reagend/i.test(e.status || '');

/**
 * Sugere quando encaixar os clientes com cadência mais atrasada — SUGESTIVO:
 * nada é criado nem gravado aqui, a função só devolve a lista para a tela
 * mostrar (o usuário decide e agenda pelo fluxo normal).
 *
 * Regras (determinísticas, sem IA — o objetivo é ser previsível e explicável):
 *  1. Ordem de prioridade = a mesma fila de cadência já usada em Ações
 *     (`buildFilaCadencia`), então a sugestão nunca discorda daquela tela.
 *  2. Só dias úteis (fim de semana e feriado ficam fora, via isBusinessDay).
 *  3. Não sugere horário que já esteja ocupado por uma reunião do mesmo monitor
 *     (mesma regra de conflito do EventFormModal: só reunião ocupa horário).
 *  4. No máximo MAX_POR_DIA_POR_MONITOR por dia por monitor.
 *  5. Cliente com reunião futura já marcada não entra (já está coberto).
 */
export function sugerirAgenda(
  clientes: Cliente[],
  agenda: EventoAgenda[],
  acoes: Acao[],
  cadencias: Cadencias,
  opcoes: { dias?: number; max?: number; agora?: Date } = {}
): SugestaoSlot[] {
  const agora = opcoes.agora ?? new Date();
  const janelaDias = opcoes.dias ?? 10;
  const maxSugestoes = opcoes.max ?? 8;

  const fila = buildFilaCadencia(clientes, agenda, acoes, cadencias, agora)
    .filter((f) => f.precisaAcao)
    // Já tem reunião futura marcada? Então não precisa de sugestão.
    .filter((f) => !f.relogios.some((r) => r.proximo !== null));

  // Ocupação existente: "dia|hora|monitor" -> ocupado (só reuniões contam).
  const ocupados = new Set<string>();
  // Quantas reuniões cada monitor já tem por dia (inclui as que sugerirmos).
  const cargaPorDia = new Map<string, number>();

  for (const e of agenda) {
    if (!/reuni/i.test(e.type || '') || naoOcupa(e)) continue;
    const d = e.date ? new Date(e.date) : null;
    if (!d || isNaN(d.getTime())) continue;
    const monitoresEv = e.monitores && e.monitores.length > 0 ? e.monitores : [''];
    monitoresEv.forEach((mon) => {
      const chaveDia = `${format(d, 'yyyy-MM-dd')}|${mon}`;
      cargaPorDia.set(chaveDia, (cargaPorDia.get(chaveDia) ?? 0) + 1);
      if (e.time) ocupados.add(`${format(d, 'yyyy-MM-dd')}|${e.time}|${mon}`);
    });
  }

  // Dias úteis candidatos, a partir de amanhã (hoje já está em andamento).
  const diasUteis: Date[] = [];
  for (let i = 1; i <= janelaDias && diasUteis.length < janelaDias; i++) {
    const d = startOfDay(addDays(agora, i));
    if (isBusinessDay(d)) diasUteis.push(d);
  }

  const out: SugestaoSlot[] = [];
  for (const item of fila) {
    if (out.length >= maxSugestoes) break;
    const monitor = item.cliente.monitor || '';
    // Relógio mais urgente do cliente = o de maior atraso.
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
          cliente: item.cliente,
          motivo: rotuloRelogio(pior),
          servico: pior.servico,
          dia,
          hora,
          monitor,
        });
        // Reserva o slot para as próximas iterações não sugerirem o mesmo.
        ocupados.add(`${format(dia, 'yyyy-MM-dd')}|${hora}|${monitor}`);
        cargaPorDia.set(chaveDia, (cargaPorDia.get(chaveDia) ?? 0) + 1);
        alocado = true;
        break;
      }
    }
  }
  return out;
}
