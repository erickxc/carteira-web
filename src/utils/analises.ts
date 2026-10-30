import { differenceInCalendarDays, eachDayOfInterval, endOfMonth, parseISO, startOfMonth, subMonths } from 'date-fns';
import { categoriaCancelamento, contatoRecenteNaoRefletido, ehAvisoDeCancelamento, ehConcluido, type CategoriaCancelamento } from './cadenciaServico';
import type { LinhaAtendimento } from './indicadoresPrazo';
import { isBusinessDay } from './holidays';
import type { Acao, Cliente, EventoAgenda } from '../types';

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
/** Errata/duplicado: o evento nunca deveria ter existido — fora de toda conta. */
export const ehLancamentoErrado = (e: EventoAgenda) => categoriaCancelamento(e) === 'lancamento_errado';
const dataDe = (iso: string | undefined) => {
  if (!iso) return null;
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? null : d;
};
const naJanela = (d: Date | null, inicio: Date, fim: Date) => !!d && d >= inicio && d <= fim;

// ---------------------------------------------------------------------------
// Difíceis de marcar
// ---------------------------------------------------------------------------

export interface DificilDeMarcar { id: string; nome: string; tentativas: number; entregas: number }

/**
 * Quem mais exigiu tentativa de contato por entrega feita nos últimos `meses`
 * meses que terminam em `agora` (1 = só o mês de referência, do dia 1 até `agora`). Substitui o antigo "Onde vai o esforço":
 * dos contatos concluídos, 2/3 eram tentativa de marcar reunião, então o
 * ranking de "quem mais pediu trabalho" era, na prática, quem mais demos
 * trabalho para marcar — este card assume isso.
 *
 * Tentativa = contato/ligação concluído que partiu de nós (origem 'cliente'
 * não é tentativa; aviso de cancelamento também não) + ação de contato
 * concluída. Ações do mesmo atendimento no mesmo dia contam uma vez, e não
 * contam se o dia já tem contato na agenda (o mesmo contato registrado duas vezes).
 * Entrega = reunião ou precificação concluída (relatório com Precificação conta).
 */
export function dificeisDeMarcar(ativos: Cliente[], agenda: EventoAgenda[], acoes: Acao[], agora: Date, meses = 1): DificilDeMarcar[] {
  const inicio = startOfMonth(subMonths(agora, meses - 1));
  const por = new Map<string, DificilDeMarcar>(ativos.map((c) => [c.id, { id: c.id, nome: c.empresa, tentativas: 0, entregas: 0 }]));
  const diasComContato = new Set<string>();
  for (const e of agenda) {
    const x = por.get(e.clientId);
    const d = dataDe(e.date);
    if (!x || !ehConcluido(e) || !naJanela(d, inicio, agora)) continue;
    const relatorioDePreco = /relat/i.test(e.type) && (e.servicos ?? []).some((s) => /prec|price/i.test(s));
    if (ehReuniao(e) || /precific/i.test(e.type) || relatorioDePreco) x.entregas++;
    else if (/contato|liga/i.test(e.type) && e.origem !== 'cliente' && !ehAvisoDeCancelamento(e)) {
      x.tentativas++;
      diasComContato.add(`${e.clientId}|${d!.toDateString()}`);
    }
  }
  for (const a of acoes) {
    const x = por.get(a.clientId);
    const d = dataDe(a.dueAt || a.createdAt);
    if (!x || a.status !== 'concluido' || a.tipo !== 'contato' || !naJanela(d, inicio, agora)) continue;
    const dia = `${a.clientId}|${d!.toDateString()}`;
    if (diasComContato.has(dia)) continue;
    diasComContato.add(dia);
    x.tentativas++;
  }
  return [...por.values()]
    .filter((x) => x.tentativas > 0)
    .sort((a, b) => b.tentativas - a.tentativas || a.entregas - b.entregas || a.nome.localeCompare(b.nome));
}

// ---------------------------------------------------------------------------
// Cancelamentos por atendimento
// ---------------------------------------------------------------------------

export interface CancelamentoAtendimento { id: string; nome: string; canceladas: number; ultima: Date | null }
export type CategoriaContada = Exclude<CategoriaCancelamento, 'lancamento_errado'> | 'sem_categoria';
export interface Cancelamentos {
  /** Atendimentos com cancelamento do lado do cliente (cancelou ou não apareceu). */
  itens: CancelamentoAtendimento[];
  /** Cancelou + não apareceu/não respondeu: o número do card. */
  doCliente: number;
  porCategoria: Record<CategoriaContada, number>;
  /** Realizadas + canceladas (sem lançamento errado). */
  comDesfecho: number;
  /** Lançamentos errados no mês — fora da conta, só informados. */
  lancamentosErrados: number;
}

const DO_CLIENTE = new Set<string>(['cliente_cancelou', 'cliente_ausente']);

/**
 * Cancelamentos no mês de referência (do dia 1 até `agora`), por quem
 * cancelou. Só o lado do cliente vira ranking; o que nós cancelamos e o
 * legado sem motivo aparecem na quebra, e lançamento errado sai da conta.
 */
/** `clientes` = os do monitor em qualquer situação de cadastro: cancelamento é fato do mês. */
export function cancelamentosPorAtendimento(clientes: Cliente[], agenda: EventoAgenda[], agora: Date, modo: ModoContagem = 'reunioes'): Cancelamentos {
  const inicio = startOfMonth(agora);
  const nomes = new Map(clientes.map((c) => [c.id, c.empresa]));
  const por = new Map<string, CancelamentoAtendimento>();
  const porCategoria: Record<CategoriaContada, number> = { cliente_cancelou: 0, cliente_ausente: 0, nos_cancelamos: 0, sem_categoria: 0 };
  let doCliente = 0, comDesfecho = 0, lancamentosErrados = 0;
  for (const e of agenda) {
    const d = dataDe(e.date);
    if (!nomes.has(e.clientId) || !contaNoModo(e, modo) || !naJanela(d, inicio, agora)) continue;
    const categoria = categoriaCancelamento(e);
    if (categoria === 'lancamento_errado') { lancamentosErrados++; continue; }
    if (!categoria && !ehConcluido(e)) continue;
    comDesfecho++;
    if (!categoria) continue;
    porCategoria[categoria]++;
    if (!DO_CLIENTE.has(categoria)) continue;
    doCliente++;
    const x = por.get(e.clientId) ?? { id: e.clientId, nome: nomes.get(e.clientId)!, canceladas: 0, ultima: null };
    x.canceladas++;
    if (!x.ultima || d! > x.ultima) x.ultima = d;
    por.set(e.clientId, x);
  }
  const itens = [...por.values()].sort((a, b) => b.canceladas - a.canceladas || +b.ultima! - +a.ultima!);
  return { itens, doCliente, porCategoria, comDesfecho, lancamentosErrados };
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
    if (!contaNoModo(e, modo) || /reagend/i.test(e.status || '') || ehLancamentoErrado(e)) continue;
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
      if (ehLancamentoErrado(e)) continue;
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
