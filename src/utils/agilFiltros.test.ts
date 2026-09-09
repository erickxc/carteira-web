import { addDays, format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { AGIL_FILTROS_VAZIOS, filtrarAgilTarefas } from './agilFiltros';
import type { AgilTarefa } from '../types';

function tarefa(overrides: Partial<AgilTarefa> = {}): AgilTarefa {
  return {
    id: overrides.id ?? 'default',
    boardId: 'b1',
    colunaId: 'c1',
    titulo: 'Tarefa',
    ordem: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('filtrarAgilTarefas', () => {
  it('sem nenhum filtro ativo, devolve tudo', () => {
    const tarefas = [tarefa({ id: 't1' }), tarefa({ id: 't2' })];
    expect(filtrarAgilTarefas(tarefas, AGIL_FILTROS_VAZIOS)).toHaveLength(2);
  });

  it('filtra por responsável (contém, não exato)', () => {
    const tarefas = [
      tarefa({ id: 't1', responsaveis: ['Erick', 'Karol'] }),
      tarefa({ id: 't2', responsaveis: ['Karol'] }),
    ];
    const r = filtrarAgilTarefas(tarefas, { ...AGIL_FILTROS_VAZIOS, responsavel: 'Erick' });
    expect(r.map((t) => t.id)).toEqual(['t1']);
  });

  it('filtra por frenteId', () => {
    const tarefas = [tarefa({ id: 't1', frenteId: 'f1' }), tarefa({ id: 't2', frenteId: 'f2' })];
    const r = filtrarAgilTarefas(tarefas, { ...AGIL_FILTROS_VAZIOS, frenteId: 'f1' });
    expect(r.map((t) => t.id)).toEqual(['t1']);
  });

  it('filtra por bloqueada sim/não', () => {
    const tarefas = [tarefa({ id: 't1', bloqueado: true }), tarefa({ id: 't2', bloqueado: false })];
    expect(filtrarAgilTarefas(tarefas, { ...AGIL_FILTROS_VAZIOS, bloqueada: 'sim' }).map((t) => t.id)).toEqual(['t1']);
    expect(filtrarAgilTarefas(tarefas, { ...AGIL_FILTROS_VAZIOS, bloqueada: 'nao' }).map((t) => t.id)).toEqual(['t2']);
  });

  it('prazo "sem_prazo" pega só tarefas sem dueAt', () => {
    const tarefas = [tarefa({ id: 't1', dueAt: '2020-01-01' }), tarefa({ id: 't2' })];
    const r = filtrarAgilTarefas(tarefas, { ...AGIL_FILTROS_VAZIOS, prazo: 'sem_prazo' });
    expect(r.map((t) => t.id)).toEqual(['t2']);
  });

  it('prazo "atrasada" pega dueAt no passado, exclui hoje/futuro/sem prazo', () => {
    const ontem = format(addDays(new Date(), -1), 'yyyy-MM-dd');
    const hoje = format(new Date(), 'yyyy-MM-dd');
    const amanha = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const tarefas = [
      tarefa({ id: 'passado', dueAt: ontem }),
      tarefa({ id: 'hoje', dueAt: hoje }),
      tarefa({ id: 'futuro', dueAt: amanha }),
      tarefa({ id: 'sem_prazo' }),
    ];
    const r = filtrarAgilTarefas(tarefas, { ...AGIL_FILTROS_VAZIOS, prazo: 'atrasada' });
    expect(r.map((t) => t.id)).toEqual(['passado']);
  });

  it('prazo "vencendo" pega hoje até 7 dias à frente, exclui atrasada e além de 7 dias', () => {
    const ontem = format(addDays(new Date(), -1), 'yyyy-MM-dd');
    const em3dias = format(addDays(new Date(), 3), 'yyyy-MM-dd');
    const em10dias = format(addDays(new Date(), 10), 'yyyy-MM-dd');
    const tarefas = [
      tarefa({ id: 'atrasada', dueAt: ontem }),
      tarefa({ id: 'proxima', dueAt: em3dias }),
      tarefa({ id: 'distante', dueAt: em10dias }),
    ];
    const r = filtrarAgilTarefas(tarefas, { ...AGIL_FILTROS_VAZIOS, prazo: 'vencendo' });
    expect(r.map((t) => t.id)).toEqual(['proxima']);
  });

  it('combina múltiplos filtros em AND', () => {
    const tarefas = [
      tarefa({ id: 't1', prioridade: 'Alta', frenteId: 'f1' }),
      tarefa({ id: 't2', prioridade: 'Alta', frenteId: 'f2' }),
      tarefa({ id: 't3', prioridade: 'Baixa', frenteId: 'f1' }),
    ];
    const r = filtrarAgilTarefas(tarefas, { ...AGIL_FILTROS_VAZIOS, prioridade: 'Alta', frenteId: 'f1' });
    expect(r.map((t) => t.id)).toEqual(['t1']);
  });
});
