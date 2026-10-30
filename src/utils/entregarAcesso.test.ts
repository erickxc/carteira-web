import { afterEach, describe, expect, it, vi } from 'vitest';
import { entregarAcesso } from './entregarAcesso';

function ambiente(opts: { clipboardFalha?: boolean; execCommand?: boolean; popupBloqueado?: boolean } = {}) {
  const ordem: string[] = [];
  const writeText = vi.fn(async () => {
    ordem.push('copiou');
    if (opts.clipboardFalha) throw new Error('NotAllowedError');
  });
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.stubGlobal('document', {
    createElement: () => ({ style: {}, select: vi.fn(), remove: vi.fn() }),
    body: { appendChild: vi.fn() },
    execCommand: vi.fn(() => opts.execCommand ?? false),
  });
  const aba = { opener: 'pagina' as unknown };
  vi.stubGlobal('window', { open: vi.fn(() => { ordem.push('abriu'); return opts.popupBloqueado ? null : aba; }) });
  return { ordem, aba };
}

afterEach(() => vi.unstubAllGlobals());

describe('entregarAcesso', () => {
  it('copia antes de abrir a aba (a aba nova tiraria o foco e a cópia falharia) e corta o opener', async () => {
    const { ordem, aba } = ambiente();
    expect(await entregarAcesso('s', 'http://x')).toEqual({ copiou: true, abriu: true });
    expect(ordem).toEqual(['copiou', 'abriu']);
    expect(aba.opener).toBeNull();
  });

  it('sem clipboard (HTTP na LAN) cai no execCommand', async () => {
    ambiente({ clipboardFalha: true, execCommand: true });
    expect(await entregarAcesso('s')).toEqual({ copiou: true, abriu: true });
  });

  it('as duas cópias falhando devolve copiou=false', async () => {
    ambiente({ clipboardFalha: true, execCommand: false });
    expect((await entregarAcesso('s', 'http://x')).copiou).toBe(false);
  });

  it('pop-up bloqueado devolve abriu=false; sem link não há o que abrir', async () => {
    ambiente({ popupBloqueado: true });
    expect((await entregarAcesso('s', 'http://x')).abriu).toBe(false);
    expect((await entregarAcesso('s')).abriu).toBe(true);
  });
});
