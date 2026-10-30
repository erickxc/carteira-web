import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { addDays, format, subDays } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClienteDetailPage from './ClienteDetailPage';
import type { Cliente, EventoAgenda, Lembrete } from '../types';

// Diferente de clienteDetailPage.test.ts, aqui os componentes da ficha são os REAIS:
// o espião só guarda as props e repassa. Assim uma aba sem a prop certa aparece no HTML.
type Props = Record<string, unknown>;
const h = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  guardado: {} as Record<string, string>,
  botoes: [] as Record<string, unknown>[],
  timeline: null as Record<string, unknown> | null,
  params: null as { id?: string } | null,
  toastError: vi.fn(),
}));

vi.mock('../context/CarteiraContext', () => ({ useCarteira: () => h.ctx }));
vi.mock('../api/client', async (original) => ({
  ...(await original<typeof import('../api/client')>()),
  buscarCatalogoAlvos: vi.fn(() => Promise.resolve()),
}));
vi.mock('../utils/toast', async (original) => ({
  ...(await original<typeof import('../utils/toast')>()),
  toastError: h.toastError,
}));
vi.mock('../ui', async (original) => {
  const real = await original<typeof import('../ui')>();
  return {
    ...real,
    Button: (props: Parameters<typeof real.Button>[0]) => {
      h.botoes.push(props as unknown as Props);
      return createElement(real.Button, props);
    },
  };
});
vi.mock('../components/cliente/TimelineCard', async (original) => {
  const real = await original<typeof import('../components/cliente/TimelineCard')>();
  return {
    ...real,
    TimelineCard: (props: Parameters<typeof real.TimelineCard>[0]) => {
      h.timeline = props as unknown as Props;
      return createElement(real.TimelineCard, props);
    },
  };
});
vi.mock('react-router-dom', async (original) => {
  const real = await original<typeof import('react-router-dom')>();
  return { ...real, useParams: () => h.params ?? real.useParams() };
});

const vazio = { id: 'c1', empresa: 'Pecita', status: 'Regular', estado: 'Ativo' } as Cliente;

function abrir(cliente: Cliente | null, aba?: string | { cru: string }, outros: Cliente[] = [], estado?: unknown) {
  h.guardado = aba === undefined ? {} : { 'ficha:aba': typeof aba === 'string' ? JSON.stringify(aba) : aba.cru };
  h.ctx.clientes = cliente ? [cliente, ...outros] : outros;
  h.botoes = [];
  h.timeline = null;
  return renderToStaticMarkup(createElement(MemoryRouter, {
    initialEntries: [{ pathname: `/clientes/${cliente?.id ?? 'sumiu'}`, state: estado }],
  }, createElement(Routes, null, createElement(Route, { path: '/clientes/:id', element: createElement(ClienteDetailPage) }))));
}

const abas = (html: string) => [...html.matchAll(/class="tab(?: is-active)?"[^>]*>([^<]*)</g)].map((m) => m[1]);
const abaAtiva = (html: string) => /class="tab is-active"[^>]*>([^<]*)</.exec(html)?.[1];
/** O que o usuário enxerga: tira o bloco de Anotações, que fica montado escondido. */
const semEscondido = (html: string) => html.replace(/<div hidden="">[^]*?<\/textarea>[^]*?<\/button>/, '');
const salvarAnotacao = () => h.botoes.find((b) => {
  const filhos = b.children;
  return Array.isArray(filhos) && filhos.some((f) => typeof f === 'string' && /Salvar anotação|Salvando/.test(f));
})!;
const dia = (d: Date) => format(d, "yyyy-MM-dd'T'00:00:00");

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => h.guardado[k] ?? null, setItem: () => {} } });
  h.params = null;
  h.toastError.mockClear();
  h.ctx = {
    agenda: [], lembretes: [], acoes: [], cadencias: { monitoria_dias: 30, price_dias: 30 },
    agilTarefas: [], agilColunas: [], agilBoards: [], agilWorkspaces: [],
    opcoesPorTipo: () => [], atualizarCliente: vi.fn(() => Promise.resolve()), removerCliente: vi.fn(),
  };
});

afterEach(() => vi.unstubAllGlobals());

describe('Ficha: trocar de cliente (Review Focus 5)', () => {
  it('cada cliente monta uma ficha nova: o estado local do anterior não passa para o irmão', () => {
    h.params = { id: 'c1' };
    const a = (ClienteDetailPage as () => ReactElement)();
    h.params = { id: 'c2' };
    const b = (ClienteDetailPage as () => ReactElement)();
    expect(a.key).toBe('c1');
    expect(b.key).toBe('c2');
    expect(a.type).toBe(b.type);
  });

  it('a ficha da irmã mostra os dados dela, não os da loja de onde se veio', () => {
    const irma = { ...vazio, id: 'c2', empresa: 'Rede X - Filial', grupo: 'Rede X', observacao: 'nota da filial' };
    const html = abrir(irma, 'anotacoes', [{ ...vazio, grupo: 'Rede X', empresa: 'Rede X - Matriz', observacao: 'nota da matriz' }]);
    expect(html).toContain('nota da filial');
    expect(html).not.toContain('nota da matriz');
  });
});

describe('Ficha: cliente vazio (Review Focus 1)', () => {
  it('sem nada cadastrado, nenhuma aba quebra e os blocos mostram a linha de vazio', () => {
    for (const aba of ['historico', 'cadastro', 'anotacoes', 'tarefas']) {
      const html = abrir(vazio, aba);
      expect(abaAtiva(html)).toBeTruthy();
      expect(html).toContain('Nenhuma conversa concluída');
      expect(html).toContain('Nenhuma reunião marcada');
      expect(html).toContain('Nenhum contato cadastrado');
    }
  });

  it('observação ausente abre em branco, nunca o texto "undefined"', () => {
    const html = abrir(vazio, 'anotacoes');
    expect(/<textarea[^>]*>([^<]*)<\/textarea>/.exec(html)?.[1]).toBe('');
    expect(html).not.toContain('undefined');
  });
});

describe('Ficha: o que saiu da página', () => {
  it('Lojas do grupo, card do Ágil e campos de anotação não aparecem em Histórico', () => {
    const html = abrir({ ...vazio, grupo: 'Rede X' }, 'historico', [{ ...vazio, id: 'c2', empresa: 'Rede X - Filial', grupo: 'Rede X' }]);
    const visivel = semEscondido(html);
    expect(html).not.toContain('Lojas do grupo');
    expect(visivel).not.toContain('Tarefas Ágil');
    expect(visivel).not.toContain('Lojas deste atendimento');
    expect(visivel).not.toContain('Outros atendimentos da rede');
    expect(visivel).not.toContain('Salvar anotação');
    expect(visivel).not.toMatch(/<textarea/);
  });

  it('só existe um campo de anotação na página', () => {
    expect(abrir({ ...vazio, observacao: 'nota' }, 'anotacoes').match(/<textarea/g)).toHaveLength(1);
  });
});

describe('Ficha: aba lembrada', () => {
  it('lembrança corrompida ou de outro tipo cai em Histórico', () => {
    for (const cru of ['{quebrado', '42', 'null', '{"a":1}']) {
      const html = abrir(vazio, { cru });
      expect(abaAtiva(html)).toBe('Histórico');
      expect(h.timeline).not.toBeNull();
    }
  });

  it('a mesma lembrança "lojas" vale no cliente que tem a aba', () => {
    expect(abaAtiva(abrir(vazio, 'lojas'))).toBe('Histórico');
    expect(abaAtiva(abrir({ ...vazio, lojasCadastro: [{ nome: 'Matriz', cnpj: '', endereco: '' }] }, 'lojas'))).toBe('Lojas');
  });

  it('grupo vazio não junta clientes sem rede, nem abre a aba Lojas', () => {
    const html = abrir({ ...vazio, grupo: '' }, undefined, [{ ...vazio, id: 'c2', empresa: 'Outro', grupo: '' }]);
    expect(abas(html)).not.toContain('Lojas');
  });

  it('lista de lojas vazia não abre a aba Lojas', () => {
    expect(abas(abrir({ ...vazio, lojasCadastro: [] }))).not.toContain('Lojas');
  });
});

describe('Ficha: aba Cadastro', () => {
  const completo = {
    ...vazio,
    observacao: 'nota interna',
    produtos: [{ produto: 'Plataforma 2D', fase: 'Ativo', faseDesde: '2026-01-10' }],
  } as unknown as Cliente;

  it('é só leitura: nenhum campo editável, fase em texto, sem o botão de gravar fase', () => {
    const visivel = semEscondido(abrir(completo, 'cadastro'));
    expect(visivel).toContain('Plataforma 2D');
    expect(visivel).toContain('Ativo desde');
    expect(visivel).not.toMatch(/<(input|textarea|select)\b/);
    expect(visivel).not.toContain('Salvar fase');
  });

  it('a observação fica só na aba Anotações', () => {
    expect(semEscondido(abrir(completo, 'cadastro'))).not.toContain('nota interna');
  });
});

describe('Ficha: abas no celular', () => {
  it('quebram linha: em 390px as 5 abas não cabem e a página não tem rolagem horizontal', () => {
    expect(abrir(vazio)).toMatch(/class="tabs" style="[^"]*flex-wrap:wrap/);
  });
});

describe('Ficha: Salvar anotação', () => {
  const comNota = { ...vazio, observacao: 'nota' };

  it('sem mudança o botão fica desligado, inclusive com observação ausente', () => {
    abrir(comNota, 'anotacoes');
    expect(salvarAnotacao().disabled).toBe(true);
    abrir(vazio, 'anotacoes');
    expect(salvarAnotacao().disabled).toBe(true);
  });

  it('grava só a observação, no cliente da ficha: não reescreve o resto do cadastro', async () => {
    abrir(comNota, 'anotacoes');
    await (salvarAnotacao().onClick as () => Promise<void>)();
    expect(h.ctx.atualizarCliente).toHaveBeenCalledTimes(1);
    expect(h.ctx.atualizarCliente).toHaveBeenCalledWith('c1', { observacao: 'nota' });
  });

  it('falha ao salvar vira aviso na tela, não rejeição solta', async () => {
    h.ctx.atualizarCliente = vi.fn(() => Promise.reject(new Error('Servidor fora do ar')));
    abrir(comNota, 'anotacoes');
    await expect((salvarAnotacao().onClick as () => Promise<void>)()).resolves.toBeUndefined();
    expect(h.toastError).toHaveBeenCalledWith('Servidor fora do ar');
  });

  it('falha sem mensagem ainda avisa', async () => {
    h.ctx.atualizarCliente = vi.fn(() => Promise.reject('x'));
    abrir(comNota, 'anotacoes');
    await (salvarAnotacao().onClick as () => Promise<void>)();
    expect(h.toastError).toHaveBeenCalledWith('Não foi possível salvar. Tente de novo.');
  });
});

describe('Ficha: cliente inexistente e Voltar', () => {
  it('cliente que não existe (ou ainda não carregou) não monta abas nem grava nada', () => {
    const html = abrir(null);
    expect(html).toContain('Cliente não encontrado.');
    expect(abas(html)).toEqual([]);
    expect(html).not.toContain('<textarea');
    expect(h.ctx.atualizarCliente).not.toHaveBeenCalled();
  });

  it('Voltar usa a origem da navegação; sem origem, a Carteira', () => {
    expect(abrir(vazio, undefined, [], { from: '/acoes', fromLabel: 'Ações' })).toContain('Voltar para Ações');
    expect(abrir(vazio)).toContain('Voltar para Carteira');
  });
});

describe('Ficha: rótulo de Tarefas bate com a aba', () => {
  const colunas = [{ id: 'a', titulo: 'A fazer' }, { id: 'z', titulo: 'Concluído' }, { id: 'f', titulo: 'Feito' }];
  const tarefa = (id: string, colunaId: string, clientId = 'c1') => ({ id, titulo: `Tarefa-${id}`, clientId, colunaId, boardId: 'b' });

  it('rótulo e card contam igual; coluna que não existe mais conta como pendente', () => {
    h.ctx.agilColunas = colunas;
    h.ctx.agilTarefas = [tarefa('1', 'a'), tarefa('2', 'sumiu'), tarefa('3', 'z'), tarefa('4', 'f'), tarefa('5', 'a', 'c2')];
    const html = abrir(vazio, 'tarefas');
    expect(abas(html)).toContain('Tarefas (2)');
    expect(html).toContain('2 pendente(s)');
    expect(html).not.toContain('Tarefa-3');
    expect(html).not.toContain('Tarefa-5');
  });

  it('tudo concluído: zero no rótulo e a linha "tudo concluído", não a de "nenhuma vinculada"', () => {
    h.ctx.agilColunas = colunas;
    h.ctx.agilTarefas = [tarefa('3', 'z')];
    const html = abrir(vazio, 'tarefas');
    expect(abas(html)).toContain('Tarefas (0)');
    expect(html).toContain('Tudo concluído');
    expect(html).not.toContain('Nenhuma tarefa vinculada');
  });

  it('a contagem no rótulo aparece mesmo com outra aba aberta', () => {
    h.ctx.agilColunas = colunas;
    h.ctx.agilTarefas = [tarefa('1', 'a')];
    const html = abrir(vazio, 'historico');
    expect(abas(html)).toContain('Tarefas (1)');
    expect(html).not.toContain('Tarefas Ágil');
  });
});

describe('Ficha: aba Lojas', () => {
  const rede = { ...vazio, grupo: 'Rede X', empresa: 'Rede X - Matriz' };

  it('loja sem CNPJ e sem endereço mostra só o nome, sem separador solto', () => {
    const html = abrir({ ...vazio, lojasCadastro: [{ nome: 'Matriz', cnpj: '', endereco: '' }] }, 'lojas');
    expect(html).toContain('<strong>Matriz</strong></p>');
  });

  it('irmã sem o prefixo da rede mantém o nome; nome só com o prefixo não vira link em branco', () => {
    const html = abrir(rede, 'lojas', [
      { ...vazio, id: 'c2', empresa: 'Filial Solta', grupo: 'Rede X' },
      { ...vazio, id: 'c3', empresa: 'Rede X - ', grupo: 'Rede X' },
    ]);
    expect(html).toMatch(/href="\/clientes\/c2"[^>]*>Filial Solta</);
    expect(html).toMatch(/href="\/clientes\/c3"[^>]*>Rede X - </);
  });

  it('atendimento de outra rede não entra nos links', () => {
    const html = abrir(rede, 'lojas', [
      { ...vazio, id: 'c2', empresa: 'Rede X - Filial', grupo: 'Rede X' },
      { ...vazio, id: 'c9', empresa: 'Rede Y - Outra', grupo: 'Rede Y' },
    ]);
    expect(html).toContain('href="/clientes/c2"');
    expect(html).not.toContain('href="/clientes/c9"');
  });

  it('as irmãs vêm em ordem alfabética', () => {
    const html = abrir(rede, 'lojas', [
      { ...vazio, id: 'c3', empresa: 'Rede X - Zeta', grupo: 'Rede X' },
      { ...vazio, id: 'c2', empresa: 'Rede X - Alfa', grupo: 'Rede X' },
    ]);
    expect(html.indexOf('Alfa')).toBeLessThan(html.indexOf('Zeta'));
  });
});

describe('Ficha: Histórico montado na página', () => {
  const evento = (id: string, date: Date, extra: Partial<EventoAgenda> = {}) => ({
    id, clientId: 'c1', date: dia(date), type: 'Reunião', subject: `Assunto ${id}`, status: 'Agendado',
    servicos: ['Monitoria'], monitores: [], attachments: [], ...extra,
  }) as unknown as EventoAgenda;
  const lembrete = (id: string, datetime: Date, eventId?: string) => ({
    id, clientId: 'c1', titulo: `Lembrete ${id}`, datetime: dia(datetime), eventId, status: 'pendente',
  }) as unknown as Lembrete;
  const itens = () => h.timeline!.timeline as { kind: string; id: string; lembretes?: { id: string }[] }[];

  it('lembrete dentro da janela de reunião fora dela não some e a reunião conta como oculta (Review Focus 2)', () => {
    const hoje = new Date();
    h.ctx.agenda = [evento('longe', addDays(hoje, 12))];
    h.ctx.lembretes = [lembrete('L1', addDays(hoje, 5), 'longe')];
    abrir(vazio);
    expect(itens().map((i) => `${i.kind}:${i.id}`)).toEqual(['lembrete:L1']);
    expect(h.timeline!.totalOcultos).toBe(1);
  });

  it('lembrete de evento cancelado na janela continua visível, dentro do card', () => {
    const hoje = new Date();
    h.ctx.agenda = [evento('cancelado', subDays(hoje, 2), { status: 'Cancelado' })];
    h.ctx.lembretes = [lembrete('L1', subDays(hoje, 3), 'cancelado')];
    abrir(vazio);
    expect(itens()).toHaveLength(1);
    expect(itens()[0].id).toBe('cancelado');
    expect(itens()[0].lembretes?.map((l) => l.id)).toEqual(['L1']);
    expect(h.timeline!.totalOcultos).toBe(0);
  });

  it('lembrete de outro cliente não entra', () => {
    h.ctx.lembretes = [{ ...lembrete('L9', new Date()), clientId: 'c2' }];
    abrir(vazio);
    expect(itens()).toEqual([]);
  });

  it('precificação salva na loja-irmã aparece no histórico desta loja (Review Focus 3)', () => {
    const irma = { ...vazio, id: 'c2', empresa: 'Rede X - Filial', grupo: 'Rede X', servicos: ['2D Price'] } as Cliente;
    h.ctx.agenda = [evento('p1', subDays(new Date(), 1), { clientId: 'c2', type: 'Reunião de Precificação', servicos: ['2D Price'], status: 'Concluído' })];
    abrir({ ...vazio, grupo: 'Rede X', empresa: 'Rede X - Matriz', servicos: ['2D Price'] } as Cliente, 'historico', [irma]);
    expect(itens().map((i) => i.id)).toEqual(['p1@c1']);
  });
});
