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

function tela(equipe: Equipe | null, clientes: Cliente[], { abrirBlocos = false } = {}) {
  h.equipe = equipe;
  h.retrato = equipe === 'negocios' ? null : retrato;
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
