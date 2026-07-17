import { differenceInCalendarDays, parseISO } from 'date-fns';
import { isStatusAtivo } from './formatters';
import type { Acao, AcaoTipo, Cadencias, Cliente, EventoAgenda, Segmento } from '../types';

export interface Recomendacao {
  cliente: Cliente;
  segmento: Segmento;
  tipo: AcaoTipo;
  motivo: string;
  prioridade: number; // maior = mais urgente
  diasSemContato: number | null;
  ultimoContato: Date | null;
  proximaReuniao: Date | null;
  /** Ação já tratada (programado/concluído/dispensado), se houver. */
  acao?: Acao;
}

const ACAO_LABEL: Record<AcaoTipo, string> = {
  contato: 'Fazer contato',
  reuniao: 'Agendar reunião',
  relatorio: 'Enviar relatório',
  price: 'Fazer precificação',
};

export function labelAcao(t: AcaoTipo): string {
  return ACAO_LABEL[t];
}

/**
 * Gera a recomendação de próxima ação para cada cliente ativo, diferenciando
 * por segmento (engajado / esfriando / não atendido). Cruza com as ações já
 * tratadas para não repetir o que já foi concluído/dispensado.
 */
export function gerarRecomendacoes(
  clientes: Cliente[],
  agenda: EventoAgenda[],
  acoes: Acao[],
  cadencias: Cadencias,
  now: Date = new Date()
): Recomendacao[] {
  const ativos = clientes.filter((c) => isStatusAtivo(c.status));
  const idsAtivos = new Set(ativos.map((c) => c.id));
  const agendaAtiva = agenda.filter((a) => idsAtivos.has(a.clientId));

  const ultimoPorCliente = new Map<string, Date>();
  const proximaPorCliente = new Map<string, Date>();
  agendaAtiva.forEach((a) => {
    const d = parseISO(a.date);
    if (isNaN(d.getTime())) return;
    const ult = ultimoPorCliente.get(a.clientId);
    if (!ult || d > ult) ultimoPorCliente.set(a.clientId, d);
    if (differenceInCalendarDays(d, now) >= 0) {
      const prox = proximaPorCliente.get(a.clientId);
      if (!prox || d < prox) proximaPorCliente.set(a.clientId, d);
    }
  });

  // Índice de ações tratadas por cliente+tipo (a mais recente).
  const acaoPorChave = new Map<string, Acao>();
  acoes.forEach((a) => {
    const chave = `${a.clientId}:${a.tipo}`;
    const atual = acaoPorChave.get(chave);
    if (!atual || (a.updatedAt || a.createdAt) > (atual.updatedAt || atual.createdAt)) acaoPorChave.set(chave, a);
  });

  const recs: Recomendacao[] = [];

  // Sinal legado do banco real: campos lastMeeting/lastContact do cliente.
  function dataCliente(valor?: string): Date | null {
    if (!valor) return null;
    const d = parseISO(valor);
    return isNaN(d.getTime()) ? null : d;
  }

  for (const cliente of ativos) {
    const candidatos = [
      ultimoPorCliente.get(cliente.id) ?? null,
      dataCliente(cliente.lastMeeting),
      dataCliente(cliente.lastContact),
    ].filter((d): d is Date => d !== null && d <= now);
    const ultimoContato = candidatos.length ? new Date(Math.max(...candidatos.map((d) => d.getTime()))) : null;
    const proximaReuniao = proximaPorCliente.get(cliente.id) ?? null;
    const diasSemContato = ultimoContato ? differenceInCalendarDays(now, ultimoContato) : null;

    let segmento: Segmento;
    let tipo: AcaoTipo;
    let motivo: string;
    let prioridade: number;

    if (!ultimoContato) {
      segmento = 'frio';
      tipo = 'contato';
      motivo = 'Nunca atendido — buscar primeiro contato';
      prioridade = 100;
    } else if ((diasSemContato ?? 0) >= cadencias.esfriando_dias) {
      segmento = 'esfriando';
      tipo = 'reuniao';
      motivo = `${diasSemContato} dias sem contato — retomar relacionamento`;
      prioridade = 80 + (diasSemContato ?? 0);
    } else {
      segmento = 'engajado';
      if (!proximaReuniao && (diasSemContato ?? 0) >= cadencias.reuniao_dias) {
        tipo = 'reuniao';
        motivo = 'Cadência de reunião vencida — agendar próxima';
        prioridade = 50 + (diasSemContato ?? 0);
      } else if ((diasSemContato ?? 0) >= cadencias.relatorio_dias) {
        tipo = 'relatorio';
        motivo = 'Enviar relatório do período';
        prioridade = 40;
      } else {
        continue; // engajado em dia — sem recomendação
      }
    }

    const acao = acaoPorChave.get(`${cliente.id}:${tipo}`);
    // Dispensados/concluídos recentemente (<= 30 dias) saem da lista.
    if (acao && (acao.status === 'concluido' || acao.status === 'dispensado')) {
      const dias = differenceInCalendarDays(now, parseISO(acao.updatedAt || acao.createdAt));
      if (dias <= 30) continue;
    }

    recs.push({ cliente, segmento, tipo, motivo, prioridade, diasSemContato, ultimoContato, proximaReuniao, acao });
  }

  return recs.sort((a, b) => b.prioridade - a.prioridade);
}
