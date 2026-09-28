import { differenceInCalendarDays, isSameMonth, parseISO, subMonths } from 'date-fns';
import { atendimentoEmDia, buildFilaCadencia, contatoRecenteNaoRefletido, ehEntrega, relogioNoPrazo, type RelogioServico, type ServicoCad } from './cadenciaServico';
import { buildUltimaInteracaoMap } from './ultimaInteracao';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

/** Atendimento sem contato há 30+ dias entra em "Atendimentos sem acompanhamento". */
export const LIMIAR_SEM_ACOMPANHAMENTO_DIAS = 30;

export interface EntradaIndicadores {
  /** Atendimentos ativos (já com o filtro de monitor aplicado). */
  ativos: Cliente[];
  agenda: EventoAgenda[];
  acoes: Acao[];
  cadencias: Cadencias;
  /** "Agora" do cálculo: hoje, ou o fim do mês escolhido, ou a mesma data um mês antes. */
  now: Date;
  /** Primeiro dia do mês de referência da Cobertura (mês + anterior). */
  periodo: Date;
  /** Recorte do Ritmo por serviço; 'Todos' = todos os relógios. */
  filtroServico?: ServicoCad | 'Todos';
}

export interface ItemPrazo { id: string; nome: string }

/** Uma linha da tabela de atendimentos: os dois prazos, a última entrega e o próximo compromisso. */
export interface LinhaAtendimento {
  id: string;
  nome: string;
  monitor: string;
  relogios: Partial<Record<ServicoCad, RelogioServico>>;
  ultimaEntrega: { data: Date; tipo: string } | null;
  /** Próxima entrega marcada de algum serviço. */
  proxima: Date | null;
  /** Último contato que espera retorno (sem o aviso de cancelamento). */
  ultimoContato: Date | null;
}

export interface IndicadoresPrazo {
  ritmo: { total: number; emDia: ItemPrazo[]; agendaMarcada: ItemPrazo[]; contatoRecente: ItemPrazo[]; precisa: ItemPrazo[] };
  porServico: { servico: ServicoCad; cobertos: ItemPrazo[]; descobertos: ItemPrazo[] }[];
  /** Atendimentos com TODOS os relógios no prazo (sem recorte de serviço). */
  totalEmDia: number;
  cobertura: { cobertos: ItemPrazo[]; semContato: ItemPrazo[] };
  semAcompanhamento: { cliente: Cliente; uc: Date | null; dias: number | null }[];
  linhas: Map<string, LinhaAtendimento>;
}

const porNome = (a: ItemPrazo, b: ItemPrazo) => a.nome.localeCompare(b.nome);
const item = (c: Cliente): ItemPrazo => ({ id: c.id, nome: c.empresa });

/**
 * Fonte única dos cards do bloco "Os atendimentos estão no prazo?" e de
 * "Atendimentos sem acompanhamento". A mesma função calcula o valor de hoje
 * e o de um mês antes (comparação), então os dois nunca usam regras diferentes.
 */
export function calcularIndicadoresPrazo(e: EntradaIndicadores): IndicadoresPrazo {
  const { ativos, agenda, acoes, cadencias, now, periodo } = e;
  const filtroServico = e.filtroServico ?? 'Todos';
  const ativosIds = new Set(ativos.map((c) => c.id));
  const fila = buildFilaCadencia(ativos, agenda, acoes, cadencias, now);
  const ultimaInteracao = buildUltimaInteracaoMap(agenda, acoes, { now, isRelevant: (cid) => ativosIds.has(cid) });
  // "Aguardando retorno" ignora o aviso de cancelamento (quem age é o monitor).
  const ultimoContatoRetorno = buildUltimaInteracaoMap(agenda, acoes, { now, isRelevant: (cid) => ativosIds.has(cid), paraRetorno: true });

  // Ritmo: em dia = todos os relógios (do recorte) no prazo. Fora do prazo cai
  // num balde informativo: reunião do serviço marcada, contato recente, ou nada.
  const relogiosDo = (f: (typeof fila)[number]) =>
    filtroServico === 'Todos' ? f.relogios : f.relogios.filter((r) => r.servico === filtroServico);
  const relevantes = fila.filter((f) => relogiosDo(f).length > 0);
  const ritmo = { total: relevantes.length, emDia: [] as ItemPrazo[], agendaMarcada: [] as ItemPrazo[], contatoRecente: [] as ItemPrazo[], precisa: [] as ItemPrazo[] };
  for (const f of relevantes) {
    const rels = relogiosDo(f);
    if (atendimentoEmDia({ relogios: rels })) { ritmo.emDia.push(item(f.cliente)); continue; }
    if (rels.some((r) => r.status === 'coberto')) { ritmo.agendaMarcada.push(item(f.cliente)); continue; }
    const uc = ultimoContatoRetorno.get(f.cliente.id) ?? null;
    if (uc && contatoRecenteNaoRefletido(f.relogios, uc) && differenceInCalendarDays(now, uc) <= cadencias.recontato_dias) {
      ritmo.contatoRecente.push(item(f.cliente));
      continue;
    }
    ritmo.precisa.push(item(f.cliente));
  }
  for (const k of ['emDia', 'agendaMarcada', 'contatoRecente', 'precisa'] as const) ritmo[k].sort(porNome);

  // Cobertura por Serviço: base = quem tem o relógio do serviço.
  const porServico = (['Monitoria', 'Price'] as ServicoCad[]).map((servico) => {
    const comRelogio = fila.flatMap((f) => {
      const r = f.relogios.find((x) => x.servico === servico);
      return r ? [{ item: item(f.cliente), noPrazo: relogioNoPrazo(r) }] : [];
    });
    return {
      servico,
      cobertos: comRelogio.filter((x) => x.noPrazo).map((x) => x.item).sort(porNome),
      descobertos: comRelogio.filter((x) => !x.noPrazo).map((x) => x.item).sort(porNome),
    };
  });

  // Cobertura: entrega concluída no mês de referência ou no anterior. Quem tem
  // todos os serviços independentes fica fora (nunca precisaria de entrega).
  const mesAnterior = subMonths(periodo, 1);
  const ultimaEntrega = new Map<string, { d: Date; tipo: string }>();
  for (const a of agenda) {
    if (!ativosIds.has(a.clientId) || !ehEntrega(a)) continue;
    const d = parseISO(a.date);
    if (d > now) continue;
    const atual = ultimaEntrega.get(a.clientId);
    if (!atual || d > atual.d) ultimaEntrega.set(a.clientId, { d, tipo: a.type });
  }
  const atendidos = new Set(
    [...ultimaEntrega].filter(([, u]) => isSameMonth(u.d, periodo) || isSameMonth(u.d, mesAnterior)).map(([id]) => id)
  );

  const precisaDeContato = (c: Cliente) => {
    const servicos = c.servicos ?? [];
    if (servicos.length === 0) return true;
    const independentes = c.servicosIndependentes ?? [];
    return servicos.some((s) => !independentes.includes(s));
  };
  const baseCobertura = ativos.filter(precisaDeContato);
  const cobertura = {
    cobertos: baseCobertura.filter((c) => atendidos.has(c.id)).map(item).sort(porNome),
    semContato: baseCobertura.filter((c) => !atendidos.has(c.id)).map(item).sort(porNome),
  };

  const semAcompanhamento = ativos
    .map((cliente) => {
      const uc = ultimaInteracao.get(cliente.id) ?? null;
      return { cliente, uc, dias: uc ? differenceInCalendarDays(now, uc) : null };
    })
    .filter((x) => x.dias === null || x.dias >= LIMIAR_SEM_ACOMPANHAMENTO_DIAS)
    .sort((a, b) => (b.dias ?? 99999) - (a.dias ?? 99999));

  const filaPorId = new Map(fila.map((f) => [f.cliente.id, f]));
  const linhas = new Map<string, LinhaAtendimento>(ativos.map((c) => {
    const rels = filaPorId.get(c.id)?.relogios ?? [];
    const proximas = rels.map((r) => r.proximo).filter((d): d is Date => !!d);
    const u = ultimaEntrega.get(c.id);
    return [c.id, {
      id: c.id,
      nome: c.empresa,
      monitor: c.monitor || '',
      relogios: Object.fromEntries(rels.map((r) => [r.servico, r])),
      ultimaEntrega: u ? { data: u.d, tipo: u.tipo } : null,
      proxima: proximas.length ? new Date(Math.min(...proximas.map((d) => d.getTime()))) : null,
      ultimoContato: ultimoContatoRetorno.get(c.id) ?? null,
    }];
  }));

  return { linhas, ritmo, porServico, totalEmDia: fila.filter(atendimentoEmDia).length, cobertura, semAcompanhamento };
}

/**
 * Recorte do dado como ele era em `data`: tira eventos e ações criados depois.
 * Aproximação: o STATUS de cada evento é o de hoje (o sistema não guarda o
 * status de evento no passado), então a comparação é "o que se sabia daquilo
 * que já existia", não uma foto exata.
 */
export function recortarAte<T extends { createdAt?: string }>(itens: T[], data: Date): T[] {
  return itens.filter((i) => !i.createdAt || parseISO(i.createdAt) <= data);
}
