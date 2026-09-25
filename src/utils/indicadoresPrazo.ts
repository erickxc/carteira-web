import { differenceInCalendarDays, isSameMonth, parseISO, subMonths } from 'date-fns';
import { atendimentoEmDia, buildFilaCadencia, contatoRecenteNaoRefletido, ehEntrega, relogioNoPrazo, type ServicoCad } from './cadenciaServico';
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

export interface IndicadoresPrazo {
  ritmo: { total: number; emDia: string[]; agendaMarcada: string[]; contatoRecente: string[]; precisa: string[] };
  porServico: { servico: ServicoCad; cobertos: string[]; descobertos: string[] }[];
  /** Atendimentos com TODOS os relógios no prazo (sem recorte de serviço). */
  totalEmDia: number;
  cobertura: { cobertos: string[]; semContato: string[] };
  semAcompanhamento: { cliente: Cliente; uc: Date | null; dias: number | null }[];
}

const porNome = (a: string, b: string) => a.localeCompare(b);

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

  // Ritmo: em dia = todos os relógios (do recorte) no prazo. Fora do prazo cai
  // num balde informativo: reunião do serviço marcada, contato recente, ou nada.
  const relogiosDo = (f: (typeof fila)[number]) =>
    filtroServico === 'Todos' ? f.relogios : f.relogios.filter((r) => r.servico === filtroServico);
  const relevantes = fila.filter((f) => relogiosDo(f).length > 0);
  const ritmo = { total: relevantes.length, emDia: [] as string[], agendaMarcada: [] as string[], contatoRecente: [] as string[], precisa: [] as string[] };
  for (const f of relevantes) {
    const rels = relogiosDo(f);
    const nome = f.cliente.empresa;
    if (atendimentoEmDia({ relogios: rels })) { ritmo.emDia.push(nome); continue; }
    if (rels.some((r) => r.status === 'coberto')) { ritmo.agendaMarcada.push(nome); continue; }
    const uc = ultimaInteracao.get(f.cliente.id) ?? null;
    if (uc && contatoRecenteNaoRefletido(f.relogios, uc) && differenceInCalendarDays(now, uc) <= cadencias.recontato_dias) {
      ritmo.contatoRecente.push(nome);
      continue;
    }
    ritmo.precisa.push(nome);
  }
  for (const k of ['emDia', 'agendaMarcada', 'contatoRecente', 'precisa'] as const) ritmo[k].sort(porNome);

  // Cobertura por Serviço: base = quem tem o relógio do serviço.
  const porServico = (['Monitoria', 'Price'] as ServicoCad[]).map((servico) => {
    const comRelogio = fila.flatMap((f) => {
      const r = f.relogios.find((x) => x.servico === servico);
      return r ? [{ nome: f.cliente.empresa, noPrazo: relogioNoPrazo(r) }] : [];
    });
    return {
      servico,
      cobertos: comRelogio.filter((x) => x.noPrazo).map((x) => x.nome).sort(porNome),
      descobertos: comRelogio.filter((x) => !x.noPrazo).map((x) => x.nome).sort(porNome),
    };
  });

  // Cobertura: entrega concluída no mês de referência ou no anterior. Quem tem
  // todos os serviços independentes fica fora (nunca precisaria de entrega).
  const mesAnterior = subMonths(periodo, 1);
  const atendidos = new Set(
    agenda
      .filter((a) => ativosIds.has(a.clientId) && ehEntrega(a))
      .filter((a) => { const d = parseISO(a.date); return d <= now && (isSameMonth(d, periodo) || isSameMonth(d, mesAnterior)); })
      .map((a) => a.clientId)
  );
  const precisaDeContato = (c: Cliente) => {
    const servicos = c.servicos ?? [];
    if (servicos.length === 0) return true;
    const independentes = c.servicosIndependentes ?? [];
    return servicos.some((s) => !independentes.includes(s));
  };
  const baseCobertura = ativos.filter(precisaDeContato);
  const cobertura = {
    cobertos: baseCobertura.filter((c) => atendidos.has(c.id)).map((c) => c.empresa).sort(porNome),
    semContato: baseCobertura.filter((c) => !atendidos.has(c.id)).map((c) => c.empresa).sort(porNome),
  };

  const semAcompanhamento = ativos
    .map((cliente) => {
      const uc = ultimaInteracao.get(cliente.id) ?? null;
      return { cliente, uc, dias: uc ? differenceInCalendarDays(now, uc) : null };
    })
    .filter((x) => x.dias === null || x.dias >= LIMIAR_SEM_ACOMPANHAMENTO_DIAS)
    .sort((a, b) => (b.dias ?? 99999) - (a.dias ?? 99999));

  return { ritmo, porServico, totalEmDia: fila.filter(atendimentoEmDia).length, cobertura, semAcompanhamento };
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
