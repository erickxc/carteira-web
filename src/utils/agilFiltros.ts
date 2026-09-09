import { isPast, isToday, parse } from 'date-fns';
import type { AgilTarefa } from '../types';

export interface AgilFiltros {
  responsavel: string;
  frenteId: string;
  prioridade: string;
  /** '' | 'atrasada' | 'vencendo' (próximos 7 dias) | 'sem_prazo' */
  prazo: string;
  iniciativaId: string;
  /** '' | 'sim' | 'nao' */
  bloqueada: string;
}

export const AGIL_FILTROS_VAZIOS: AgilFiltros = { responsavel: '', frenteId: '', prioridade: '', prazo: '', iniciativaId: '', bloqueada: '' };

/** Filtragem client-side, combinável (AND) — as tarefas já estão em memória
 *  no CarteiraContext, sem endpoint novo. */
export function filtrarAgilTarefas(tarefas: AgilTarefa[], filtros: AgilFiltros): AgilTarefa[] {
  const hoje = new Date();
  return tarefas.filter((t) => {
    if (filtros.responsavel && !(t.responsaveis ?? []).includes(filtros.responsavel)) return false;
    if (filtros.frenteId && t.frenteId !== filtros.frenteId) return false;
    if (filtros.prioridade && t.prioridade !== filtros.prioridade) return false;
    if (filtros.iniciativaId && t.iniciativaId !== filtros.iniciativaId) return false;
    if (filtros.bloqueada === 'sim' && !t.bloqueado) return false;
    if (filtros.bloqueada === 'nao' && t.bloqueado) return false;
    if (filtros.prazo) {
      if (filtros.prazo === 'sem_prazo') {
        if (t.dueAt) return false;
      } else {
        if (!t.dueAt) return false;
        const d = parse(t.dueAt, 'yyyy-MM-dd', new Date());
        const atrasada = isPast(d) && !isToday(d);
        if (filtros.prazo === 'atrasada' && !atrasada) return false;
        if (filtros.prazo === 'vencendo') {
          const em7dias = new Date(hoje);
          em7dias.setDate(em7dias.getDate() + 7);
          if (atrasada || d > em7dias) return false;
        }
      }
    }
    return true;
  });
}
