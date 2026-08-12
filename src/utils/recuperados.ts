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
  /**
   * A entrega CONCLUÍDA que recuperou o cliente.
   * `monitor` é quem de fato fez a entrega (monitor do EVENTO), não o monitor
   * cadastrado no cliente: a carteira pode estar com um monitor e o atendimento
   * ter sido feito por outro — mostrar o do cliente atribuía a reunião à pessoa
   * errada. Cai no monitor do cliente só quando o evento não tem monitor
   * informado (registros antigos).
   */
  entrega: { tipo: string; data: Date; monitor: string };
  /** 'hiato' = ficou parado depois de já ter sido atendido; 'nunca' = primeira entrega. */
  motivo: 'hiato' | 'nunca';
}

/**
 * Só eventos da AGENDA do tipo Reunião ou Relatório. Lembrete nunca entra aqui:
 * lembrete é um aviso interno (nem chega ao cliente), então não comprova
 * atendimento nenhum.
 */
const ehEntrega = (e: EventoAgenda) => /reuni|relat/i.test(e.type || '');
/**
 * Só CONCLUÍDO/REALIZADO conta como recuperação.
 *
 * Antes bastava a entrega não estar cancelada — o que incluía reunião apenas
 * marcada (status Agendado, inclusive no futuro). Isso tornava o indicador
 * potencialmente falso: marcar a reunião não é o cliente recuperado, e se ela
 * fosse desmarcada depois o cliente seguia contado como recuperado.
 */
const vale = (e: EventoAgenda) => /conclu|realiz/i.test(e.status || '');

function dataDe(e: EventoAgenda): Date | null {
  if (!e.date) return null;
  const d = parseISO(e.date);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Clientes RECUPERADOS: estavam há >= 60 dias sem nenhuma entrega (reunião ou
 * relatório) e voltaram a ser atendidos DE FATO — só entrega concluída conta.
 *
 * Como é detectado: as entregas concluídas de cada cliente são ordenadas por
 * data e o algoritmo procura um "salto" de 60+ dias entre uma e a seguinte. A
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
 * Fora da conta: lembretes (aviso interno, não é atendimento) e entrega apenas
 * agendada, mesmo futura — reunião marcada pode ser desmarcada, e o indicador
 * ficaria afirmando uma recuperação que não aconteceu.
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
    // Data futura marcada como concluída é inconsistência de cadastro; ignorar
    // evita afirmar uma recuperação que ainda não ocorreu.
    const d = dataDe(e);
    if (!d || d > agora) continue;
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
        entrega: {
          tipo: atual.ev.type || 'Reunião',
          data: atual.d,
          monitor: atual.ev.monitor || c.monitor || '',
        },
        motivo,
      };
    }

    if (achado) out.push(achado);
  }

  // Mais recente primeiro — é a leitura útil ("o que foi recuperado agora").
  return out.sort((a, b) => b.entrega.data.getTime() - a.entrega.data.getTime());
}

export interface AindaSemAtendimento {
  cliente: Cliente;
  /** Dias desde a última entrega concluída (null = nunca teve nenhuma). */
  diasSemEntrega: number | null;
}

/**
 * Clientes que CONTINUAM parados: elegíveis a atendimento e sem nenhuma entrega
 * concluída nos últimos `limiarDias`. É o contraponto do número de recuperados
 * — sem ele, "5 recuperados" não diz se sobraram 2 ou 30 para recuperar.
 *
 * Elegível = status ativo (ou gratuidade). Suspenso, Problemas Externos e
 * Atendido pelo Marco ficam fora: em nenhum dos três a falta de reunião é um
 * problema a cobrar da equipe. `isStatusAtivo` já implementa esse corte (casa
 * apenas com "ativo"/"gratuidade"), então a regra não é duplicada aqui.
 */
export function calcularAindaSemAtendimento(
  clientes: Cliente[],
  agenda: EventoAgenda[],
  agora: Date = new Date(),
  limiarDias: number = LIMIAR_RECUPERACAO_DIAS
): AindaSemAtendimento[] {
  const ultimaPorCliente = new Map<string, Date>();
  for (const e of agenda) {
    if (!e.clientId || !ehEntrega(e) || !vale(e)) continue;
    const d = dataDe(e);
    if (!d || d > agora) continue;
    const atual = ultimaPorCliente.get(e.clientId);
    if (!atual || d > atual) ultimaPorCliente.set(e.clientId, d);
  }

  const out: AindaSemAtendimento[] = [];
  for (const c of clientes) {
    if (!isStatusAtivo(c.status)) continue;
    const ultima = ultimaPorCliente.get(c.id) ?? null;
    if (!ultima) {
      // Nunca atendido: só conta se o cadastro já passou do limiar (cliente
      // recém-cadastrado ainda está no prazo normal de primeiro atendimento).
      const criado = c.createdAt ? parseISO(c.createdAt) : null;
      if (!criado || isNaN(criado.getTime())) continue;
      if (differenceInCalendarDays(agora, criado) < limiarDias) continue;
      out.push({ cliente: c, diasSemEntrega: null });
      continue;
    }
    const dias = differenceInCalendarDays(agora, ultima);
    if (dias >= limiarDias) out.push({ cliente: c, diasSemEntrega: dias });
  }

  // Mais tempo parado primeiro (nunca atendido no topo).
  return out.sort((a, b) => (b.diasSemEntrega ?? Infinity) - (a.diasSemEntrega ?? Infinity));
}
