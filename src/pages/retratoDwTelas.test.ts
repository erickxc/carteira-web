import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import ClienteDetailPage from './ClienteDetailPage';
import ClientesPage from './ClientesPage';
import type { Equipe } from '../equipe/sessao';
import type { RetratoDw } from '../utils/produtosNoDw';
import type { Cliente } from '../types';

// Da busca do retrato até a célula, sem navegador: o efeito da busca roda já na
// renderização e o `then` responde na hora (setState durante o render é aceito).
const h = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  guardado: {} as Record<string, string>,
  equipe: null as string | null,
  buscar: null as unknown as Mock<() => unknown>,
}));

vi.mock('react', async (original) => {
  const real = await original<typeof import('react')>();
  return { ...real, useEffect: (efeito: () => void) => { if (String(efeito).includes('buscarRetratoDw')) efeito(); } };
});
vi.mock('../api/client', async (original) => ({ ...(await original<typeof import('../api/client')>()), buscarRetratoDw: () => h.buscar() }));
vi.mock('../context/CarteiraContext', () => ({ useCarteira: () => h.ctx }));
vi.mock('../equipe/sessao', () => ({ lerSessao: () => h.equipe }));
vi.mock('../components/ClientFormModal', () => ({ ClientFormModal: () => null }));
vi.mock('../components/alvos/PainelCadastroAlvos', () => ({ default: () => null }));
vi.mock('../components/Dropdown', () => ({ Dropdown: () => null }));
vi.mock('../components/cliente/TimelineCard', () => ({ TimelineCard: () => null }));
vi.mock('../components/cliente/CadastroCliente', () => ({ CadastroCliente: () => null }));

const retrato: RetratoDw = {
  geradoEm: 'x',
  porCnpj: { 111: { certificadoValidade: '2020-02-02', telefone: 'tel-loja', apura: { usuarios: 1, ultimoAcesso: '2026-10-28T12:00:00.000Z' } } },
};
const pecita = {
  id: 'c1', empresa: 'Pecita', monitor: 'Erick', status: 'Regular', estado: 'Ativo', servicos: [], contatos: [],
  lojasCadastro: [{ nome: 'Matriz', cnpj: '111', endereco: '' }],
} as unknown as Cliente;

/** Responde na primeira busca; as seguintes (re-render) não terminam, senão o render não para. */
function responderCom(valor: RetratoDw | null) {
  h.buscar = vi.fn(() => new Promise(() => {}));
  h.buscar.mockImplementationOnce(() => ({ then: (ok: (r: RetratoDw | null) => void) => { ok(valor); return { catch: () => {} }; } }));
}

function carteira(equipe: Equipe | null) {
  h.equipe = equipe;
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ClientesPage)));
}

function ficha(equipe: Equipe | null, aba: string) {
  h.equipe = equipe;
  h.guardado = { 'ficha:aba': JSON.stringify(aba) };
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/clientes/c1'] },
    createElement(Routes, null, createElement(Route, { path: '/clientes/:id', element: createElement(ClienteDetailPage) }))));
}

beforeEach(() => {
  h.guardado = {};
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => h.guardado[k] ?? null, setItem: () => {} } });
  h.ctx = {
    clientes: [pecita], agenda: [], lembretes: [], acoes: [], analisesIA: [], cadencias: { monitoria_dias: 30, price_dias: 30 },
    agilTarefas: [], agilColunas: [], agilBoards: [], agilWorkspaces: [], filtroMonitor: 'Todos',
    opcoesPorTipo: () => [], atualizarCliente: vi.fn(), removerCliente: vi.fn(), criarClientesEmLote: vi.fn(),
  };
});

describe('Carteira: busca do retrato', () => {
  it.each(['fiscal', 'admin'] as const)('%s busca, e a data buscada chega na coluna', (equipe) => {
    responderCom(retrato);
    expect(carteira(equipe)).toContain('02/02/2020 vencido');
    expect(h.buscar).toHaveBeenCalled();
  });

  it.each(['negocios', null] as const)('%s não busca', (equipe) => {
    responderCom(retrato);
    carteira(equipe);
    expect(h.buscar).not.toHaveBeenCalled();
  });

  it('falha na busca não derruba a lista: a coluna fica com "—"', async () => {
    h.buscar = vi.fn(() => Promise.reject(new Error('fora do ar')));
    const html = carteira('fiscal');
    expect(html).toContain('Vencimento Cert.');
    expect(html).toContain('>—<');
    // Rejeição sem catch reprovaria a execução inteira.
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
});

describe('Ficha: o retrato buscado chega nos blocos', () => {
  it('aba Lojas e bloco de acessos mostram os dados da loja', () => {
    responderCom(retrato);
    const html = ficha('fiscal', 'lojas');
    expect(html).toContain('02/02/2020 vencido');
    expect(html).toContain('tel-loja');
    expect(html).toContain('Apura — último acesso 28/10/2026');
  });

  it('ficha igual para todas as equipes: Negócios e sessão vazia também veem', () => {
    for (const equipe of ['negocios', null] as const) {
      responderCom(retrato);
      expect(ficha(equipe, 'lojas')).toContain('02/02/2020 vencido');
    }
  });

  it('retrato null ou falha na busca: a ficha abre sem linha fiscal', async () => {
    responderCom(null);
    const semRetrato = ficha('fiscal', 'lojas');
    expect(semRetrato).toContain('Matriz');
    expect(semRetrato).not.toContain('Certificado');
    h.buscar = vi.fn(() => Promise.reject(new Error('fora do ar')));
    expect(ficha('fiscal', 'lojas')).toContain('Matriz');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
});
