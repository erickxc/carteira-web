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

describe('produtosNoDw — bordas', () => {
  it('clientes sem grupo não compartilham Plataforma 2D entre si', () => {
    const a = cliente('A', ['1']);
    const b = cliente('B', ['2'], '   ');
    const retrato: RetratoDw = { geradoEm: 'x', porCnpj: { 1: ['Plataforma 2D'], 2: [] } };
    expect(produtosNoDw(b, retrato, [a, b])['Plataforma 2D']).toEqual({ marcado: 0, total: 1 });
  });

  it('grupo casa ignorando maiúscula e espaço nas pontas', () => {
    const a = cliente('A', ['1'], 'CBraga');
    const b = cliente('B', ['2'], ' cbraga ');
    const retrato: RetratoDw = { geradoEm: 'x', porCnpj: { 1: ['Plataforma 2D'], 2: [] } };
    expect(produtosNoDw(b, retrato, [a, b])['Plataforma 2D']).toEqual({ marcado: 1, total: 1 });
  });

  it('Plataforma no grupo marca todas as lojas achadas do atendimento, não as que faltam no retrato', () => {
    const a = cliente('A', ['1'], 'G');
    const b = cliente('B', ['2', '3', '4'], 'G');
    const retrato: RetratoDw = { geradoEm: 'x', porCnpj: { 1: ['Plataforma 2D'], 2: [], 3: [] } };
    expect(produtosNoDw(b, retrato, [a, b])['Plataforma 2D']).toEqual({ marcado: 2, total: 2 });
  });

  it('Plataforma de outro grupo não conta', () => {
    const a = cliente('A', ['1'], 'Outro');
    const b = cliente('B', ['2'], 'G');
    const retrato: RetratoDw = { geradoEm: 'x', porCnpj: { 1: ['Plataforma 2D'], 2: [] } };
    expect(produtosNoDw(b, retrato, [a, b])['Plataforma 2D']).toEqual({ marcado: 0, total: 1 });
  });

  it('CNPJ com máscara no cadastro casa com os dígitos do retrato', () => {
    const c = cliente('C', ['11.111.111/0001-11']);
    const retrato: RetratoDw = { geradoEm: 'x', porCnpj: { '11111111000111': ['2D Price'] } };
    expect(produtosNoDw(c, retrato, [c])['2D Price']).toEqual({ marcado: 1, total: 1 });
  });

  it('loja achada no retrato com lista vazia conta no total e zera tudo', () => {
    const c = cliente('C', ['1']);
    const r = produtosNoDw(c, { geradoEm: 'x', porCnpj: { 1: [] } }, [c]);
    expect(Object.keys(r)).toEqual(['Plataforma 2D', 'Controladoria', 'Apura', '2D Alcance', '2D Nexus', 'OptiMarco', '2D Price']);
    expect(Object.values(r).every((v) => v.marcado === 0 && v.total === 1)).toBe(true);
  });
});
