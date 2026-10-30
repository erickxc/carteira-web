import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalShell } from './ModalShell';

// Sem DOM nos testes: guarda o que iria pro portal e os efeitos, e dispara à mão.
const h = vi.hoisted(() => ({ efeitos: [] as (() => void)[], portal: null as unknown }));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (fn: () => void) => { h.efeitos.push(fn); },
}));
vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (no: unknown) => { h.portal = no; return null; },
}));

function montar(travarFechar: boolean) {
  const onClose = vi.fn();
  const teclado: ((e: { key: string }) => void)[] = [];
  vi.stubGlobal('document', {
    activeElement: null,
    addEventListener: (_: string, fn: (e: { key: string }) => void) => teclado.push(fn),
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) }); // sem animação: fecha na hora
  h.efeitos = [];
  renderToStaticMarkup(createElement(ModalShell, { title: 't', onClose, onSubmit: () => {}, footer: null, travarFechar, children: 'corpo' }));
  h.efeitos.forEach((efeito) => efeito());
  const overlay = h.portal as ReactElement<{ onClick?: () => void }>;
  return {
    onClose,
    esc: () => teclado.forEach((fn) => fn({ key: 'Escape' })),
    cliqueFora: () => overlay.props.onClick?.(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ModalShell: travarFechar', () => {
  it('solto: Esc e clique fora fecham', () => {
    const a = montar(false);
    a.esc();
    expect(a.onClose).toHaveBeenCalledTimes(1);
    const b = montar(false);
    b.cliqueFora();
    expect(b.onClose).toHaveBeenCalledTimes(1);
  });

  it('travado: nem Esc nem clique fora fecham', () => {
    const m = montar(true);
    m.esc();
    m.cliqueFora();
    expect(m.onClose).not.toHaveBeenCalled();
  });
});
