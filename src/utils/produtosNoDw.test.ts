import { describe, expect, it } from 'vitest';
import type { Cliente } from '../types';
import { produtosNoDw, type RetratoDw } from './produtosNoDw';

const loja = (cnpj: string) => ({ nome: cnpj, cnpj, endereco: '' });
const cliente = (id: string, cnpjs: string[], grupo?: string) =>
  ({ id, empresa: id, grupo, lojasCadastro: cnpjs.map(loja) }) as unknown as Cliente;

describe('produtosNoDw', () => {
  it('Plataforma 2D marcada em qualquer loja vale para o grupo', () => {
    const cBraga = cliente('C. Braga', ['1'], 'CBraga');
    const cgBraga = cliente('CG. Braga', ['2'], 'CBraga');
    const retrato: RetratoDw = { geradoEm: 'x', porCnpj: { 1: ['Plataforma 2D'], 2: ['2D Price'] } };
    const r = produtosNoDw(cgBraga, retrato, [cBraga, cgBraga]);
    expect(r['Plataforma 2D']).toEqual({ marcado: 1, total: 1 });
    // Os outros produtos continuam por loja.
    expect(r['2D Price']).toEqual({ marcado: 1, total: 1 });
    expect(produtosNoDw(cBraga, retrato, [cBraga, cgBraga])['2D Price']).toEqual({ marcado: 0, total: 1 });
  });

  it('conta lojas do atendimento achadas no retrato', () => {
    const gomec = cliente('Gomec', ['1', '2', '3', '4', '5']);
    const retrato: RetratoDw = {
      geradoEm: 'x',
      porCnpj: { 1: ['2D Price'], 2: [], 3: ['2D Price', 'Apura'], 4: [] },
    };
    const r = produtosNoDw(gomec, retrato, [gomec]);
    expect(r['2D Price']).toEqual({ marcado: 2, total: 4 });
    expect(r.Apura).toEqual({ marcado: 1, total: 4 });
    expect(r['Plataforma 2D']).toEqual({ marcado: 0, total: 4 });
    expect(r['Protocolo GPS']).toBeUndefined();
  });

  it('sem lojasCadastro, sem retrato ou sem CNPJ achado → {}', () => {
    const semLojas = { id: 'x', empresa: 'x' } as unknown as Cliente;
    const retrato: RetratoDw = { geradoEm: 'x', porCnpj: { 1: ['2D Price'] } };
    expect(produtosNoDw(semLojas, retrato, [semLojas])).toEqual({});
    expect(produtosNoDw(cliente('a', ['1']), null, [])).toEqual({});
    expect(produtosNoDw(cliente('a', ['9']), retrato, [])).toEqual({});
  });
});
