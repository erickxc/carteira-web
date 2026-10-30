import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnotacoesFicha } from './ClienteDetailPage';
import type { Cliente } from '../types';

// Sem DOM nos testes (vitest em `node`): o estado é guardado aqui entre renders,
// para ver o que acontece quando o contexto revalida com a ficha já montada.
const h = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  atualizarCliente: (() => Promise.resolve()) as (id: string, data: unknown) => Promise<void>,
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (init: unknown) => {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = init;
    return [h.slots[i], (v: unknown) => { h.slots[i] = typeof v === 'function' ? (v as (a: unknown) => unknown)(h.slots[i]) : v; }];
  },
}));
vi.mock('../context/CarteiraContext', () => ({
  useCarteira: () => ({ atualizarCliente: (id: string, data: unknown) => h.atualizarCliente(id, data) }),
}));
vi.mock('../utils/toast', async (original) => ({
  ...(await original<typeof import('../utils/toast')>()),
  toastError: vi.fn(),
}));

type Props = { children?: ReactNode; value?: string; disabled?: boolean; onChange?: (e: { target: { value: string } }) => void; onClick?: () => Promise<void> };

function render(observacao?: string) {
  h.cursor = 0;
  const filhos = (AnotacoesFicha({ cliente: { id: 'c1', observacao } as Cliente }) as { props: Props }).props.children as ReactNode[];
  const [campo, botao] = filhos.filter(isValidElement).map((e) => e.props as Props);
  return { campo, botao };
}

beforeEach(() => {
  h.slots = [];
  h.atualizarCliente = vi.fn(() => Promise.resolve());
});

describe('Anotações: acompanha o valor vivo sem sobrescrever o colega', () => {
  it('sem digitação, a revalidação troca o texto e o botão segue desligado', () => {
    render('nota antiga');
    const { campo, botao } = render('nota do colega');
    expect(campo.value).toBe('nota do colega');
    expect(botao.disabled).toBe(true);
  });

  it('com digitação, a revalidação não apaga o rascunho, e Salvar grava o rascunho', async () => {
    render('nota antiga').campo.onChange!({ target: { value: 'meu texto' } });
    const { campo, botao } = render('nota do colega');
    expect(campo.value).toBe('meu texto');
    expect(botao.disabled).toBe(false);
    await botao.onClick!();
    expect(h.atualizarCliente).toHaveBeenCalledWith('c1', { observacao: 'meu texto' });
  });

  it('desfazer a digitação volta a acompanhar o valor vivo', () => {
    const { campo } = render('nota');
    campo.onChange!({ target: { value: 'nota x' } });
    render('nota').campo.onChange!({ target: { value: 'nota' } });
    const depois = render('nota do colega');
    expect(depois.campo.value).toBe('nota do colega');
    expect(depois.botao.disabled).toBe(true);
  });

  it('depois de salvar, o rascunho sai e a tela volta ao valor vivo', async () => {
    render('nota').campo.onChange!({ target: { value: 'nova' } });
    await render('nota').botao.onClick!();
    const { campo, botao } = render('nova');
    expect(campo.value).toBe('nova');
    expect(botao.disabled).toBe(true);
  });

  it('falha ao salvar mantém o rascunho', async () => {
    h.atualizarCliente = vi.fn(() => Promise.reject(new Error('fora do ar')));
    render('nota').campo.onChange!({ target: { value: 'nova' } });
    await render('nota').botao.onClick!();
    expect(render('nota').campo.value).toBe('nova');
  });

  it('o que foi digitado enquanto salvava não se perde', async () => {
    render('nota').campo.onChange!({ target: { value: 'nova' } });
    const salvando = render('nota').botao.onClick!();
    render('nota').campo.onChange!({ target: { value: 'nova e mais' } });
    await salvando;
    const { campo, botao } = render('nova');
    expect(campo.value).toBe('nova e mais');
    expect(botao.disabled).toBe(false);
  });
});
