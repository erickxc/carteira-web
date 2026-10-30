import { addDays, format } from 'date-fns';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClientesPage from './ClientesPage';
import type { Equipe } from '../equipe/sessao';
import type { RetratoDw } from '../utils/produtosNoDw';
import type { Cliente } from '../types';

const h = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  guardado: {} as Record<string, string>,
  equipe: null as Equipe | null,
  retrato: null as unknown,
}));

vi.mock('../context/CarteiraContext', () => ({ useCarteira: () => h.ctx }));
vi.mock('../equipe/sessao', () => ({ lerSessao: () => h.equipe }));
vi.mock('../components/ClientFormModal', () => ({ ClientFormModal: () => null }));
vi.mock('../components/alvos/PainelCadastroAlvos', () => ({ default: () => null }));
vi.mock('../components/Dropdown', () => ({ Dropdown: () => null }));
// Sem DOM não há efeito: o único useState(null) que importa na tela é o do retrato
// (o do modal é inofensivo com o ClientFormModal falso).
vi.mock('react', async (original) => {
  const real = await original<typeof import('react')>();
  return { ...real, useState: (init: unknown) => (init === null ? [h.retrato, () => {}] : real.useState(init)) };
});

const retrato: RetratoDw = {
  geradoEm: 'x',
  porCnpj: { 111: { certificadoValidade: '2099-05-05' }, 222: { certificadoValidade: '2020-02-02' } },
};
const loja = (cnpj: string) => ({ nome: `Loja ${cnpj}`, cnpj, endereco: '' });
const atendimento = (id: string, cnpjs: string[], grupo?: string) =>
  ({ id, empresa: id, grupo, monitor: 'Erick', status: 'Regular', estado: 'Ativo', servicos: [], contatos: [], lojasCadastro: cnpjs.map(loja) }) as unknown as Cliente;

function tela(equipe: Equipe | null, clientes: Cliente[], { abrirBlocos = false, comRetrato = equipe === 'fiscal' || equipe === 'admin', dados = retrato } = {}) {
  h.equipe = equipe;
  h.retrato = comRetrato ? dados : null;
  // Qualquer filtro ativo abre os blocos; este mantém quem nunca teve reunião.
  h.guardado = abrirBlocos ? { 'filtro:clientes:periodo': JSON.stringify('7') } : {};
  h.ctx.clientes = clientes;
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ClientesPage)));
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => h.guardado[k] ?? null, setItem: () => {} } });
  h.ctx = { agenda: [], acoes: [], analisesIA: [], cadencias: { monitoria_dias: 30, price_dias: 30 }, opcoesPorTipo: () => [], filtroMonitor: 'Todos', criarClientesEmLote: vi.fn() };
});

describe('Carteira: coluna Vencimento Cert.', () => {
  const duasLojas = () => [atendimento('Pecita', ['111', '222'], 'Pecita')];
  const rede = () => [atendimento('Altese A', ['111'], 'Altese'), atendimento('Altese B', ['222'], 'Altese')];

  it.each(['fiscal', 'admin'] as const)('%s vê a coluna, com a pior data do atendimento', (equipe) => {
    const html = tela(equipe, duasLojas());
    expect(html).toContain('Vencimento Cert.');
    expect(html).toContain('02/02/2020 vencido');
    expect(html).not.toContain('05/05/2099');
  });

  it('Negócios não vê', () => {
    expect(tela('negocios', duasLojas())).not.toContain('Vencimento Cert.');
  });

  it('loja física aberta mostra a data dela', () => {
    const html = tela('fiscal', duasLojas(), { abrirBlocos: true });
    expect(html).toContain('05/05/2099');
    expect(html).toContain('02/02/2020 vencido');
  });

  it('rede fechada mostra a pior data da rede, não só a do atendimento da frente', () => {
    expect(tela('fiscal', rede())).toContain('02/02/2020 vencido');
  });

  it('título da rede aberta ocupa a coluna nova também', () => {
    expect(tela('fiscal', rede(), { abrirBlocos: true })).toContain('colSpan="8"');
    expect(tela('negocios', rede(), { abrirBlocos: true })).toContain('colSpan="7"');
  });
});

describe('Carteira: coluna Vencimento Cert., linha a linha', () => {
  // Só a tabela de computador: o cartão do celular vem depois, em <ul>.
  const linhas = (html: string) => html.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const colunasDe = (tr: string) =>
    (tr.match(/<t[dh]\b[^>]*>/g) ?? []).reduce((n, celula) => n + Number(/colSpan="(\d+)"/.exec(celula)?.[1] ?? 1), 0);
  const linhaCom = (html: string, texto: string) => linhas(html).find((tr) => tr.includes(texto)) ?? '';
  const ultimaCelula = (tr: string) => (tr.match(/<td\b[\s\S]*?<\/td>/g) ?? []).at(-1) ?? '';
  const cartoes = (html: string) => html.match(/<li[\s\S]*?<\/li>/g) ?? [];

  const dados: RetratoDw = {
    geradoEm: 'x',
    porCnpj: {
      ...retrato.porCnpj,
      333: { certificadoValidade: null },
      555: { certificadoValidade: format(addDays(new Date(), 10), 'yyyy-MM-dd') },
    },
  };
  const opcoes = { dados, abrirBlocos: true };

  it('cabeçalho e linhas têm o mesmo número de colunas, com e sem a coluna nova', () => {
    const clientes = [atendimento('Pecita', ['111', '222'], 'Pecita'), atendimento('Altese A', ['111'], 'Altese'), atendimento('Altese B', ['222'], 'Altese'), atendimento('Solo', ['111'])];
    for (const [equipe, total] of [['fiscal', 8], ['admin', 8], ['negocios', 7]] as const) {
      const trs = linhas(tela(equipe, clientes, { abrirBlocos: true, comRetrato: true, dados }));
      expect(trs.length).toBeGreaterThan(5);
      for (const tr of trs) expect(colunasDe(tr)).toBe(total);
    }
  });

  it('atendimento aberto: a linha dele fica com a pior data e cada loja com a própria', () => {
    const html = tela('fiscal', [atendimento('Pecita', ['111', '222'], 'Pecita')], opcoes);
    expect(ultimaCelula(linhaCom(html, 'Loja 111'))).toContain('05/05/2099');
    expect(ultimaCelula(linhaCom(html, 'Loja 111'))).not.toContain('vencido');
    expect(ultimaCelula(linhaCom(html, 'Loja 222'))).toContain('02/02/2020 vencido');
    expect(ultimaCelula(linhaCom(html, '2 lojas'))).toContain('02/02/2020 vencido');
  });

  it('rede aberta: cada atendimento mostra a data dele, não a pior da rede', () => {
    const html = tela('fiscal', [atendimento('Altese A', ['111'], 'Altese'), atendimento('Altese B', ['222'], 'Altese')], opcoes);
    expect(ultimaCelula(linhaCom(html, '>Altese A<'))).toContain('05/05/2099');
    expect(ultimaCelula(linhaCom(html, '>Altese B<'))).toContain('02/02/2020 vencido');
  });

  it('rede fechada: a pior data vale mesmo vindo da loja que não é a da frente, nos dois sentidos', () => {
    const a = atendimento('Altese A', ['111'], 'Altese');
    const b = atendimento('Altese B', ['222'], 'Altese');
    for (const ordem of [[a, b], [b, a]]) {
      expect(ultimaCelula(linhaCom(tela('fiscal', ordem, { dados }), '2 lojas'))).toContain('02/02/2020 vencido');
    }
  });

  it('sem data vira "—": loja sem certificado, fora do retrato, sem CNPJ, atendimento sem loja', () => {
    const html = tela('fiscal', [atendimento('Pecita', ['333', '444', ''], 'Pecita'), { ...atendimento('Solo', []), lojasCadastro: undefined }], opcoes);
    const lojasTr = linhas(html).filter((tr) => tr.includes('Loja '));
    expect(lojasTr).toHaveLength(3);
    for (const tr of [...lojasTr, linhaCom(html, '>Solo<'), linhaCom(html, '3 lojas')]) {
      expect(ultimaCelula(tr)).toMatch(/text-text-muted[^>]*>—</);
    }
  });

  it('retrato ainda não existe (DW nunca lido): a tela abre, com "—"', () => {
    const html = tela('fiscal', [atendimento('Solo', ['111'])], { comRetrato: false });
    expect(html).toContain('Vencimento Cert.');
    expect(ultimaCelula(linhaCom(html, '>Solo<'))).toMatch(/>—</);
  });

  it('a cor vai no próprio texto, sem pílula: vencido, perto e em dia', () => {
    const celula = (cnpj: string) => ultimaCelula(linhaCom(tela('fiscal', [atendimento('Solo', [cnpj])], { dados }), '>Solo<'));
    expect(celula('222')).toMatch(/--danger-fg[^>]*>02\/02\/2020 vencido</);
    expect(celula('555')).toMatch(new RegExp(`--warning-fg[^>]*>${format(addDays(new Date(), 10), 'dd/MM/yyyy')}<`));
    expect(celula('111')).not.toMatch(/--(danger|warning)-fg/);
    for (const cnpj of ['111', '222', '555']) expect(celula(cnpj).replace(/^<td[^>]*>/, '')).not.toMatch(/rounded-full|\bbg-/);
  });

  it('Negócios e sessão vazia: nenhuma data, nem no celular, mesmo com o retrato à mão', () => {
    for (const equipe of ['negocios', null] as const) {
      const html = tela(equipe, [atendimento('Pecita', ['111', '222'], 'Pecita')], { comRetrato: true, abrirBlocos: true, dados });
      expect(html).not.toContain('Vencimento Cert.');
      expect(html).not.toContain('Cert.:');
      expect(html).not.toContain('02/02/2020');
      expect(html).not.toContain('05/05/2099');
    }
  });

  it('celular: fiscal vê a pior data do atendimento no cartão', () => {
    const [cartao] = cartoes(tela('fiscal', [atendimento('Pecita', ['111', '222'], 'Pecita')], { dados }));
    expect(cartao).toContain('Cert.:');
    expect(cartao).toContain('02/02/2020 vencido');
  });
});
