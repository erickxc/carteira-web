import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AcessosExternosButton, ListaAcessos } from './AcessosExternosButton';
import { AnaliseIACard } from './AnaliseIACard';
import { CabecalhoFicha } from './CabecalhoFicha';
import { PainelFicha } from './PainelFicha';
import type { ContatoVisivel } from '../../utils/contatos';
import type { AnaliseIA, Cliente } from '../../types';

// Sem DOM nos testes (vitest em `node`): o estado é forçado aqui para ver o menu
// aberto e a análise carregada, que o renderToStaticMarkup sozinho nunca alcança.
const h = vi.hoisted(() => ({ analise: undefined as unknown, aberto: false, setter: (() => {}) as (v: unknown) => void }));

vi.mock('react', async (original) => {
  const real = await original<typeof import('react')>();
  return {
    ...real,
    useState: (init: unknown) => [init === undefined ? h.analise : init === false ? h.aberto : init, (v: unknown) => h.setter(v)],
    useEffect: () => {},
    useRef: (current: unknown) => ({ current }),
  };
});

type Props = { children?: ReactNode; role?: string; onClick?: () => void };

function elementos(no: ReactNode): { props: Props }[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as unknown as { props: Props };
  return [el, ...elementos(el.props.children)];
}

function texto(no: ReactNode): string {
  if (typeof no === 'string' || typeof no === 'number') return String(no);
  if (Array.isArray(no)) return no.map(texto).join('');
  return isValidElement(no) ? texto((no.props as Props).children) : '';
}

const clicar = (arvore: ReactNode, rotulo: string) => {
  const alvos = elementos(arvore).filter((e) => e.props.onClick && texto(e.props.children).includes(rotulo));
  expect(alvos, `um único clicável com "${rotulo}"`).toHaveLength(1);
  alvos[0].props.onClick!();
};

const cliente = { id: 'c1', empresa: 'Pecita', monitor: 'Erick', status: 'Regular', estado: 'Ativo' } as unknown as Cliente;

beforeEach(() => {
  h.analise = undefined;
  h.aberto = false;
  h.setter = () => {};
});

describe('CabecalhoFicha: cada ação chama o callback certo', () => {
  const NOMES = ['onNovoEvento', 'onLembrete', 'onContatoCliente', 'onEditar', 'onRelatorios', 'onExcluir'] as const;
  const callbacks = () => Object.fromEntries(NOMES.map((n) => [n, vi.fn<() => void>()])) as Record<(typeof NOMES)[number], Mock<() => void>>;
  const soChamou = (cb: ReturnType<typeof callbacks>, nome: (typeof NOMES)[number]) => {
    for (const n of NOMES) expect(cb[n], n).toHaveBeenCalledTimes(n === nome ? 1 : 0);
  };

  it.each([
    ['Novo evento', 'onNovoEvento'],
    ['Lembrete', 'onLembrete'],
    ['Cliente entrou em contato', 'onContatoCliente'],
    ['Editar cadastro', 'onEditar'],
  ] as const)('%s', (rotulo, nome) => {
    const cb = callbacks();
    clicar(CabecalhoFicha({ cliente, ...cb }), rotulo);
    soChamou(cb, nome);
  });

  it.each([['Relatórios', 'onRelatorios'], ['Excluir', 'onExcluir']] as const)('menu aberto: %s dispara e fecha o menu', (rotulo, nome) => {
    h.aberto = true;
    const fechar = vi.fn();
    h.setter = fechar;
    const cb = callbacks();
    clicar(CabecalhoFicha({ cliente, ...cb }), rotulo);
    soChamou(cb, nome);
    expect(fechar).toHaveBeenCalledWith(false);
  });

  it('abrir o menu não exclui nada, e Excluir aparece em vermelho, sem pílula', () => {
    h.aberto = true;
    const cb = callbacks();
    const html = renderToStaticMarkup(createElement(CabecalhoFicha, { cliente, ...cb }));
    expect(html).toMatch(/role="menu"/);
    expect(html).toMatch(/danger-fg[^>]*>.*Excluir/);
    for (const n of NOMES) expect(cb[n]).not.toHaveBeenCalled();
  });

  it('só com o nome: a linha de situação fica vazia, sem separador nem "Rede" solto', () => {
    const html = renderToStaticMarkup(createElement(CabecalhoFicha, { cliente: { id: 'c', empresa: 'Só nome' } as Cliente, ...callbacks() }));
    expect(html).toContain('Só nome');
    expect(html).not.toContain('·');
    expect(html).not.toContain('Rede');
  });
});

describe('PainelFicha: cliques dos contatos', () => {
  const contato = (n: number) => ({ id: `k${n}`, nome: `Pessoa ${n}`, cargo: '', telefone: `2199999000${n}` }) as unknown as ContatoVisivel;
  const VAZIO = { prazos: [], ultima: null, proxima: null };

  it('WhatsApp manda o contato daquela linha', () => {
    const onWhatsApp = vi.fn();
    const contatos = [contato(1), contato(2)];
    const arvore = PainelFicha({ cliente, resumo: VAZIO, contatos, onWhatsApp, onVerContatos: () => {} });
    const botoes = elementos(arvore).filter((e) => e.props.onClick && texto(e.props.children).includes('WhatsApp'));
    botoes[1].props.onClick!();
    expect(onWhatsApp).toHaveBeenCalledExactlyOnceWith(contatos[1]);
  });

  it('"ver todos" abre os contatos, e contato sem cargo não sobra separador', () => {
    const onVerContatos = vi.fn();
    const arvore = PainelFicha({ cliente, resumo: VAZIO, contatos: [contato(1)], onWhatsApp: () => {}, onVerContatos });
    clicar(arvore, 'ver todos (1)');
    expect(onVerContatos).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(createElement(MemoryRouter, null, arvore))).toContain('<span style="min-width:0">Pessoa 1</span>');
  });

  it('próxima sem assunto cai no tipo', () => {
    const proxima = { id: 'e', subject: '', type: 'Ligação', status: 'Agendado', date: new Date(2026, 10, 3).toISOString(), time: '' };
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, PainelFicha({ cliente, resumo: { ...VAZIO, proxima: proxima as never }, contatos: [], onWhatsApp: () => {}, onVerContatos: () => {} })));
    expect(html).toContain('03/11 · Ligação');
  });
});

describe('AnaliseIACard compacto', () => {
  const ANALISE = { nivelRisco: 'alto', resumo: 'Parágrafo da análise', fatores: ['Fator oculto'], sugestaoProximaPauta: 'Pauta oculta' } as AnaliseIA;
  const card = (props: { compacto?: boolean; variante?: 'padrao' | 'popover' }) =>
    renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AnaliseIACard, { clienteId: 'c1', ...props })));

  it('só risco, parágrafo e botão: sem colapso, sem fatores/pauta e sem Card próprio', () => {
    h.analise = ANALISE;
    const html = card({ compacto: true });
    expect(html).toContain('Risco alto');
    expect(html).toContain('Parágrafo da análise');
    expect(html).toContain('Vamos falar sobre isso?');
    expect(html).not.toContain('Ver mais');
    expect(html).not.toContain('Fator oculto');
    expect(html).not.toContain('Pauta oculta');
    expect(html).not.toContain('bg-card border');
  });

  it('sem análise: fica de pé com a linha de vazio, sem botão', () => {
    h.analise = null;
    const html = card({ compacto: true });
    expect(html).toContain('Ainda não analisado');
    expect(html).not.toContain('Vamos falar sobre isso?');
  });

  it('as outras formas do card não mudaram', () => {
    h.analise = ANALISE;
    const padrao = card({});
    expect(padrao).toContain('Ver mais');
    expect(padrao).toContain('bg-card border');
    const popover = card({ variante: 'popover' });
    expect(popover).not.toContain('Vamos falar sobre isso?');
    expect(popover).not.toContain('bg-card border');
  });
});

describe('Acessos: a lista à vista e o botão oferecem o mesmo', () => {
  const com = (extra: object) => ({ ...cliente, ...extra }) as unknown as Cliente;
  const lista = (c: Cliente) => renderToStaticMarkup(createElement(ListaAcessos, { cliente: c }));
  const botao = (c: Cliente, compacto = false) => renderToStaticMarkup(createElement(AcessosExternosButton, { cliente: c, compacto }));

  it('produto cancelado não oferece acesso, nem pelo link antigo em linksServicos', () => {
    const c = com({
      produtos: [{ produto: '2D Price', fase: 'Cancelado', link: 'https://price.exemplo' }, { produto: 'Plataforma 2D', fase: 'Cancelado', temSenha: true }],
      temSenhaPrice: true,
      linksServicos: { 'Plataforma 2D': 'https://bi.exemplo' },
    });
    expect(lista(c)).toContain('Nenhum acesso cadastrado');
    expect(botao(c)).toBe('');
  });

  it('Price com senha entra como login, e a senha não chega à tela', () => {
    const html = lista(com({
      produtos: [{ produto: '2D Price', fase: 'Ativo', link: 'https://price.exemplo' }, { produto: 'Plataforma 2D', fase: 'Ativo', temSenha: true }],
      temSenhaPrice: true,
      senhaPrice: 'segredo-price',
      loginPrice: 'login-price',
    }));
    for (const rotulo of ['title="Abrir 2D Price"', 'title="Abrir Price"', 'title="Abrir Plataforma 2D"']) expect(html).toContain(rotulo);
    expect(html).not.toContain('segredo-price');
    expect(html).not.toContain('login-price');
  });

  it('botão como antes: nada sem acesso (traço no compacto), direto com um, popover com dois', () => {
    expect(botao(cliente)).toBe('');
    expect(botao(cliente, true)).toContain('—');
    const um = { produtos: [{ produto: 'Plataforma 2D', fase: 'Ativo', link: 'https://bi.exemplo' }] };
    expect(botao(com(um))).toContain('title="Abrir Plataforma 2D"');
    const dois = { produtos: [...um.produtos, { produto: '2D Price', fase: 'Ativo', link: 'https://price.exemplo' }] };
    expect(botao(com(dois))).not.toContain('Abrir Plataforma 2D');
    expect(lista(com(dois))).toContain('title="Abrir 2D Price"');
  });
});
