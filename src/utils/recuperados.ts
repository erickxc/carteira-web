import { differenceInCalendarDays, parseISO } from 'date-fns';
import { isStatusAtivo } from './formatters';
import type { Cliente, EventoAgenda } from '../types';
import type { Janela } from './periodo';

/** Hiato mínimo para considerar que o cliente estava parado (2 meses). */
export const LIMIAR_RECUPERACAO_DIAS = 60;

export interface ClienteRecuperado {
  cliente: Cliente;
  /** Dias que o cliente passou sem nenhuma entrega antes de ser recuperado. */
  diasParado: number;
  /** Data da última entrega antes do hiato (null quando nunca houve nenhuma). */
  ultimaAntes: Date | null;
  /** A entrega que recuperou o cliente. */
  entrega: {
    tipo: string;
    data: Date;
    /** false = está marcada para o futuro (recuperação ainda por acontecer). */
    jaAconteceu: boolean;
  };
  /** 'hiato' = ficou parado depois de já ter sido atendido; 'nunca' = primeira entrega. */
  motivo: 'hiato' | 'nunca';
}

const ehEntrega = (e: EventoAgenda) => /reuni|relat/i.test(e.type || '');
/** Cancelado/reagendado não conta: o encontro não existiu nem vai existir. */
const vale = (e: EventoAgenda) => !/cancel|reagend/i.test(e.status || '');

function dataDe(e: EventoAgenda): Date | null {
  if (!e.date) return null;
  const d = parseISO(e.date);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Clientes RECUPERADOS: estavam há >= 60 dias sem nenhuma entrega (reunião ou
 * relatório) e voltaram a ter uma — já realizada ou marcada para o futuro.
 *
 * Como é detectado: as entregas de cada cliente são ordenadas por data e o
 * algoritmo procura um "salto" de 60+ dias entre uma entrega e a seguinte. A
 * entrega que fecha esse salto é a recuperação; ela precisa cair dentro da
 * janela analisada (senão uma recuperação de um ano atrás apareceria como se
 * fosse de agora).
 *
 * Dois casos contam como recuperação:
 *  - 'hiato': já tinha sido atendido, parou por 60+ dias e voltou;
 *  - 'nunca': nunca teve entrega e a primeira aparece agora — só conta se o
 *    cadastro tem mais de 60 dias, senão todo cliente novo entraria na lista
 *    (é atendimento inicial, não recuperação).
 *
 * Entrega futura marcada conta (`jaAconteceu: false`): o objetivo do indicador é
 * mostrar reengajamento, e marcar a reunião já é o reengajamento — mas a tela
 * diferencia as duas situações para não parecer que já foi entregue.
 *
 * Só clientes ativos entram (suspenso/inativo não é recuperação real).
 */
export function calcularRecuperados(
  clientes: Cliente[],
  agenda: EventoAgenda[],
  janela: Janela,
  agora: Date = new Date(),
  limiarDias: number = LIMIAR_RECUPERACAO_DIAS
): ClienteRecuperado[] {
  const porCliente = new Map<string, EventoAgenda[]>();
  for (const e of agenda) {
    if (!e.clientId || !ehEntrega(e) || !vale(e)) continue;
    if (!porCliente.has(e.clientId)) porCliente.set(e.clientId, []);
    porCliente.get(e.clientId)!.push(e);
  }

  const dentro = (d: Date) => {
    if (!janela.inicio && !janela.fim) return true;
    if (janela.inicio && d < janela.inicio) return false;
    if (janela.fim && d > janela.fim) return false;
    return true;
  };

  const out: ClienteRecuperado[] = [];

  for (const c of clientes) {
    if (!isStatusAtivo(c.status)) continue;

    const entregas = (porCliente.get(c.id) ?? [])
      .map((e) => ({ ev: e, d: dataDe(e)! }))
      .filter((x) => x.d)
      .sort((a, b) => a.d.getTime() - b.d.getTime());

    if (entregas.length === 0) continue;

    // Melhor candidata: a recuperação mais recente dentro da janela.
    let achado: ClienteRecuperado | null = null;

    for (let i = 0; i < entregas.length; i++) {
      const atual = entregas[i];
      if (!dentro(atual.d)) continue;

      const anterior = i > 0 ? entregas[i - 1] : null;
      let diasParado: number;
      let motivo: 'hiato' | 'nunca';

      if (anterior) {
        diasParado = differenceInCalendarDays(atual.d, anterior.d);
        motivo = 'hiato';
      } else {
        // Primeira entrega da história do cliente: o "parado" conta desde o
        // cadastro, não desde sempre.
        const criado = c.createdAt ? parseISO(c.createdAt) : null;
        if (!criado || isNaN(criado.getTime())) continue;
        diasParado = differenceInCalendarDays(atual.d, criado);
        motivo = 'nunca';
      }

      if (diasParado < limiarDias) continue;

      achado = {
        cliente: c,
        diasParado,
        ultimaAntes: anterior?.d ?? null,
        entrega: { tipo: atual.ev.type || 'Reunião', data: atual.d, jaAconteceu: atual.d <= agora },
        motivo,
      };
    }

    if (achado) out.push(achado);
  }

  // Mais recente primeiro — é a leitura útil ("o que foi recuperado agora").
  return out.sort((a, b) => b.entrega.data.getTime() - a.entrega.data.getTime());
}
