import { differenceInCalendarDays, eachDayOfInterval, endOfMonth, parseISO, startOfMonth, subDays } from 'date-fns';
import { contatoRecenteNaoRefletido, ehConcluido } from './cadenciaServico';
import type { LinhaAtendimento } from './indicadoresPrazo';
import { isBusinessDay } from './holidays';
import type { Acao, Cliente, EventoAgenda } from '../types';

/** Janela dos rankings de análise (esforço, cancelamentos). */
export const DIAS_ANALISE = 90;

const ehReuniao = (e: EventoAgenda) => /reuni/i.test(e.type || '');

/** O que os cards de volume contam: toda entrega (reunião, relatório, precificação) ou só reunião. */
export type ModoContagem = 'entregas' | 'reunioes';
export const contaNoModo = (e: { type?: string }, modo: ModoContagem) =>
  (modo === 'reunioes' ? /reuni/i : /reuni|relat|precific/i).test(e.type || '');
/** Nome do que está sendo contado, para os títulos dos cards. */
export const rotuloModo = (modo: ModoContagem) =>
  modo === 'reunioes'
    ? { plural: 'reuniões', Plural: 'Reuniões', singular: 'reunião' }
    : { plural: 'entregas', Plural: 'Entregas', singular: 'entrega' };
const ehCancelado = (e: EventoAgenda) => /cancel/i.test(e.status || '');
const dataDe = (iso: string | undefined) => {
  if (!iso) return null;
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? null : d;
};
const naJanela = (d: Date | null, inicio: Date, fim: Date) => !!d && d >= inicio && d <= fim;

// ---------------------------------------------------------------------------
// Esforço por atendimento (dimensionamento)
// ---------------------------------------------------------------------------

export interface EsforcoAtendimento { id: string; nome: string; reuniao: number; contato: number; precificacao: number; total: number }

/**
 * Onde vai o trabalho: reuniões, contatos e precificações CONCLUÍDOS por
 * atendimento nos últimos 90 dias — eventos da agenda + ações registradas.
 * Relatório de Monitoria fica fora: é recorrente (semanal, automático) e
 * dominaria o ranking de quem só recebe relatório. Relatório com Precificação é
 * entrega de Price feita pelo monitor e conta como precificação.
 */
export function esforcoPorAtendimento(ativos: Cliente[], agenda: EventoAgenda[], acoes: Acao[], agora: Date): EsforcoAtendimento[] {
  const inicio = subDays(agora, DIAS_ANALISE);
  const por = new Map<string, EsforcoAtendimento>(ativos.map((c) => [c.id, { id: c.id, nome: c.empresa, reuniao: 0, contato: 0, precificacao: 0, total: 0 }]));
  for (const e of agenda) {
    const x = por.get(e.clientId);
    const relatorioDePreco = /relat/i.test(e.type) && (e.servicos ?? []).some((s) => /prec|price/i.test(s));
    if (!x || !ehConcluido(e) || (/relat/i.test(e.type) && !relatorioDePreco) || !naJanela(dataDe(e.date), inicio, agora)) continue;
    if (ehReuniao(e)) x.reuniao++;
    else if (/precific/i.test(e.type) || relatorioDePreco) x.precificacao++;
    else x.contato++;
  }
  for (const a of acoes) {
    const x = por.get(a.clientId);
    if (!x || a.status !== 'concluido' || a.tipo === 'relatorio' || !naJanela(dataDe(a.dueAt || a.createdAt), inicio, agora)) continue;
    if (a.tipo === 'price') x.precificacao++;
    else x.contato++;
  }
  return [...por.values()]
    .map((x) => ({ ...x, total: x.reuniao + x.contato + x.precificacao }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

// ---------------------------------------------------------------------------
// Cancelamentos por atendimento
// ---------------------------------------------------------------------------

export interface CancelamentoAtendimento { id: string; nome: string; canceladas: number; comDesfecho: number; ultima: Date | null }
export interface Cancelamentos { itens: CancelamentoAtendimento[]; canceladas: number; comDesfecho: number }

/** Canceladas nos últimos 90 dias, por atendimento, sobre as com desfecho (realizada ou cancelada), no modo escolhido. */
export function cancelamentosPorAtendimento(ativos: Cliente[], agenda: EventoAgenda[], agora: Date, modo: ModoContagem = 'reunioes'): Cancelamentos {
  const inicio = subDays(agora, DIAS_ANALISE);
  const nomes = new Map(ativos.map((c) => [c.id, c.empresa]));
  const por = new Map<string, CancelamentoAtendimento>();
  let canceladas = 0;
  let comDesfecho = 0;
  for (const e of agenda) {
    const d = dataDe(e.date);
    if (!nomes.has(e.clientId) || !contaNoModo(e, modo) || !naJanela(d, inicio, agora)) continue;
    const cancelada = ehCancelado(e);
    if (!cancelada && !ehConcluido(e)) continue;
    comDesfecho++;
    const x = por.get(e.clientId) ?? { id: e.clientId, nome: nomes.get(e.clientId)!, canceladas: 0, comDesfecho: 0, ultima: null };
    x.comDesfecho++;
    if (cancelada) {
      canceladas++;
      x.canceladas++;
      if (!x.ultima || d! > x.ultima) x.ultima = d;
    }
    por.set(e.clientId, x);
  }
  const itens = [...por.values()].filter((x) => x.canceladas > 0)
    .sort((a, b) => b.canceladas - a.canceladas || +b.ultima! - +a.ultima!);
  return { itens, canceladas, comDesfecho };
}

// ---------------------------------------------------------------------------
// Reuniões por dia (calendário do mês)
// ---------------------------------------------------------------------------

/** `n` = realizadas + marcadas (ocupam agenda); `canceladas` à parte. */
export interface DiaReunioes { data: Date; n: number; canceladas: number; util: boolean }
export interface ReunioesPorDia {
  dias: DiaReunioes[];
  mediaPorDiaUtil: number;
  /** Mês inteiro contando as marcadas nos dias que faltam; null quando o mês já acabou (seria igual à média). */
  projecaoPorDiaUtil: number | null;
  pico: DiaReunioes | null;
  diasUteis: number;
  diasVazios: number;
  canceladas: number;
}

/**
 * Reuniões por dia do mês — realizadas e marcadas ocupam a agenda; canceladas
 * vêm à parte (um dia vazio pode ser um dia de cancelamentos). Média e "dias
 * vazios" contam só dias úteis até hoje (o futuro ainda vai encher).
 */
export function reunioesPorDia(agenda: EventoAgenda[], mes: Date, agora: Date, modo: ModoContagem = 'reunioes'): ReunioesPorDia {
  const contagem = new Map<string, number>();
  const cancel = new Map<string, number>();
  for (const e of agenda) {
    if (!contaNoModo(e, modo) || /reagend/i.test(e.status || '')) continue;
    const d = dataDe(e.date);
    if (!d) continue;
    const alvo = ehCancelado(e) ? cancel : contagem;
    const k = d.toDateString();
    alvo.set(k, (alvo.get(k) ?? 0) + 1);
  }
  const dias = eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) })
    .map((data) => ({ data, n: contagem.get(data.toDateString()) ?? 0, canceladas: cancel.get(data.toDateString()) ?? 0, util: isBusinessDay(data) }));
  const uteis = dias.filter((d) => d.util);
  const passados = uteis.filter((d) => differenceInCalendarDays(d.data, agora) <= 0);
  const total = passados.reduce((s, d) => s + d.n, 0);
  const pico = dias.reduce<DiaReunioes | null>((m, d) => (d.n > 0 && (!m || d.n > m.n) ? d : m), null);
  return {
    dias,
    mediaPorDiaUtil: passados.length ? total / passados.length : 0,
    projecaoPorDiaUtil: passados.length < uteis.length && uteis.length > 0 ? uteis.reduce((s, d) => s + d.n, 0) / uteis.length : null,
    pico,
    diasUteis: passados.length,
    diasVazios: passados.filter((d) => d.n === 0).length,
    canceladas: dias.reduce((s, d) => s + d.canceladas, 0),
  };
}

/** Fim de cada um dos últimos `n` meses (o mês corrente termina hoje). */
export function finsDeMes(agora: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const fim = endOfMonth(new Date(agora.getFullYear(), agora.getMonth() - (n - 1 - i), 1));
    return fim > agora ? agora : fim;
  });
}

// ---------------------------------------------------------------------------
// Carga por monitor
// ---------------------------------------------------------------------------

export interface CargaMonitor {
  monitor: string;
  /** Atendimentos ativos com o monitor no cadastro. */
  atendimentos: number;
  /** Atendimentos com algum prazo vencido ou nunca entregue, hoje (um atrasado nos dois conta 1). */
  atrasados: number;
  /** Atendimentos da carteira com o prazo daquele serviço vencido ou nunca entregue, hoje. */
  atrasadosMonitoria: number;
  atrasadosPrice: number;
  /** Dos atrasados, os que já tiveram contato concluído na janela de recontato: esperando o cliente responder. */
  aguardandoRetorno: number;
  /** Reuniões (ou entregas, no modo entregas) concluídas no mês feitas pelo monitor. */
  reunioes: number;
  /** Entregas de Monitoria: reuniões com o serviço Monitoria. */
  monitoria: number;
  /** Entregas de Price: reuniões com Price + eventos de Precificação concluídos. */
  price: number;
  relatorios: number;
  canceladas: number;
}

const vazio = (monitor: string): CargaMonitor => ({ monitor, atendimentos: 0, atrasados: 0, atrasadosMonitoria: 0, atrasadosPrice: 0, aguardandoRetorno: 0, reunioes: 0, monitoria: 0, price: 0, relatorios: 0, canceladas: 0 });
const atrasado = (r?: { statusReal: string }) => r?.statusReal === 'vencido' || r?.statusReal === 'nunca';

/**
 * Carga por monitor no mês de `periodo` até `ref`, em duas partes:
 * - carteira (atendimentos, atrasados): atendimentos ATIVOS, pelo monitor do cadastro;
 * - produção (reuniões, entregas, relatórios, canceladas): QUEM FEZ — os monitores
 *   do evento, em qualquer cliente (reunião com cliente inativo também é trabalho
 *   feito). Evento sem monitor cai no monitor do cadastro do cliente.
 * Reunião com dois serviços conta nas duas colunas; com dois monitores, para os dois.
 */
export function cargaPorMonitor(
  ativos: Cliente[],
  clientes: Cliente[],
  linhas: Map<string, LinhaAtendimento>,
  agenda: EventoAgenda[],
  acoes: Acao[],
  periodo: Date,
  ref: Date,
  /** Janela "Aguardando retorno" (Cadências → recontato_dias). */
  recontatoDias: number,
  modo: ModoContagem = 'reunioes',
): CargaMonitor[] {
  const inicio = startOfMonth(periodo);
  const fim = endOfMonth(periodo) < ref ? endOfMonth(periodo) : ref;
  const por = new Map<string, CargaMonitor>();
  const de = (m: string) => { const x = por.get(m) ?? vazio(m); por.set(m, x); return x; };
  const cadastro = new Map(clientes.map((c) => [c.id, c.monitor || 'Sem monitor']));

  for (const c of ativos) {
    const x = de(c.monitor || 'Sem monitor');
    x.atendimentos++;
    const l = linhas.get(c.id);
    const rel = l ? Object.values(l.relogios).filter((r) => r !== undefined) : [];
    const atrasadoM = atrasado(rel.find((r) => r.servico === 'Monitoria'));
    const atrasadoP = atrasado(rel.find((r) => r.servico === 'Price'));
    if (atrasadoM || atrasadoP) x.atrasados++;
    if (atrasadoM) x.atrasadosMonitoria++;
    if (atrasadoP) x.atrasadosPrice++;
    // Mesma regra do grupo "contato recente" do card Ritmo.
    const uc = l?.ultimoContato ?? null;
    if ((atrasadoM || atrasadoP) && uc && contatoRecenteNaoRefletido(rel, uc) && differenceInCalendarDays(ref, uc) <= recontatoDias) x.aguardandoRetorno++;
  }

  const quemFez = (monitores: string[] | undefined, clientId: string) =>
    monitores && monitores.length ? monitores : [cadastro.get(clientId) ?? 'Sem monitor'];
  for (const e of agenda) {
    if (!naJanela(dataDe(e.date), inicio, fim)) continue;
    const servicos = (e.servicos ?? []).join(' ');
    for (const m of quemFez(e.monitores, e.clientId)) {
      const x = de(m);
      if (ehConcluido(e) && /relat/i.test(e.type || '')) x.relatorios++;
      if (!contaNoModo(e, modo)) continue;
      if (ehCancelado(e)) { x.canceladas++; continue; }
      if (!ehConcluido(e)) continue;
      x.reunioes++;
      if (/monitor/i.test(servicos)) x.monitoria++;
      if (/prec|price/i.test(servicos) || /precific/i.test(e.type || '')) x.price++;
    }
  }
  for (const a of acoes) {
    if (a.status !== 'concluido' || !naJanela(dataDe(a.dueAt || a.createdAt), inicio, fim)) continue;
    const x = de(a.monitor || cadastro.get(a.clientId) || 'Sem monitor');
    if (a.tipo === 'relatorio') x.relatorios++;
    // No modo entregas, a ação de Price/relatório concluída também é entrega.
    if (modo === 'entregas' && (a.tipo === 'relatorio' || a.tipo === 'price')) {
      x.reunioes++;
      if (a.tipo === 'price') x.price++; else x.monitoria++;
    }
  }
  // Só quem tem carteira ou produção no mês (evita linha zerada de monitor antigo).
  return [...por.values()]
    .filter((x) => x.atendimentos > 0 || x.reunioes > 0 || x.canceladas > 0)
    .sort((a, b) => b.atendimentos - a.atendimentos || a.monitor.localeCompare(b.monitor));
}
