import { describe, expect, it } from 'vitest';
import { colunaConcluida, tarefaPendenteBloqueiaConclusao } from './agilColunas';
import type { AgilColuna, AgilTarefa } from '../types';

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

function coluna(overrides: Partial<AgilColuna> = {}): AgilColuna {
  return { id: overrides.id ?? 'c1', boardId: 'b1', titulo: 'Coluna', ordem: 0, createdAt: '', ...overrides };
}

describe('colunaConcluida', () => {
  it('reconhece variações comuns de "concluído"', () => {
    expect(colunaConcluida('Concluído')).toBe(true);
    expect(colunaConcluida('Done')).toBe(true);
    expect(colunaConcluida('Feito')).toBe(true);
  });

  it('não reconhece colunas de fluxo normal', () => {
    expect(colunaConcluida('Backlog')).toBe(false);
    expect(colunaConcluida('Em andamento')).toBe(false);
    expect(colunaConcluida(undefined)).toBe(false);
  });
});

describe('tarefaPendenteBloqueiaConclusao', () => {
  it('devolve null quando não há tarefa vinculada', () => {
    expect(tarefaPendenteBloqueiaConclusao('i1', [], [])).toBeNull();
  });

  it('devolve null quando todas as tarefas vinculadas já estão em coluna concluída', () => {
    const colunas = [coluna({ id: 'c1', titulo: 'Concluído' })];
    const tarefas = [tarefa({ id: 't1', iniciativaId: 'i1', colunaId: 'c1' })];
    expect(tarefaPendenteBloqueiaConclusao('i1', tarefas, colunas)).toBeNull();
  });

  it('devolve o título da tarefa pendente quando há uma em coluna não concluída', () => {
    const colunas = [coluna({ id: 'c1', titulo: 'Em andamento' }), coluna({ id: 'c2', titulo: 'Concluído' })];
    const tarefas = [
      tarefa({ id: 't1', titulo: 'Fazer X', iniciativaId: 'i1', colunaId: 'c1' }),
      tarefa({ id: 't2', titulo: 'Fazer Y', iniciativaId: 'i1', colunaId: 'c2' }),
    ];
    expect(tarefaPendenteBloqueiaConclusao('i1', tarefas, colunas)).toBe('Fazer X');
  });

  it('ignora tarefas de OUTRA iniciativa', () => {
    const colunas = [coluna({ id: 'c1', titulo: 'Em andamento' })];
    const tarefas = [tarefa({ id: 't1', iniciativaId: 'outra-iniciativa', colunaId: 'c1' })];
    expect(tarefaPendenteBloqueiaConclusao('i1', tarefas, colunas)).toBeNull();
  });
});
