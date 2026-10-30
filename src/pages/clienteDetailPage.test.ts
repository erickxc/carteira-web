import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClienteDetailPage from './ClienteDetailPage';
import type { Cliente } from '../types';

const h = vi.hoisted(() => ({ ctx: {} as Record<string, unknown>, guardado: {} as Record<string, string> }));

vi.mock('../context/CarteiraContext', () => ({ useCarteira: () => h.ctx }));
// Os três têm teste próprio; aqui só importa QUAL aba está na tela.
vi.mock('../components/cliente/PainelFicha', () => ({ PainelFicha: () => 'PAINEL' }));
vi.mock('../components/cliente/TimelineCard', () => ({ TimelineCard: () => 'TIMELINE' }));
vi.mock('../components/cliente/CadastroCliente', () => ({ CadastroCliente: () => 'CADASTRO' }));
// O `state` do Link não aparece no HTML: o mock o expõe para conferir o "voltar".
vi.mock('react-router-dom', async (original) => {
  const real = await original<typeof import('react-router-dom')>();
  return {
    ...real,
    Link: ({ to, state, children }: { to: string; state?: { from?: string }; children: ReactNode }) =>
      createElement('a', { href: to, 'data-from': state?.from }, children),
  };
});

const pecita = { id: 'c1', empresa: 'Pecita', status: 'Regular', estado: 'Ativo', observacao: 'nota interna' } as Cliente;

function abrir(cliente: Cliente, aba?: string, outros: Cliente[] = []) {
  h.guardado = aba ? { 'ficha:aba': JSON.stringify(aba) } : {};
  h.ctx.clientes = [cliente, ...outros];
  return renderToStaticMarkup(createElement(MemoryRouter, {
    initialEntries: [{ pathname: `/clientes/${cliente.id}`, state: { from: '/acoes', fromLabel: 'Ações' } }],
  }, createElement(Routes, null, createElement(Route, { path: '/clientes/:id', element: createElement(ClienteDetailPage) }))));
}

const abas = (html: string) => [...html.matchAll(/class="tab(?: is-active)?"[^>]*>([^<]*)</g)].map((m) => m[1]);
const abaAtiva = (html: string) => /class="tab is-active"[^>]*>([^<]*)</.exec(html)?.[1];

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => h.guardado[k] ?? null, setItem: () => {} } });
  h.ctx = {
    agenda: [], lembretes: [], acoes: [], cadencias: { monitoria_dias: 30, price_dias: 30 },
    agilTarefas: [], agilColunas: [], agilBoards: [], agilWorkspaces: [],
    opcoesPorTipo: () => [], atualizarCliente: vi.fn(), removerCliente: vi.fn(),
  };
});

describe('ClienteDetailPage: abas', () => {
  it('sem loja nem rede, a aba Lojas não existe', () => {
    expect(abas(abrir(pecita))).toEqual(['Histórico', 'Cadastro', 'Anotações', 'Tarefas (0)']);
  });

  it('com lojas do atendimento, a aba Lojas aparece na ordem da especificação', () => {
    const html = abrir({ ...pecita, lojasCadastro: [{ nome: 'Matriz', cnpj: '', endereco: '' }] });
    expect(abas(html)).toEqual(['Histórico', 'Cadastro', 'Lojas', 'Anotações', 'Tarefas (0)']);
  });

  it('rede só com este atendimento não abre a aba Lojas; com irmã, abre', () => {
    const naRede = { ...pecita, grupo: 'Rede X' };
    expect(abas(abrir(naRede))).not.toContain('Lojas');
    expect(abas(abrir(naRede, undefined, [{ ...pecita, id: 'c2', empresa: 'Rede X - Filial', grupo: 'Rede X' }]))).toContain('Lojas');
  });

  it('abre em Histórico por padrão e respeita a aba lembrada', () => {
    const padrao = abrir(pecita);
    expect(abaAtiva(padrao)).toBe('Histórico');
    expect(padrao).toContain('TIMELINE');
    expect(padrao).not.toContain('CADASTRO');

    const cadastro = abrir(pecita, 'cadastro');
    expect(abaAtiva(cadastro)).toBe('Cadastro');
    expect(cadastro).toContain('CADASTRO');
    expect(cadastro).not.toContain('TIMELINE');
  });

  it('aba lembrada que não existe neste cliente cai em Histórico', () => {
    for (const lembrada of ['lojas', 'aba-que-nao-existe']) {
      const html = abrir(pecita, lembrada);
      expect(abaAtiva(html)).toBe('Histórico');
      expect(html).toContain('TIMELINE');
    }
  });

  it('o rótulo de Tarefas conta só as pendentes deste cliente', () => {
    h.ctx.agilColunas = [{ id: 'a', titulo: 'A fazer' }, { id: 'z', titulo: 'Concluído' }];
    h.ctx.agilTarefas = [
      { id: '1', titulo: 'Pendente', clientId: 'c1', colunaId: 'a' },
      { id: '2', titulo: 'Entregue', clientId: 'c1', colunaId: 'z' },
      { id: '3', titulo: 'De outro', clientId: 'c2', colunaId: 'a' },
    ];
    expect(abas(abrir(pecita))).toContain('Tarefas (1)');
  });

  it('Tarefas sem nenhuma vinculada mostra a linha de vazio, não a aba em branco', () => {
    expect(abrir(pecita, 'tarefas')).toContain('Nenhuma tarefa vinculada a este cliente.');
  });
});

describe('ClienteDetailPage: anotações', () => {
  it('editam a observação na própria aba', () => {
    const html = abrir(pecita, 'anotacoes');
    expect(html).toContain('nota interna');
    expect(html).toContain('Salvar anotação');
    expect(html).not.toMatch(/<div hidden="">[^]*nota interna/);
  });

  it('continuam montadas em outra aba: trocar de aba não perde o que foi digitado', () => {
    expect(abrir(pecita, 'historico')).toMatch(/<div hidden="">[^]*nota interna/);
  });
});

describe('ClienteDetailPage: aba Lojas', () => {
  const irma = { ...pecita, id: 'c2', empresa: 'Rede X - Filial', grupo: 'Rede X' };

  it('lista as lojas do atendimento com CNPJ formatado', () => {
    const html = abrir({ ...pecita, lojasCadastro: [{ nome: 'Matriz', cnpj: '11222333000181', endereco: 'Rua A' }] }, 'lojas');
    expect(html).toContain('Lojas deste atendimento');
    expect(html).toContain('11.222.333/0001-81');
    expect(html).toContain('Rua A');
    expect(html).not.toContain('Outros atendimentos da rede');
  });

  it('liga às fichas irmãs, sem a própria, mantendo o voltar', () => {
    const html = abrir({ ...pecita, grupo: 'Rede X', empresa: 'Rede X - Matriz' }, 'lojas', [irma]);
    expect(html).toContain('Outros atendimentos da rede');
    expect(html).toContain('<a href="/clientes/c2" data-from="/acoes">Filial</a>');
    expect(html).not.toContain('href="/clientes/c1"');
    expect(html).not.toContain('Lojas deste atendimento');
  });
});
