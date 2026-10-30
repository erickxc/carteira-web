import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUTOS_OFICIAIS } from 'carteira-shared/produtos.cjs';
import type { Cliente, ProdutoClienteTela } from '../../types';
import type { RetratoDw } from '../../utils/produtosNoDw';
import { ProdutosCliente } from './ProdutosCliente';
import { AcessosExternosButton } from './AcessosExternosButton';

// O projeto não tem DOM de teste: a tela é renderizada em HTML estático.
// useEffect não roda nesse modo, então o estado que dependeria de clique ou da
// API (edição de fase, retrato do DW) entra como valor inicial dos dois
// primeiros useState de ProdutosCliente, na ordem em que são declarados.
const { estadoInicial, contexto } = vi.hoisted(() => ({
  estadoInicial: [] as unknown[],
  contexto: { clientes: [] as unknown[], opcoes: [] as string[] },
}));

vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  const useState = (inicial: unknown) => react.useState(estadoInicial.length ? estadoInicial.shift() : inicial);
  return { ...react, useState };
});
vi.mock('../../api/client', () => ({
  buscarRetratoDw: vi.fn(), atualizarRetratoDw: vi.fn(),
  revelarCredenciaisPrice: vi.fn(), revelarCredenciaisProduto: vi.fn(),
}));
vi.mock('../../context/CarteiraContext', () => ({
  useCarteira: () => ({ clientes: contexto.clientes, opcoesPorTipo: () => contexto.opcoes }),
}));

const DATA = '2025-03-15T12:00:00.000Z';
const prod = (produto: string, fase = 'Ativo', extra: Partial<ProdutoClienteTela> = {}) =>
  ({ produto, fase, faseDesde: DATA, motivoFase: 'motivo antigo', ...extra }) as ProdutoClienteTela;
const cliente = (produtos: ProdutoClienteTela[], extra: Partial<Cliente> = {}) =>
  ({ id: 'c1', empresa: 'Loja', produtos, ...extra }) as Cliente;

function htmlDaFicha(c: Cliente, opts: {
  edicao?: { produto: string; fase: string; motivo: string; novo: boolean };
  retrato?: RetratoDw;
  linksEditaveis?: boolean;
} = {}) {
  estadoInicial.push(opts.edicao ?? null, opts.retrato ?? null);
  return renderToStaticMarkup(createElement(ProdutosCliente, {
    cliente: c, salvar: async () => true, linksEditaveis: opts.linksEditaveis ?? true, nomePrincipal: 'Loja Matriz',
  }));
}
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const botaoDesligado = (html: string, rotulo: string) =>
  / disabled=""/.test(html.split('<button').find((b) => b.includes(rotulo))?.split('>')[0] ?? '');

beforeEach(() => {
  estadoInicial.length = 0;
  contexto.clientes = [];
  contexto.opcoes = [];
});

describe('bloco Produtos da ficha', () => {
  it('lista na ordem oficial, com produto fora da lista por último', () => {
    const t = texto(htmlDaFicha(cliente([prod('Raptor'), prod('AutoTech'), prod('2D Price'), prod('Plataforma 2D')])));
    const posicoes = ['Plataforma 2D', '2D Price', 'Raptor', 'AutoTech'].map((n) => t.indexOf(`${n} ·`));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it('mostra fase, mês/ano de início e o último motivo', () => {
    const t = texto(htmlDaFicha(cliente([prod('Apura', 'Suspenso')])));
    expect(t).toContain('Apura · Suspenso desde 03/2025');
    expect(t).toContain('Último motivo: motivo antigo');
  });

  it('"No DW agora": marcado, parcial, não marcado, — e aviso só quando diverge da fase', () => {
    const lojas = [{ nome: 'A', cnpj: '11', endereco: '' }, { nome: 'B', cnpj: '22', endereco: '' }, { nome: 'C', cnpj: '33', endereco: '' }];
    const retrato = { geradoEm: DATA, porCnpj: {
      11: ['Plataforma 2D', 'Apura', 'Controladoria', 'OptiMarco'],
      22: ['Plataforma 2D', 'Apura', 'OptiMarco'],
      33: ['Plataforma 2D', 'OptiMarco'],
    } };
    const c = cliente([
      prod('Plataforma 2D'), prod('Controladoria', 'Cancelado'), prod('Apura'),
      prod('2D Price'), prod('Raptor'),
    ], { lojasCadastro: lojas });
    const t = texto(htmlDaFicha(c, { retrato }));
    expect(t).toMatch(/Plataforma 2D · Ativo desde 03\/2025 · No DW: marcado (?!·)/);
    expect(t).toContain('Controladoria · Cancelado desde 03/2025 · No DW: 1 de 3 lojas · marcado no DW, mas Cancelado aqui');
    expect(t).toMatch(/Apura · Ativo desde 03\/2025 · No DW: 2 de 3 lojas (?!·)/);
    expect(t).toContain('2D Price · Ativo desde 03/2025 · No DW: não marcado · Ativo aqui, mas não marcado no DW');
    expect(t).toMatch(/Raptor · Ativo desde 03\/2025 · No DW: — (?!·)/);
    expect(t).toContain('Marcado no DW, mas fora do cadastro: OptiMarco.');
    expect(t).not.toContain('tem CNPJ no DW');
  });

  it('Plataforma marcada em outra loja do grupo aparece como marcada aqui', () => {
    const c = cliente([prod('Plataforma 2D')], { grupo: 'Rede', lojasCadastro: [{ nome: 'A', cnpj: '11', endereco: '' }] });
    contexto.clientes = [c, cliente([], { id: 'c2', grupo: 'rede', lojasCadastro: [{ nome: 'B', cnpj: '22', endereco: '' }] })];
    const t = texto(htmlDaFicha(c, { retrato: { geradoEm: DATA, porCnpj: { 11: [], 22: ['Plataforma 2D'] } } }));
    expect(t).toContain('No DW: marcado');
    expect(t).not.toContain('não marcado no DW');
  });

  it('avisa atendimento sem loja no DW só depois de ler o retrato, e não acusa divergência', () => {
    const c = cliente([prod('Apura')]);
    expect(texto(htmlDaFicha(c))).not.toContain('tem CNPJ no DW');
    const comRetrato = texto(htmlDaFicha(c, { retrato: { geradoEm: DATA, porCnpj: {} } }));
    expect(comRetrato).toContain('Nenhuma loja deste atendimento tem CNPJ no DW');
    expect(comRetrato).toContain('No DW: —');
    expect(comRetrato).not.toContain('não marcado no DW');
  });

  it('senha nunca aparece: campo vazio, e "Remover senha" só existe com senha salva', () => {
    const comSenha = htmlDaFicha(cliente([prod('Apura', 'Ativo', {
      temSenha: true, senhaCifrada: 'CIFRADO', senha: 'TEXTO-PURO',
    } as Partial<ProdutoClienteTela>)]));
    expect(comSenha).not.toContain('CIFRADO');
    expect(comSenha).not.toContain('TEXTO-PURO');
    expect(comSenha).toMatch(/<input[^>]*type="password"[^>]*value=""/);
    expect(comSenha).toContain('salva — digite para trocar');
    expect(comSenha).toContain('Remover senha');

    const semSenha = htmlDaFicha(cliente([prod('Apura')]));
    expect(semSenha).toContain('Definir senha');
    expect(semSenha).not.toContain('Remover senha');
  });

  it('no 2D Price, remover a senha diz que leva o login junto', () => {
    const html = htmlDaFicha(cliente([prod('2D Price', 'Ativo', { temSenha: true })]));
    expect(html).toContain('Remover login e senha');
    expect(html).not.toContain('Remover senha');
  });

  it('link só é editável na loja principal; nas outras, diz onde ele fica', () => {
    const c = cliente([prod('Apura', 'Ativo', { link: 'http://link-apura' })], { grupo: 'Rede' });
    const principal = htmlDaFicha(c);
    expect(principal).toContain('http://link-apura');
    expect(principal).toContain('Link de acesso');

    const outra = htmlDaFicha(c, { linksEditaveis: false });
    expect(outra).not.toContain('http://link-apura');
    expect(outra).not.toContain('Link de acesso');
    expect(texto(outra)).toContain('Os links desta rede ficam em Loja Matriz');
  });

  it('troca de fase: "Salvar fase" só libera com motivo que não seja só espaço', () => {
    const editar = (motivo: string) => htmlDaFicha(cliente([prod('Apura')]), {
      edicao: { produto: 'Apura', fase: 'Suspenso', motivo, novo: false },
    });
    expect(botaoDesligado(editar(''), 'Salvar fase')).toBe(true);
    expect(botaoDesligado(editar('   '), 'Salvar fase')).toBe(true);
    const preenchido = editar('cliente pediu pausa');
    expect(botaoDesligado(preenchido, 'Salvar fase')).toBe(false);
    expect(preenchido).toContain('Motivo (obrigatório)');
    expect(preenchido).not.toContain('Último motivo');
  });

  it('edição de fase de um produto não abre motivo nos outros', () => {
    const html = htmlDaFicha(cliente([prod('Apura'), prod('Raptor')]), {
      edicao: { produto: 'Apura', fase: 'Suspenso', motivo: '', novo: false },
    });
    expect(html.match(/Salvar fase/g)).toHaveLength(1);
    expect(html.match(/Último motivo/g)).toHaveLength(1);
  });

  it('"Adicionar produto" pede produto, fase e motivo, e substitui o botão', () => {
    const html = htmlDaFicha(cliente([prod('Apura')]), {
      edicao: { produto: 'Raptor', fase: 'Ativo', motivo: '', novo: true },
    });
    const t = texto(html);
    expect(t).toContain('Produto');
    expect(t).toContain('Motivo (obrigatório)');
    expect(botaoDesligado(html, 'Salvar fase')).toBe(true);
    expect(html).not.toContain('Adicionar produto');
  });

  it('"Adicionar produto" some quando já tem todos, contando nome antigo como o novo', () => {
    const antigos = PRODUTOS_OFICIAIS
      .map((n) => (n === 'Plataforma 2D' ? 'Monitoria' : n === '2D Price' ? 'Precificação' : n))
      .map((n) => prod(n));
    contexto.opcoes = ['Monitoria', 'Precificação'];
    expect(htmlDaFicha(cliente(antigos))).not.toContain('Adicionar produto');

    contexto.opcoes = ['AutoTech'];
    expect(htmlDaFicha(cliente(antigos))).toContain('Adicionar produto');
    contexto.opcoes = [];
    expect(htmlDaFicha(cliente(antigos.slice(1)))).toContain('Adicionar produto');
  });
});

describe('botão de acessos', () => {
  const htmlAcessos = (c: Cliente, compacto = true) => renderToStaticMarkup(createElement(AcessosExternosButton, { cliente: c, compacto }));

  it('sem acesso nenhum: traço na coluna da tabela e nada no cabeçalho da ficha', () => {
    const c = cliente([prod('Apura'), prod('Raptor', 'Ativo', { link: '   ' })]);
    expect(texto(htmlAcessos(c))).toBe('—');
    expect(htmlAcessos(c, false)).toBe('');
    expect(texto(htmlAcessos(cliente([])))).toBe('—');
  });

  it('produto Cancelado não oferece link nem senha; Suspenso e Em breve oferecem', () => {
    const acesso = { link: 'http://x', temSenha: true };
    expect(texto(htmlAcessos(cliente([prod('Apura', 'Cancelado', acesso)])))).toBe('—');
    expect(texto(htmlAcessos(cliente([prod('2D Price', 'Cancelado', acesso)], { temSenhaPrice: true })))).toBe('—');
    expect(htmlAcessos(cliente([prod('Apura', 'Suspenso', { link: 'http://x' })]))).toContain('title="Abrir Apura"');
    expect(htmlAcessos(cliente([prod('Apura', 'Em breve', { link: 'http://x' })]))).toContain('title="Abrir Apura"');
  });

  it('produto com senha e sem link aparece; lista qualquer produto, não só o Price', () => {
    expect(htmlAcessos(cliente([prod('Apura', 'Ativo', { temSenha: true })]))).toContain('title="Abrir Apura"');
    expect(htmlAcessos(cliente([prod('Apura', 'Ativo', { temSenha: true }), prod('Raptor', 'Ativo', { link: 'http://x' })])))
      .toContain('title="2 links: Apura, Raptor"');
  });

  it('link de produto que não está no cadastro continua no botão', () => {
    const c = cliente([prod('Apura', 'Ativo', { link: 'http://a' })], { linksServicos: { Monitoria: 'http://bi', Apura: 'http://a' } });
    expect(htmlAcessos(c)).toContain('title="2 links: Apura, Plataforma 2D"');
    // Produto Cancelado continua sem oferecer o link, mesmo com ele em linksServicos.
    const cancelado = cliente([prod('Apura', 'Cancelado', { link: 'http://a' })], { linksServicos: { Apura: 'http://a' } });
    expect(texto(htmlAcessos(cancelado))).toBe('—');
  });

  it('2D Price: senha vira o login animado; link fica como opção à parte', () => {
    expect(htmlAcessos(cliente([prod('2D Price', 'Ativo', { temSenha: true })], { temSenhaPrice: true }))).toContain('title="Abrir Price"');
    expect(htmlAcessos(cliente([prod('2D Price', 'Ativo', { link: 'http://x' })]))).toContain('title="Abrir 2D Price"');
    expect(htmlAcessos(cliente([prod('2D Price', 'Ativo', { link: 'http://x', temSenha: true })], { temSenhaPrice: true })))
      .toContain('title="2 links: 2D Price, Price"');
  });
});
