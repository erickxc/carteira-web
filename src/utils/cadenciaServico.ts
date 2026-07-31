import { differenceInCalendarDays, parseISO } from 'date-fns';
import { isStatusAtivo } from './formatters';
import { buildUltimaInteracaoMap } from './ultimaInteracao';
import type { Acao, Cadencias, Cliente, EventoAgenda, RelatorioCadencia } from '../types';

export type ServicoCad = 'Monitoria' | 'Price' | 'Relatório';
export type CadStatus = 'coberto' | 'em_dia' | 'vencendo' | 'vencido' | 'nunca';

export interface RelogioServico {
  servico: ServicoCad;
  cadencia: number;
  ultimo: Date | null;
  proximo: Date | null;
  /** dias além da cadência: >0 vencido; <=0 dentro do prazo. */
  atraso: number;
  status: CadStatus;
  /** Status "puro" pela cadência, ignorando agendamento futuro — nunca vira
   * 'coberto'. Usado pelo card "Carteira no Ritmo" do Dashboard, que quer
   * refletir o atraso real de contato mesmo já havendo uma ação marcada. */
  statusReal: Exclude<CadStatus, 'coberto'>;
  atrasoReal: number;
}

export interface FilaCadItem {
  cliente: Cliente;
  relogios: RelogioServico[];
  /** maior = mais urgente (usado para ordenar a fila). */
  score: number;
  /** true se algum relógio pede ação (vencido / vencendo / nunca) e não está coberto. */
  precisaAcao: boolean;
}

/** Dias antes de vencer em que já sinalizamos "vencendo" (amarelo). */
const JANELA_VENCENDO = 5;
/** Peso para colocar "nunca atendido" no topo da fila. */
const PESO_NUNCA = 100000;

function temServico(c: Cliente, re: RegExp, flag: keyof Cliente): boolean {
  return (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[flag]);
}

const naoCancelado = (a: EventoAgenda) => !/cancel|reagend/i.test(a.status || '');

// Zera o relógio de MONITORIA (histórico — o que já foi feito): reunião com
// serviço Monitoria OU sem serviço marcado (legado/monitoria-only presume
// Monitoria — todo histórico de price era tipo Precificação, migrado já
// tagueado como Price, então "sem tag" nunca é price).
function ehToqueMonitoria(a: EventoAgenda): boolean {
  if (!/reuni/i.test(a.type || '')) return false;
  const s = a.servicos ?? [];
  return s.length === 0 || s.some((x) => /monitor/i.test(x));
}

// Zera o relógio de PRICE (histórico): reunião OU relatório com serviço Price marcado.
function ehToquePrice(a: EventoAgenda): boolean {
  if (!/reuni|relat/i.test(a.type || '')) return false;
  return (a.servicos ?? []).some((x) => /(price|prec)/i.test(x));
}

// Zera o relógio de RELATÓRIO (histórico): qualquer evento tipo Relatório —
// diferente de Monitoria/Price, não depende de tag de serviço (o tipo já basta).
function ehToqueRelatorio(a: EventoAgenda): boolean {
  return /relat/i.test(a.type || '');
}

/** Converte a cadência de relatório do cliente (número + unidade) pra um
 * equivalente em dias, pro mesmo cálculo de relógio usado por Monitoria/Price.
 * Sem cadência configurada manualmente, cai no padrão global (`relatorio_dias`)
 * — "calcula pela config padrão a não ser que o usuário mude manualmente". */
function relatorioCadenciaEmDias(rc: RelatorioCadencia | undefined, fallbackDias: number): number {
  if (!rc || !rc.numero || !rc.unidade) return fallbackDias;
  const n = rc.numero;
  switch (rc.unidade) {
    case 'dia': return n;
    case 'semana': return n * 7;
    case 'mes': return n * 30;
    case 'trimestre': return n * 90;
    case 'semestre': return n * 180;
    case 'personalizado': return n * 7;
    default: return fallbackDias;
  }
}

function calcularRelogio(
  servico: ServicoCad,
  eventos: EventoAgenda[],
  ehToque: (a: EventoAgenda) => boolean,
  cadencia: number,
  now: Date,
  proximoGeral: Date | null,
  janelaVencendo: number = JANELA_VENCENDO
): RelogioServico {
  // "Último" = histórico real do serviço (só o que de fato tratou aquele serviço).
  let ultimo: Date | null = null;
  for (const a of eventos) {
    if (!naoCancelado(a) || !ehToque(a)) continue;
    const d = parseISO(a.date);
    if (isNaN(d.getTime()) || d > now) continue;
    if (!ultimo || d > ultimo) ultimo = d;
  }
  // "Próximo" = QUALQUER evento futuro do cliente (não cancelado), independente
  // do tipo/serviço — criar um evento já sinaliza que o monitor está de olho
  // nesse cliente, então cobre o relógio (não precisa ser reunião do serviço certo).
  const proximo = proximoGeral;

  // Status "puro" pela cadência — ignora se já existe agendamento futuro.
  let statusReal: Exclude<CadStatus, 'coberto'>;
  let atrasoReal: number;
  if (!ultimo) {
    statusReal = 'nunca';
    atrasoReal = PESO_NUNCA;
  } else {
    atrasoReal = differenceInCalendarDays(now, ultimo) - cadencia;
    statusReal = atrasoReal > 0 ? 'vencido' : atrasoReal > -janelaVencendo ? 'vencendo' : 'em_dia';
  }

  // Status "operacional" — agendamento futuro cobre o relógio (usado pela
  // fila de Ações: já tem ação marcada, não precisa cobrar de novo).
  let status: CadStatus;
  let atraso: number;
  if (proximo) {
    status = 'coberto';
    atraso = -PESO_NUNCA; // coberto nunca pede ação
  } else {
    status = statusReal;
    atraso = atrasoReal;
  }
  return { servico, cadencia, ultimo, proximo, atraso, status, statusReal, atrasoReal };
}

/** Contato (ou qualquer interação) mais recente que o último toque contado
 * pelos relógios de serviço — sinaliza "já houve ação", mesmo que ela não
 * conte pra cadência oficial de Monitoria/Price (ex.: um Contato leve não
 * reseta o relógio, mas ainda assim já foi feito). Usado pra empurrar o
 * cliente pro fim da própria seção de severidade na fila, e pra destacar
 * visualmente o card (CardCliente). */
export function contatoRecenteNaoRefletido(relogios: RelogioServico[] | undefined, ultimoContato: Date | null): boolean {
  if (!ultimoContato) return false;
  const ultimoToqueRelogio = relogios && relogios.length > 0
    ? Math.max(...relogios.map((r) => r.ultimo?.getTime() ?? 0))
    : 0;
  return ultimoContato.getTime() > ultimoToqueRelogio;
}

const RANK_SEVERIDADE: Record<ClassificacaoCadencia, number> = { vencido: 0, vencendo: 1, em_dia: 2 };

/**
 * Fila de priorização por aderência à cadência de cada serviço. Clientes ativos
 * (fora os do Marco) recebem um "relógio" por serviço contratado (Monitoria/Price);
 * a prioridade é o serviço mais vencido. Ordena do mais urgente para o menos —
 * mas dentro da mesma severidade, quem já teve um contato recente não
 * refletido no relógio (ver `contatoRecenteNaoRefletido`) vai pro fim daquele
 * bloco: já foi tratado, mesmo que a cadência oficial continue vencida.
 */
export function buildFilaCadencia(
  clientes: Cliente[],
  agenda: EventoAgenda[],
  acoes: Acao[],
  cadencias: Cadencias,
  now: Date = new Date()
): FilaCadItem[] {
  const monDias = Number(cadencias?.monitoria_dias) || 30;
  const priceDias = Number(cadencias?.price_dias) || 30;

  const porCliente = new Map<string, EventoAgenda[]>();
  agenda.forEach((a) => {
    if (!porCliente.has(a.clientId)) porCliente.set(a.clientId, []);
    porCliente.get(a.clientId)!.push(a);
  });

  const out: FilaCadItem[] = [];
  for (const c of clientes) {
    if (!isStatusAtivo(c.status) || c.atendidoMarco) continue;
    const evs = porCliente.get(c.id) ?? [];

    // Qualquer evento futuro (não cancelado), de qualquer tipo, cobre o cliente.
    let proximoGeral: Date | null = null;
    for (const a of evs) {
      if (!naoCancelado(a)) continue;
      const d = parseISO(a.date);
      if (isNaN(d.getTime()) || d <= now) continue;
      if (!proximoGeral || d < proximoGeral) proximoGeral = d;
    }

    const relogios: RelogioServico[] = [];
    if (temServico(c, /monitor/i, 'monitoria')) relogios.push(calcularRelogio('Monitoria', evs, ehToqueMonitoria, monDias, now, proximoGeral));
    if (temServico(c, /(price|prec)/i, 'price')) relogios.push(calcularRelogio('Price', evs, ehToquePrice, priceDias, now, proximoGeral));
    if (relogios.length === 0) continue; // sem serviço cadastrado → fora do modelo
    const score = Math.max(...relogios.map((r) => r.atraso));
    const precisaAcao = relogios.some((r) => r.status === 'vencido' || r.status === 'vencendo' || r.status === 'nunca');
    out.push({ cliente: c, relogios, score, precisaAcao });
  }

  const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now });
  return out.sort((a, b) => {
    const rankA = RANK_SEVERIDADE[classificarCadencia(a)];
    const rankB = RANK_SEVERIDADE[classificarCadencia(b)];
    if (rankA !== rankB) return rankA - rankB;
    const ultimoA = ultimaInteracaoMap.get(a.cliente.id) ?? null;
    const ultimoB = ultimaInteracaoMap.get(b.cliente.id) ?? null;
    const recA = contatoRecenteNaoRefletido(a.relogios, ultimoA);
    const recB = contatoRecenteNaoRefletido(b.relogios, ultimoB);
    if (recA !== recB) return recA ? 1 : -1;
    // Dentro do mesmo bloco "tem contato recente": compara a data mais recente
    // de cada cliente (posição [0] depois de ordenar) direto entre os dois —
    // quem foi contatado há mais tempo fica primeiro, quem acabou de ser
    // contatado agora vai pro fim. Sem contato recente: mantém o score de
    // cadência (atraso), que já reflete a urgência real.
    if (recA && recB) return (ultimoA?.getTime() ?? 0) - (ultimoB?.getTime() ?? 0);
    return b.score - a.score;
  });
}

export interface VencendoDashboardItem {
  cliente: Cliente;
  relogios: RelogioServico[];
}

// Evento que "conta" pra cobertura (próximo compromisso) desta régua — só
// Reunião ou Relatório. Contato/Ligação não contam como agendamento que
// resolve a cadência de Monitoria/Price/Relatório (diferente de
// buildFilaCadencia, que aceita qualquer tipo de evento como cobertura).
const ehEventoRelevanteVencendo = (a: EventoAgenda) => /reuni|relat/i.test(a.type || '');

/**
 * Cálculo PRÓPRIO pro card "Vencendo" do Dashboard — não estende
 * `buildFilaCadencia` de propósito: ali só entram clientes com Monitoria ou
 * Price cadastrado; se Relatório virasse um relógio ali, TODO cliente ativo
 * passaria a aparecer na fila de Ações (efeito colateral não pedido). Aqui,
 * todo cliente ativo (fora Marco) sempre ganha um relógio de Relatório (pela
 * cadência configurada, ou o padrão global), além de Monitoria/Price quando
 * aplicável. Janela de "vencendo" de 5 dias, igual à usada em Ações
 * (`JANELA_VENCENDO`, inalterada — este é um cálculo próprio, não a mesma
 * constante, mas o mesmo valor).
 */
export function buildVencendoDashboard(
  clientes: Cliente[],
  agenda: EventoAgenda[],
  cadencias: Cadencias,
  now: Date = new Date(),
  janelaVencendo = 5
): VencendoDashboardItem[] {
  const monDias = Number(cadencias?.monitoria_dias) || 30;
  const priceDias = Number(cadencias?.price_dias) || 30;
  const relatorioDiasPadrao = Number(cadencias?.relatorio_dias) || 45;

  const porCliente = new Map<string, EventoAgenda[]>();
  agenda.forEach((a) => {
    if (!porCliente.has(a.clientId)) porCliente.set(a.clientId, []);
    porCliente.get(a.clientId)!.push(a);
  });

  const out: VencendoDashboardItem[] = [];
  for (const c of clientes) {
    if (!isStatusAtivo(c.status) || c.atendidoMarco) continue;
    const evs = porCliente.get(c.id) ?? [];

    let proximoGeral: Date | null = null;
    let proximoRelatorio: Date | null = null;
    for (const a of evs) {
      if (!naoCancelado(a) || !ehEventoRelevanteVencendo(a)) continue;
      const d = parseISO(a.date);
      if (isNaN(d.getTime()) || d <= now) continue;
      if (!proximoGeral || d < proximoGeral) proximoGeral = d;
      // Cobertura do relógio de Relatório precisa de um Relatório futuro DE
      // VERDADE — uma Reunião futura não conta. Sem essa distinção, um
      // cliente que NUNCA teve relatório nenhum (statusReal 'nunca') virava
      // "coberto"/em dia só por ter uma reunião marcada, mascarando que o
      // relatório em si nunca foi tratado (já foi relatado como dado errado).
      if (/relat/i.test(a.type || '') && (!proximoRelatorio || d < proximoRelatorio)) proximoRelatorio = d;
    }

    const relogios: RelogioServico[] = [];
    if (temServico(c, /monitor/i, 'monitoria')) relogios.push(calcularRelogio('Monitoria', evs, ehToqueMonitoria, monDias, now, proximoGeral, janelaVencendo));
    if (temServico(c, /(price|prec)/i, 'price')) relogios.push(calcularRelogio('Price', evs, ehToquePrice, priceDias, now, proximoGeral, janelaVencendo));
    const relatorioDias = relatorioCadenciaEmDias(c.relatorioCadencia, relatorioDiasPadrao);
    relogios.push(calcularRelogio('Relatório', evs, ehToqueRelatorio, relatorioDias, now, proximoRelatorio, janelaVencendo));

    out.push({ cliente: c, relogios });
  }
  return out;
}

export type ClassificacaoCadencia = 'vencido' | 'vencendo' | 'em_dia';

/** Classificação do cliente pelo pior relógio — fonte única usada tanto na fila
 * de Acompanhamento (Ações) quanto na escolha de material/mensagem por segmento
 * (antes eram dois cálculos de "saúde do cliente" divergentes, com limiares
 * diferentes). "vencido" cobre também "nunca atendido". */
export function classificarCadencia(f: FilaCadItem): ClassificacaoCadencia {
  if (f.relogios.some((r) => r.status === 'vencido' || r.status === 'nunca')) return 'vencido';
  if (f.relogios.some((r) => r.status === 'vencendo')) return 'vencendo';
  return 'em_dia';
}

/** Texto curto do relógio para exibir no card. */
export function rotuloRelogio(r: RelogioServico): string {
  switch (r.status) {
    case 'coberto':
      return `${r.servico} coberta · ${r.proximo ? formatCurto(r.proximo) : ''}`.trim();
    case 'nunca':
      return `${r.servico}: nunca atendido`;
    case 'vencido':
      return `${r.servico} vencida há ${r.atraso}d`;
    case 'vencendo':
      return `${r.servico} vence em ${Math.max(0, -r.atraso)}d`;
    default:
      return `${r.servico} em dia`;
  }
}

function formatCurto(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
