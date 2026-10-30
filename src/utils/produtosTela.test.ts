import { describe, expect, it } from 'vitest';
import { opcoesProdutoEvento, passaFiltroProduto, servicosDaImportacao } from './produtosTela';
import type { Cliente } from '../types';

const cli = (...produtos: [string, string][]) =>
  ({ produtos: produtos.map(([produto, fase]) => ({ produto, fase, faseDesde: '', motivoFase: '' })) }) as unknown as Cliente;

const CATEGORIAS = ['Plataforma 2D', 'Controladoria', 'Apura', '2D Price'];

describe('opcoesProdutoEvento', () => {
  it('mostra só os Ativos do cliente, na ordem do cadastro', () => {
    const c = cli(['2D Price', 'Ativo'], ['Apura', 'Ativo'], ['Controladoria', 'Suspenso']);
    expect(opcoesProdutoEvento(CATEGORIAS, c, [], false)).toEqual(['Apura', '2D Price']);
  });
  it('"ver todos" mostra a categoria inteira', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Apura', 'Ativo']), [], true)).toEqual(CATEGORIAS);
  });
  it('sem cliente ou cliente sem Ativo mostra todos — senão não haveria o que marcar', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, undefined, [], false)).toEqual(CATEGORIAS);
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Apura', 'Suspenso']), [], false)).toEqual(CATEGORIAS);
  });
  it('produto já marcado nunca some, mesmo não sendo Ativo ou fora do cadastro', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Apura', 'Ativo']), ['2D Price', 'AutoTech'], false))
      .toEqual(['Apura', '2D Price', 'AutoTech']);
  });
  it('categoria com nome antigo casa com produto novo (antes da migração)', () => {
    expect(opcoesProdutoEvento(['Monitoria', 'Precificação'], cli(['Plataforma 2D', 'Ativo']), [], false)).toEqual(['Monitoria']);
  });
  it('marcado com nome antigo aparece no lugar da categoria, sem chip duplicado', () => {
    expect(opcoesProdutoEvento(CATEGORIAS, cli(['Plataforma 2D', 'Ativo']), ['Monitoria'], false)).toEqual(['Monitoria']);
  });
});

describe('passaFiltroProduto', () => {
  const c = cli(['Plataforma 2D', 'Ativo'], ['Apura', 'Suspenso']);
  it('sem produto escolhido, a fase padrão não filtra (cliente sem produto continua na lista)', () => {
    expect(passaFiltroProduto(cli(), [], 'Ativo')).toBe(true);
    expect(passaFiltroProduto(cli(), [], 'Todas')).toBe(true);
  });
  it('sem produto escolhido, outra fase procura em qualquer produto', () => {
    expect(passaFiltroProduto(c, [], 'Suspenso')).toBe(true);
    expect(passaFiltroProduto(c, [], 'Cancelado')).toBe(false);
  });
  it('produto escolhido precisa estar na fase', () => {
    expect(passaFiltroProduto(c, ['Plataforma 2D'], 'Ativo')).toBe(true);
    expect(passaFiltroProduto(c, ['Apura'], 'Ativo')).toBe(false);
    expect(passaFiltroProduto(c, ['Apura'], 'Suspenso')).toBe(true);
    expect(passaFiltroProduto(c, ['Apura'], 'Todas')).toBe(true);
    expect(passaFiltroProduto(c, ['Raptor'], 'Todas')).toBe(false);
  });
  it('filtro salvo com o nome antigo vale pelo novo', () => {
    expect(passaFiltroProduto(c, ['Monitoria'], 'Ativo')).toBe(true);
  });
});

describe('servicosDaImportacao', () => {
  const novas = ['Plataforma 2D', '2D Price'];
  const antigas = ['Monitoria', 'Precificação'];
  it('aceita coluna com nome novo e antigo', () => {
    expect(servicosDaImportacao({ 'Plataforma 2D': 'Sim', '2D Price': 'x' }, novas)).toEqual(novas);
    expect(servicosDaImportacao({ Monitoria: 'Sim', Precificação: 'Sim' }, novas)).toEqual(novas);
    expect(servicosDaImportacao({ monitoria: 'Sim', Price: 'Sim' }, novas)).toEqual(novas);
    expect(servicosDaImportacao({ Precificacao: 'Sim' }, novas)).toEqual(['2D Price']);
  });
  it('grava o nome vigente da categoria — /bulk não normaliza, e antes da migração a categoria é a antiga', () => {
    expect(servicosDaImportacao({ 'Plataforma 2D': 'Sim', '2D Price': 'Sim' }, antigas)).toEqual(antigas);
  });
  it('coluna vazia ou negativa não marca', () => {
    expect(servicosDaImportacao({ 'Plataforma 2D': '', Monitoria: 'não' }, novas)).toEqual([]);
  });
});
