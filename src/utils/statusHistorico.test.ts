import { describe, expect, it } from 'vitest';
import { clientesEm } from './statusHistorico';
import { isClienteAtivo } from './formatters';
import type { Cliente, ProdutoHistoricoItem, StatusHistoricoItem } from '../types';

const c = (id: string, extra: Partial<Cliente> = {}) =>
  ({ id, empresa: id, status: 'Suspenso', estado: 'Inativo', ...extra }) as Cliente;
const h = (clientId: string, status: string, estado: string, mudouEm: string): StatusHistoricoItem =>
  ({ id: `${clientId}${mudouEm}`, clientId, status, estado, pausadoAte: '', mudouEm });

const fimDeJulho = new Date(2026, 6, 31, 23, 59, 59, 999);

describe('clientesEm', () => {
  it('usa a situação vigente na data, não a de hoje', () => {
    const historico = [
      h('a', 'Regular', 'Ativo', '2026-05-01T00:00:00.000Z'),
      h('a', 'Suspenso', 'Ativo', '2026-09-10T12:00:00.000Z'),
    ];
    const [a] = clientesEm([c('a')], historico, fimDeJulho);
    expect(a.status).toBe('Regular');
    expect(isClienteAtivo(a, fimDeJulho)).toBe(true);
  });

  it('cliente criado depois da data não existia ainda', () => {
    const historico = [h('novo', 'Regular', 'Ativo', '2026-08-15T00:00:00.000Z')];
    expect(clientesEm([c('novo')], historico, fimDeJulho)).toHaveLength(0);
  });

  it('cliente sem linha no log fica como está hoje', () => {
    const [x] = clientesEm([c('x', { status: 'Regular', estado: 'Ativo' })], [], fimDeJulho);
    expect(x.status).toBe('Regular');
  });

  it('com ProdutosHistorico, refaz servicos com os produtos Ativos na data', () => {
    const ph = (produto: string, fase: string, mudouEm: string): ProdutoHistoricoItem =>
      ({ id: `${produto}${mudouEm}`, clientId: 'a', produto, fase, motivo: '', mudouEm });
    const historico = [h('a', 'Regular', 'Ativo', '2026-05-01T00:00:00.000Z')];
    const produtosHistorico = [
      ph('Plataforma 2D', 'Ativo', '2026-05-01T00:00:00.000Z'),
      ph('2D Price', 'Ativo', '2026-05-01T00:00:00.000Z'),
      ph('2D Price', 'Cancelado', '2026-10-20T12:00:00.000Z'),
      ph('2D Nexus', 'Ativo', '2026-10-30T00:00:00.000Z'),
    ];
    const hoje = c('a', {
      servicos: ['Plataforma 2D'],
      produtos: [
        { produto: 'Plataforma 2D', fase: 'Ativo', faseDesde: '2026-05-01T00:00:00.000Z', motivoFase: '' },
        { produto: '2D Price', fase: 'Cancelado', faseDesde: '2026-10-20T12:00:00.000Z', motivoFase: 'saiu' },
        { produto: '2D Nexus', fase: 'Ativo', faseDesde: '2026-10-30T00:00:00.000Z', motivoFase: '' },
      ],
    });
    const [a] = clientesEm([hoje], historico, new Date(2026, 8, 15), produtosHistorico);
    expect(a.servicos).toEqual(['Plataforma 2D', '2D Price']);
    expect(a.produtos?.find((p) => p.produto === '2D Price')).toMatchObject({ fase: 'Ativo', faseDesde: '2026-05-01T00:00:00.000Z' });
  });

  it('cliente sem linha em ProdutosHistorico mantém os servicos de hoje', () => {
    const [x] = clientesEm([c('x', { servicos: ['Plataforma 2D'] })], [], fimDeJulho, []);
    expect(x.servicos).toEqual(['Plataforma 2D']);
  });
});

describe('clientesEm: casos de borda de produtos', () => {
  const ph = (produto: string, fase: string, mudouEm: string): ProdutoHistoricoItem =>
    ({ id: `${produto}${fase}${mudouEm}`, clientId: 'a', produto, fase, motivo: '', mudouEm });

  it('produto independente na época continua independente no mês passado (não vira cobrança de cadência)', () => {
    // Hoje: 2D Price Cancelado (era independente). Em setembro estava Ativo e independente.
    const hoje = c('a', {
      status: 'Regular', estado: 'Ativo',
      servicos: ['Plataforma 2D'], servicosIndependentes: [],
      produtos: [
        { produto: 'Plataforma 2D', fase: 'Ativo', faseDesde: '2026-05-01T00:00:00.000Z', motivoFase: '' },
        { produto: '2D Price', fase: 'Cancelado', faseDesde: '2026-10-20T12:00:00.000Z', motivoFase: 'saiu', independente: true },
      ],
    });
    const [a] = clientesEm([hoje], [], new Date(2026, 8, 15), [
      ph('Plataforma 2D', 'Ativo', '2026-05-01T00:00:00.000Z'),
      ph('2D Price', 'Ativo', '2026-05-01T00:00:00.000Z'),
      ph('2D Price', 'Cancelado', '2026-10-20T12:00:00.000Z'),
    ]);
    expect(a.servicos).toContain('2D Price');
    expect(a.servicosIndependentes ?? []).toContain('2D Price');
  });

  it('nome antigo no histórico (Precificação) vira o nome oficial em servicos', () => {
    const [a] = clientesEm([c('a', { servicos: [] })], [], new Date(2026, 8, 15), [ph('Precificação', 'Ativo', '2026-05-01T00:00:00.000Z')]);
    expect(a.servicos).toEqual(['2D Price']);
  });

  it('data antes de qualquer linha de produto: servicos vazio', () => {
    const [a] = clientesEm([c('a', { servicos: ['2D Price'] })], [], new Date(2026, 3, 1), [ph('2D Price', 'Ativo', '2026-05-01T00:00:00.000Z')]);
    expect(a.servicos).toEqual([]);
  });
});
