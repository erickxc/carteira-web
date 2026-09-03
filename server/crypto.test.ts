import { createRequire } from 'module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ENV_ORIGINAL = process.env.PRICE_CREDENCIAIS_CHAVE;

// `config.cjs` lê a env pra dentro de uma const no MOMENTO do require — e é
// `require()` nativo do Node, que `vi.resetModules()` não limpa (isso só
// afeta o grafo do Vite pra `import`). Sem isso, o segundo teste sempre
// enxergaria a chave do primeiro. Mesmo padrão de `autoAtualizacao.test.ts`.
function carregarComChave(chave: string | undefined) {
  // NUNCA `delete`: `config.cjs` recarrega o `.env` real do projeto a cada
  // require, e só pula uma variável que já existe em `process.env` (mesmo
  // vazia) — `delete` faz ele reler a chave de verdade do arquivo, e o teste
  // de "sem chave" deixa de testar o cenário que quer testar.
  process.env.PRICE_CREDENCIAIS_CHAVE = chave === undefined ? '' : chave;
  delete require.cache[require.resolve('./config.cjs')];
  delete require.cache[require.resolve('./crypto.cjs')];
  return require('./crypto.cjs') as typeof import('./crypto.cjs');
}

afterEach(() => {
  if (ENV_ORIGINAL === undefined) delete process.env.PRICE_CREDENCIAIS_CHAVE;
  else process.env.PRICE_CREDENCIAIS_CHAVE = ENV_ORIGINAL;
});

describe('crypto: cifrar/decifrar credencial do Price', () => {
  it('cifra e decifra de volta pro texto original', () => {
    const { cifrar, decifrar } = carregarComChave('chave-de-teste-123');
    const cifrado = cifrar('minhaSenha!2026');
    expect(cifrado).not.toContain('minhaSenha');
    expect(decifrar(cifrado)).toBe('minhaSenha!2026');
  });

  it('duas cifragens da MESMA senha dão resultados DIFERENTES (IV aleatório)', () => {
    const { cifrar } = carregarComChave('chave-de-teste-123');
    expect(cifrar('mesma-senha')).not.toBe(cifrar('mesma-senha'));
  });

  it('string vazia ou null vira string vazia, não cifra "nada"', () => {
    const { cifrar, decifrar } = carregarComChave('chave-de-teste-123');
    expect(cifrar('')).toBe('');
    expect(cifrar(null as unknown as string)).toBe('');
    expect(decifrar('')).toBe('');
  });

  it('sem PRICE_CREDENCIAIS_CHAVE no .env, cifrar falha explícito (nunca silencioso)', () => {
    const { cifrar } = carregarComChave(undefined);
    expect(() => cifrar('qualquer coisa')).toThrow(/PRICE_CREDENCIAIS_CHAVE/);
  });

  it('decifrar com a CHAVE ERRADA falha explícito, não devolve lixo como senha válida', () => {
    const { cifrar } = carregarComChave('chave-certa');
    const cifrado = cifrar('senha-real');
    const { decifrar } = carregarComChave('chave-errada');
    expect(() => decifrar(cifrado)).toThrow(/Falha ao decifrar/);
  });

  it('dado corrompido na célula falha explícito em vez de decifrar errado', () => {
    const { cifrar, decifrar } = carregarComChave('chave-de-teste-123');
    const cifrado = cifrar('senha-real');
    const corrompido = cifrado.slice(0, -4) + 'AAAA';
    expect(() => decifrar(corrompido)).toThrow();
  });
});
