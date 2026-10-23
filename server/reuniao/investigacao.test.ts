import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { criarInvestigador, separarFontes } from './investigacao.cjs';

// Cada investigação é uma rodada completa do agente (cara, 10-60 s). O
// investigador garante uma por vez, sem repetir assunto e no teto da reunião.
const pendente = () => {
  let resolver: (v: string) => void = () => {};
  const p = new Promise<string>((r) => { resolver = r; });
  return { p, resolver: (v: string) => resolver(v) };
};

describe('investigador da reunião', () => {
  it('uma por vez, sem repetir chave, no máximo o limite', async () => {
    const chamadas: ReturnType<typeof pendente>[] = [];
    const investigar = vi.fn(() => { const c = pendente(); chamadas.push(c); return c.p; });
    const aoConcluir = vi.fn();
    const inv = criarInvestigador({ cwd: 'x', investigar, aoConcluir, limite: 2 });

    expect(inv.pedir({ chave: 'cancelar', oQueDisse: 'vamos cancelar' })).toBe(true);
    expect(inv.pedir({ chave: 'margem', oQueDisse: 'margem ruim' })).toBe(false); // ocupado
    chamadas[0].resolver('Leitura A\nFontes: dossie.md');
    await vi.waitFor(() => expect(aoConcluir).toHaveBeenCalledTimes(1));
    expect(inv.pedir({ chave: 'cancelar', oQueDisse: 'de novo' })).toBe(false); // repetida
    expect(inv.pedir({ chave: 'margem', oQueDisse: 'margem ruim' })).toBe(true);
    chamadas[1].resolver('Leitura B');
    await vi.waitFor(() => expect(aoConcluir).toHaveBeenCalledTimes(2));
    expect(inv.pedir({ chave: 'outra', oQueDisse: 'x' })).toBe(false); // limite
    expect(aoConcluir).toHaveBeenNthCalledWith(1, { tipo: 'analise', chave: 'cancelar', texto: 'Leitura A', acao: '', fontes: 'dossie.md' });
  });

  it('falha do agente não lança e libera para a próxima', async () => {
    const investigar = vi.fn().mockRejectedValueOnce(new Error('fora')).mockResolvedValueOnce('ok');
    const aoConcluir = vi.fn();
    const inv = criarInvestigador({ cwd: 'x', investigar, aoConcluir });
    inv.pedir({ chave: 'a', oQueDisse: 'x' });
    await vi.waitFor(() => expect(inv.ocupado()).toBe(false));
    expect(aoConcluir).not.toHaveBeenCalled();
    expect(inv.pedir({ chave: 'b', oQueDisse: 'y' })).toBe(true);
  });

  it('o material da pasta vai no próprio pedido, com o fim mais recente da transcrição', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pasta-'));
    fs.writeFileSync(path.join(pasta, 'dossie.md'), 'DOSSIE-X');
    fs.writeFileSync(path.join(pasta, 'transcricao.txt'), 'a'.repeat(20000) + 'FALA-RECENTE');
    const investigar = vi.fn(async () => 'ok');
    criarInvestigador({ cwd: pasta, investigar, aoConcluir: vi.fn() }).pedir({ chave: 'k', oQueDisse: 'vamos cancelar' });
    const { prompt } = investigar.mock.calls[0][0] as { prompt: string };
    expect(prompt).toContain('DOSSIE-X');
    expect(prompt).toContain('FALA-RECENTE');
    expect(prompt).toContain('vamos cancelar');
    expect(prompt.length).toBeLessThan(20000);
  });

  it('sem provedor que investigue (Ollama), recusa tudo', () => {
    const inv = criarInvestigador({ cwd: 'x', investigar: null, aoConcluir: vi.fn() });
    expect(inv.pedir({ chave: 'a', oQueDisse: 'x' })).toBe(false);
  });

  it('separa texto, o que fazer e fontes', () => {
    expect(separarFontes('Queda de 18%.\nO que fazer: pergunte do preço.\nFontes: alvos.json')).toEqual({ texto: 'Queda de 18%.', acao: 'pergunte do preço.', fontes: 'alvos.json' });
  });

  it('separa texto da linha de fontes', () => {
    expect(separarFontes('Texto longo\n\nFontes: alvos.json, dossie.md')).toEqual({ texto: 'Texto longo', acao: '', fontes: 'alvos.json, dossie.md' });
    expect(separarFontes('Sem fontes')).toEqual({ texto: 'Sem fontes', acao: '', fontes: '' });
  });
});
