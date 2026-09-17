import { addDays, endOfMonth, format, startOfDay } from 'date-fns';
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

/** Horários candidatos. A ordem de tentativa por dia/monitor é decidida em
 *  runtime (ver `ordenarPorTurnoMenosCarregado`), não fixa — senão a sugestão
 *  sempre enche 09:00/10:30 antes de cogitar a tarde. */
const HORARIOS = ['09:00', '10:30', '14:00', '15:30'];
/** Teto de sugestões por dia por monitor — evita empilhar a semana toda num dia. */
const MAX_POR_DIA_POR_MONITOR = 2;

/** Mesmo corte de `turnoDe` (>= 12h = tarde) usado no resto da Agenda. */
function turnoDaHora(hora: string): 'manha' | 'tarde' {
  return Number(hora.slice(0, 2)) >= 12 ? 'tarde' : 'manha';
}

const naoOcupa = (e: EventoAgenda) => /cancel|reagend/i.test(e.status || '');

/**
 * Dias úteis de amanhã até o último dia do MÊS CORRENTE de `agora` — a janela
 * de `sugerirAgenda` (ver comentário lá): "o que falta encaixar esse mês",
 * encurtando sozinha conforme o mês passa. Sem limite artificial de
 * quantidade de dias.
 */
function diasUteisAteFimDoMes(agora: Date): Date[] {
  const fim = endOfMonth(agora);
  const dias: Date[] = [];
  for (let d = addDays(startOfDay(agora), 1); d <= fim; d = addDays(d, 1)) {
    if (isBusinessDay(d)) dias.push(d);
  }
  return dias;
}

/**
 * Sugere quando encaixar os clientes com cadência mais atrasada — SUGESTIVO:
 * nada é criado nem gravado aqui, a função só devolve a lista para a tela
 * mostrar (o usuário decide e agenda pelo fluxo normal).
 *
 * Regras (determinísticas, sem IA — o objetivo é ser previsível e explicável):
 *  1. Ordem de prioridade = a mesma fila de cadência já usada em Ações
 *     (`buildFilaCadencia`), então a sugestão nunca discorda daquela tela.
 *  2. Janela = dias úteis de amanhã até o fim do mês corrente (nada de
 *     quantidade fixa) — fim de semana e feriado ficam fora, via isBusinessDay.
 *  3. Não sugere horário que já esteja ocupado por uma reunião do mesmo monitor
 *     (mesma regra de conflito do EventFormModal: só reunião ocupa horário).
 *  4. No máximo MAX_POR_DIA_POR_MONITOR por dia por monitor.
 *  5. Cliente com reunião futura já marcada não entra (já está coberto).
 *  6. Sem teto de quantidade total — sugere todo cliente da fila que couber
 *     num slot livre da janela (usado agora direto no calendário, não numa
 *     lista curta — o teto antigo de 8 não faz mais sentido).
 *
 * `opcoes.dias`/`opcoes.max` continuam existindo só como override de teste
 * (determinismo/isolamento) — o uso em produção (`AgendaPage`) nunca os passa.
 */
export function sugerirAgenda(
  clientes: Cliente[],
  agenda: EventoAgenda[],
  acoes: Acao[],
  cadencias: Cadencias,
  opcoes: { dias?: number; max?: number; agora?: Date } = {}
): SugestaoSlot[] {
  const agora = opcoes.agora ?? new Date();
  const maxSugestoes = opcoes.max ?? Infinity;

  const fila = buildFilaCadencia(clientes, agenda, acoes, cadencias, agora)
    .filter((f) => f.precisaAcao)
    // Já tem reunião futura marcada? Então não precisa de sugestão.
    .filter((f) => !f.relogios.some((r) => r.proximo !== null));

  // Ocupação existente: "dia|hora|monitor" -> ocupado (só reuniões contam).
  const ocupados = new Set<string>();
  // Quantas reuniões cada monitor já tem por dia (inclui as que sugerirmos).
  const cargaPorDia = new Map<string, number>();
  // Idem, mas por turno ("dia|monitor|manha"/"...|tarde") — usado só pra
  // decidir qual turno tentar primeiro (ver `ordenarHorarios` abaixo), pra não
  // empilhar tudo de manhã antes de cogitar a tarde. Só conta reunião com
  // horário definido (sem `time` não dá pra saber o turno).
  const cargaPorTurno = new Map<string, number>();

  for (const e of agenda) {
    if (!/reuni/i.test(e.type || '') || naoOcupa(e)) continue;
    const d = e.date ? new Date(e.date) : null;
    if (!d || isNaN(d.getTime())) continue;
    const monitoresEv = e.monitores && e.monitores.length > 0 ? e.monitores : [''];
    monitoresEv.forEach((mon) => {
      const diaKey = format(d, 'yyyy-MM-dd');
      const chaveDia = `${diaKey}|${mon}`;
      cargaPorDia.set(chaveDia, (cargaPorDia.get(chaveDia) ?? 0) + 1);
      if (e.time) {
        ocupados.add(`${diaKey}|${e.time}|${mon}`);
        const chaveTurno = `${diaKey}|${mon}|${turnoDaHora(e.time)}`;
        cargaPorTurno.set(chaveTurno, (cargaPorTurno.get(chaveTurno) ?? 0) + 1);
      }
    });
  }

  // Tenta primeiro o turno com menos reuniões (real + já sugerida) pro
  // dia/monitor em questão — distribui manhã/tarde em vez de sempre encher
  // 09:00/10:30 antes de cogitar a tarde.
  function ordenarHorarios(diaKey: string, monitor: string): string[] {
    const cargaManha = cargaPorTurno.get(`${diaKey}|${monitor}|manha`) ?? 0;
    const cargaTarde = cargaPorTurno.get(`${diaKey}|${monitor}|tarde`) ?? 0;
    const porTurno = { manha: HORARIOS.filter((h) => turnoDaHora(h) === 'manha'), tarde: HORARIOS.filter((h) => turnoDaHora(h) === 'tarde') };
    return cargaTarde < cargaManha ? [...porTurno.tarde, ...porTurno.manha] : [...porTurno.manha, ...porTurno.tarde];
  }

  // Dias úteis candidatos: amanhã até o fim do mês corrente — a não ser que o
  // teste peça uma janela fixa (`opcoes.dias`), pra isolar cenários.
  let diasUteis: Date[];
  if (opcoes.dias != null) {
    diasUteis = [];
    for (let i = 1; i <= opcoes.dias && diasUteis.length < opcoes.dias; i++) {
      const d = startOfDay(addDays(agora, i));
      if (isBusinessDay(d)) diasUteis.push(d);
    }
  } else {
    diasUteis = diasUteisAteFimDoMes(agora);
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
      const diaKey = format(dia, 'yyyy-MM-dd');
      const chaveDia = `${diaKey}|${monitor}`;
      if ((cargaPorDia.get(chaveDia) ?? 0) >= MAX_POR_DIA_POR_MONITOR) continue;
      for (const hora of ordenarHorarios(diaKey, monitor)) {
        if (ocupados.has(`${diaKey}|${hora}|${monitor}`)) continue;
        out.push({
          cliente: item.cliente,
          motivo: rotuloRelogio(pior),
          servico: pior.servico,
          dia,
          hora,
          monitor,
        });
        // Reserva o slot para as próximas iterações não sugerirem o mesmo.
        ocupados.add(`${diaKey}|${hora}|${monitor}`);
        cargaPorDia.set(chaveDia, (cargaPorDia.get(chaveDia) ?? 0) + 1);
        const chaveTurno = `${diaKey}|${monitor}|${turnoDaHora(hora)}`;
        cargaPorTurno.set(chaveTurno, (cargaPorTurno.get(chaveTurno) ?? 0) + 1);
        alocado = true;
        break;
      }
    }
  }
  return out;
}
