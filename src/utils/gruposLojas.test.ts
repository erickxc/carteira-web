import { describe, expect, it } from 'vitest';
import { agruparPorGrupo, ehLojaPrincipal, lojaPrincipal } from './gruposLojas';
import type { Cliente } from '../types';

function cliente(over: Partial<Cliente> & { id: string; empresa: string }): Cliente {
  return { servicos: [], servicosIndependentes: [], linksServicos: {}, ...over } as Cliente;
}

describe('lojaPrincipal / ehLojaPrincipal', () => {
  it('a loja mais antiga (menor createdAt) é a principal', () => {
    const todos = [
      cliente({ id: 'a', empresa: 'Altese - Recreio', grupo: 'Altese', createdAt: '2026-05-27T00:00:00.000Z' }),
      cliente({ id: 'b', empresa: 'Altese - GM', grupo: 'Altese', createdAt: '2026-08-12T00:00:00.000Z' }),
    ];
    expect(lojaPrincipal('Altese', todos)?.id).toBe('a');
    expect(ehLojaPrincipal(todos[0], todos)).toBe(true);
    expect(ehLojaPrincipal(todos[1], todos)).toBe(false);
  });

  it('cliente sem grupo é sempre principal de si mesmo', () => {
    const solo = cliente({ id: 'x', empresa: 'Solo Ltda' });
    expect(ehLojaPrincipal(solo, [solo])).toBe(true);
  });

  it('createdAt ausente não vence por acidente uma loja com data real', () => {
    const todos = [
      cliente({ id: 'sem-data', empresa: 'Rede - A', grupo: 'Rede' }), // sem createdAt
      cliente({ id: 'com-data', empresa: 'Rede - B', grupo: 'Rede', createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(lojaPrincipal('Rede', todos)?.id).toBe('com-data');
  });

  it('grupo inexistente devolve undefined, não lança', () => {
    expect(lojaPrincipal('NaoExiste', [])).toBeUndefined();
  });
});

describe('agruparPorGrupo', () => {
  it('agrupa lojas do mesmo grupo num bloco só, na posição da primeira ocorrência', () => {
    const solo = cliente({ id: 's', empresa: 'Solo' });
    const l1 = cliente({ id: 'l1', empresa: 'Altese - Recreio', grupo: 'Altese', createdAt: '2026-05-27T00:00:00.000Z' });
    const l2 = cliente({ id: 'l2', empresa: 'Altese - GM', grupo: 'Altese', createdAt: '2026-08-12T00:00:00.000Z' });
    const linhas = agruparPorGrupo([solo, l1, l2], [solo, l1, l2]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({ tipo: 'cliente', cliente: solo });
    expect(linhas[1]).toMatchObject({ tipo: 'grupo', grupo: 'Altese', lojas: [l1, l2], principal: l1 });
  });

  it('grupo com só 1 loja PRESENTE na lista filtrada vira linha normal (sem acordeão)', () => {
    const l1 = cliente({ id: 'l1', empresa: 'Altese - Recreio', grupo: 'Altese', createdAt: '2026-05-27T00:00:00.000Z' });
    const l2 = cliente({ id: 'l2', empresa: 'Altese - GM', grupo: 'Altese', createdAt: '2026-08-12T00:00:00.000Z' });
    // Filtro reduziu a lista visível a só l2, mas o grupo real tem as duas.
    const linhas = agruparPorGrupo([l2], [l1, l2]);
    expect(linhas).toEqual([{ tipo: 'cliente', cliente: l2 }]);
  });

  it('principal considera TODAS as lojas do grupo, não só as filtradas', () => {
    const l1 = cliente({ id: 'l1', empresa: 'A - 1', grupo: 'A', createdAt: '2026-01-01T00:00:00.000Z' });
    const l2 = cliente({ id: 'l2', empresa: 'A - 2', grupo: 'A', createdAt: '2026-02-01T00:00:00.000Z' });
    const l3 = cliente({ id: 'l3', empresa: 'A - 3', grupo: 'A', createdAt: '2026-03-01T00:00:00.000Z' });
    // l1 (a mais antiga/principal de verdade) ficou fora do filtro — mesmo
    // assim o bloco tem que apontar ela como principal, não l2.
    const linhas = agruparPorGrupo([l2, l3], [l1, l2, l3]);
    expect(linhas).toEqual([{ tipo: 'grupo', grupo: 'A', lojas: [l2, l3], principal: l1 }]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(agruparPorGrupo([], [])).toEqual([]);
  });
});
