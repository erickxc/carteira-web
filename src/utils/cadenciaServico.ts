import { differenceInCalendarDays, parseISO } from 'date-fns';
import { isClienteAtivo } from './formatters';
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
/** Deslocamento pra jogar itens "cobertos" (já com ação futura marcada) pro
 * fim da fila — não precisam de ação, então nunca competem por prioridade. */
const PESO_NUNCA = 100000;

function temServico(c: Cliente, re: RegExp, flag: keyof Cliente): boolean {
  return (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[flag]);
}

/** true se o cliente marcou esse serviço como "independente" (faz sozinho,
 * não depende de reunião) — nesse caso o serviço não entra na fila de
 * cadência (não faz sentido cobrar reunião de quem não depende dela). */
function ehIndependente(c: Cliente, re: RegExp): boolean {
  return (c.servicosIndependentes ?? []).some((s) => re.test(s));
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

// Zera o relógio de PRICE (histórico): reunião OU relatório com serviço Price
// marcado, OU um evento tipo Precificação (precificação avulsa entregue fora
// de reunião — não depende de tag de serviço, o tipo já basta, igual Relatório).
function ehToquePrice(a: EventoAgenda): boolean {
  if (/precific/i.test(a.type || '')) return true;
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

/** Próxima data (futura, não cancelada) que bate no MESMO critério `ehToque`
 * usado pro histórico — ou seja, cobertura futura exige um evento do serviço
 * CERTO, igual já valia pro "último". Antes qualquer evento futuro (de
 * qualquer tipo/serviço) cobria TODOS os relógios do cliente — um cliente
 * nunca atendido em Price aparecia "em dia"/"coberto" só por ter uma reunião
 * de Monitoria marcada. Validado contra dados reais (ex.: Ramar Caxias·Price,
 * Comkit·Monitoria — nunca tratados, mas apareciam cobertos por outro serviço). */
function calcularProximoPorServico(eventos: EventoAgenda[], ehToque: (a: EventoAgenda) => boolean, now: Date): Date | null {
  let proximo: Date | null = null;
  for (const a of eventos) {
    if (!naoCancelado(a) || !ehToque(a)) continue;
    const d = parseISO(a.date);
    if (isNaN(d.getTime()) || d <= now) continue;
    if (!proximo || d < proximo) proximo = d;
  }
  return proximo;
}

function calcularRelogio(
  servico: ServicoCad,
  eventos: EventoAgenda[],
  ehToque: (a: EventoAgenda) => boolean,
  cadencia: number,
  now: Date,
  desde: Date,
  janelaVencendo: number = JANELA_VENCENDO,
  /**
   * Datas extras de "toque" que não vêm de Agenda (hoje: Ações concluídas do
   * mesmo serviço — ex.: registrar uma Ação tipo Price como Concluída, sem
   * necessariamente criar uma Reunião/Relatório na Agenda). Contam só pro
   * histórico ("último"), nunca como cobertura futura — Ação é registro do
   * que já foi feito, não agendamento.
   */
  toquesExtras: Date[] = []
): RelogioServico {
  // "Último" = histórico real do serviço (só o que de fato tratou aquele serviço).
  let ultimo: Date | null = null;
  for (const a of eventos) {
    if (!naoCancelado(a) || !ehToque(a)) continue;
    const d = parseISO(a.date);
    if (isNaN(d.getTime()) || d > now) continue;
    if (!ultimo || d > ultimo) ultimo = d;
  }
  for (const d of toquesExtras) {
    if (isNaN(d.getTime()) || d > now) continue;
    if (!ultimo || d > ultimo) ultimo = d;
  }
  const proximo = calcularProximoPorServico(eventos, ehToque, now);

  // Status "puro" pela cadência — ignora se já existe agendamento futuro.
  let statusReal: Exclude<CadStatus, 'coberto'>;
  let atrasoReal: number;
  if (!ultimo) {
    statusReal = 'nunca';
    // Atraso de "nunca atendido" medido em dias reais desde que o cliente
    // entrou na carteira (não mais um peso fixo artificial) — senão um
    // cliente com 1 serviço em dia + 1 nunca atendido pulava pra frente de
    // quem está vencido há mais de 100 dias NOS DOIS serviços, só porque
    // "nunca" usava um número gigante deslocado da escala de dias real.
    // Aqui "nunca" ainda entra no bloco "vencido" (ver classificarCadencia),
    // só a ORDEM dentro do bloco passa a respeitar dias reais de espera.
    const referencia = !isNaN(desde.getTime()) ? desde : now;
    atrasoReal = differenceInCalendarDays(now, referencia) - cadencia;
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
  now: Date = new Date(),
  /**
   * `servico`: restringe a fila a UM serviço — cada cliente entra só com o
   * relógio daquele serviço, e severidade/`precisaAcao`/score passam a olhar
   * apenas para ele. Sem isso, filtrar por "Monitoria" trazia clientes com a
   * Monitoria EM DIA só porque o Price estava vencido: o filtro da página
   * checava apenas se o cliente *possui* o serviço, não se aquele serviço
   * precisa de ação (bug real relatado).
   */
  opts: { servico?: ServicoCad } = {}
): FilaCadItem[] {
  const monDias = Number(cadencias?.monitoria_dias) || 30;
  const priceDias = Number(cadencias?.price_dias) || 30;

  const porCliente = new Map<string, EventoAgenda[]>();
  agenda.forEach((a) => {
    if (!porCliente.has(a.clientId)) porCliente.set(a.clientId, []);
    porCliente.get(a.clientId)!.push(a);
  });

  // Ação tipo 'price' concluída conta como toque de Price mesmo sem uma
  // Reunião/Relatório correspondente na Agenda — ex.: enviar uma precificação
  // registrado só como Ação.
  const acoesPricePorCliente = new Map<string, Date[]>();
  acoes.forEach((a) => {
    if (a.tipo !== 'price' || a.status !== 'concluido') return;
    const d = parseISO(a.dueAt || a.updatedAt || a.createdAt);
    if (!acoesPricePorCliente.has(a.clientId)) acoesPricePorCliente.set(a.clientId, []);
    acoesPricePorCliente.get(a.clientId)!.push(d);
  });

  // Ação tipo 'relatorio' concluída TAMBÉM conta como toque de Monitoria —
  // pedido explícito do usuário (caso real: cliente com relatório enviado 4
  // dias antes continuava "vencido" em Monitoria porque só reunião contava).
  // Mesmo tratamento de `acoesPricePorCliente`: só junta o histórico
  // ("último"), nunca cobre o futuro (ver `toquesExtras` em `calcularRelogio`).
  const acoesRelatorioPorCliente = new Map<string, Date[]>();
  acoes.forEach((a) => {
    if (a.tipo !== 'relatorio' || a.status !== 'concluido') return;
    const d = parseISO(a.dueAt || a.updatedAt || a.createdAt);
    if (!acoesRelatorioPorCliente.has(a.clientId)) acoesRelatorioPorCliente.set(a.clientId, []);
    acoesRelatorioPorCliente.get(a.clientId)!.push(d);
  });

  const out: FilaCadItem[] = [];
  for (const c of clientes) {
    if (!isClienteAtivo(c)) continue;
    const evs = porCliente.get(c.id) ?? [];
    const desde = c.createdAt ? parseISO(c.createdAt) : now;

    const todosRelogios: RelogioServico[] = [];
    if (temServico(c, /monitor/i, 'monitoria') && !ehIndependente(c, /monitor/i)) {
      todosRelogios.push(calcularRelogio('Monitoria', evs, ehToqueMonitoria, monDias, now, desde, JANELA_VENCENDO, acoesRelatorioPorCliente.get(c.id) ?? []));
    }
    if (temServico(c, /(price|prec)/i, 'price') && !ehIndependente(c, /(price|prec)/i)) {
      todosRelogios.push(calcularRelogio('Price', evs, ehToquePrice, priceDias, now, desde, JANELA_VENCENDO, acoesPricePorCliente.get(c.id) ?? []));
    }
    // Recorte por serviço ANTES de derivar score/precisaAcao: tudo o que vem
    // depois (ordenação, agrupamento por severidade, contagem de "precisam de
    // ação", relógios exibidos no card) passa a falar só do serviço pedido.
    const relogios = opts.servico ? todosRelogios.filter((r) => r.servico === opts.servico) : todosRelogios;
    if (relogios.length === 0) continue; // sem serviço cadastrado (ou só independentes) → fora do modelo
    const score = Math.max(...relogios.map((r) => r.atraso));
    const precisaAcao = relogios.some((r) => r.status === 'vencido' || r.status === 'vencendo' || r.status === 'nunca');
    out.push({ cliente: c, relogios, score, precisaAcao });
  }

  const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now });
  // Quantos relógios do cliente pedem ação (vencido/vencendo/nunca) — atrasado
  // em 2 serviços é pior que atrasado em 1, mesmo que o pior atraso (score)
  // dos dois dê um número parecido ou até maior no de 1 só. Checado ANTES do
  // score: sem isso, um cliente com só 1 serviço ruim podia ficar na frente de
  // quem está ruim nos dois só por aquele 1 serviço estar mais atrasado.
  const qtdRuins = (f: FilaCadItem) => f.relogios.filter((r) => r.status === 'vencido' || r.status === 'vencendo' || r.status === 'nunca').length;
  return out.sort((a, b) => {
    const rankA = RANK_SEVERIDADE[classificarCadencia(a)];
    const rankB = RANK_SEVERIDADE[classificarCadencia(b)];
    if (rankA !== rankB) return rankA - rankB;
    const qtdA = qtdRuins(a);
    const qtdB = qtdRuins(b);
    if (qtdA !== qtdB) return qtdB - qtdA;
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

/**
 * Cálculo PRÓPRIO pro card "Vencendo" do Dashboard (mesma cobertura
 * por-serviço de `calcularProximoPorServico` usada em `buildFilaCadencia`) —
 * não estende `buildFilaCadencia` de propósito: ali só entram clientes com
 * Monitoria ou Price cadastrado; se Relatório virasse um relógio ali, TODO cliente ativo
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
    if (!isClienteAtivo(c)) continue;
    const evs = porCliente.get(c.id) ?? [];
    const desde = c.createdAt ? parseISO(c.createdAt) : now;

    const relogios: RelogioServico[] = [];
    if (temServico(c, /monitor/i, 'monitoria') && !ehIndependente(c, /monitor/i)) relogios.push(calcularRelogio('Monitoria', evs, ehToqueMonitoria, monDias, now, desde, janelaVencendo));
    if (temServico(c, /(price|prec)/i, 'price') && !ehIndependente(c, /(price|prec)/i)) relogios.push(calcularRelogio('Price', evs, ehToquePrice, priceDias, now, desde, janelaVencendo));
    const relatorioDias = relatorioCadenciaEmDias(c.relatorioCadencia, relatorioDiasPadrao);
    relogios.push(calcularRelogio('Relatório', evs, ehToqueRelatorio, relatorioDias, now, desde, janelaVencendo));

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
