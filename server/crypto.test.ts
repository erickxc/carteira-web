import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ENV_CHAVE_ORIGINAL = process.env.PRICE_CREDENCIAIS_CHAVE;
const ENV_PATH_ORIGINAL = process.env.PRICE_CREDENCIAIS_CHAVE_PATH;

let tmpDir: string;

// `config.cjs` lê a env pra dentro de uma const no MOMENTO do require — e é
// `require()` nativo do Node, que `vi.resetModules()` não limpa (isso só
// afeta o grafo do Vite pra `import`). Sem isso, o segundo teste sempre
// enxergaria a chave/arquivo do primeiro. Mesmo padrão de `autoAtualizacao.test.ts`.
//
// `PRICE_CREDENCIAIS_CHAVE_PATH` SEMPRE isolado num diretório temporário —
// sem isso, qualquer teste do caminho "sem chave no .env" (que agora
// auto-provisiona um arquivo) escreveria de verdade dentro do
// `ONEDRIVE_ROOT` real da máquina que roda `npm test` (já aconteceu esse
// tipo de vazamento neste projeto com outros testes, ver memória de
// `feedback_teste_agente_sqlite.md`).
function carregarComChave(chave: string | undefined) {
  // NUNCA `delete` de PRICE_CREDENCIAIS_CHAVE: `config.cjs` recarrega o
  // `.env` real do projeto a cada require, e só pula uma variável que já
  // existe em `process.env` (mesmo vazia) — `delete` faz ele reler a chave
  // de verdade do arquivo, e o teste de "sem chave" deixa de testar o
  // cenário que quer testar.
  process.env.PRICE_CREDENCIAIS_CHAVE = chave === undefined ? '' : chave;
  process.env.PRICE_CREDENCIAIS_CHAVE_PATH = path.join(tmpDir, 'price-credenciais-chave.txt');
  delete require.cache[require.resolve('./config.cjs')];
  delete require.cache[require.resolve('./crypto.cjs')];
  return require('./crypto.cjs') as typeof import('./crypto.cjs');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-crypto-test-'));
});

afterEach(() => {
  if (ENV_CHAVE_ORIGINAL === undefined) delete process.env.PRICE_CREDENCIAIS_CHAVE;
  else process.env.PRICE_CREDENCIAIS_CHAVE = ENV_CHAVE_ORIGINAL;
  if (ENV_PATH_ORIGINAL === undefined) delete process.env.PRICE_CREDENCIAIS_CHAVE_PATH;
  else process.env.PRICE_CREDENCIAIS_CHAVE_PATH = ENV_PATH_ORIGINAL;
  fs.rmSync(tmpDir, { recursive: true, force: true });
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

  /**
   * Bug real de produção: a premissa "só a máquina servidora precisa da
   * chave" era falsa — a cifragem roda em QUALQUER máquina que receba a
   * requisição de salvar (não há proxy pra servidora), e uma máquina sem
   * `PRICE_CREDENCIAIS_CHAVE` no `.env` caía com "não configurada" ao tentar
   * abrir o Price. Fix: sem a env, a chave é auto-provisionada num arquivo
   * dentro do OneDrive (`PRICE_CREDENCIAIS_CHAVE_PATH`) — a função nunca
   * mais lança por falta de configuração.
   */
  describe('sem PRICE_CREDENCIAIS_CHAVE no .env — auto-provisiona (nunca falha por falta de config)', () => {
    it('cifra e decifra normalmente, sem lançar', () => {
      const { cifrar, decifrar } = carregarComChave(undefined);
      const cifrado = cifrar('senha-sem-env');
      expect(decifrar(cifrado)).toBe('senha-sem-env');
    });

    it('grava um arquivo de chave dentro do PRICE_CREDENCIAIS_CHAVE_PATH', () => {
      const { cifrar } = carregarComChave(undefined);
      cifrar('dispara a criação do arquivo');
      const arquivoChave = process.env.PRICE_CREDENCIAIS_CHAVE_PATH!;
      expect(fs.existsSync(arquivoChave)).toBe(true);
      expect(fs.readFileSync(arquivoChave, 'utf8').trim().length).toBeGreaterThan(0);
    });

    it('duas "máquinas" (dois requires distintos) apontando pro MESMO arquivo convergem pra mesma chave', () => {
      const maquinaA = carregarComChave(undefined);
      const cifrado = maquinaA.cifrar('segredo-compartilhado');

      // "Outra máquina": novo require do módulo, MESMO PRICE_CREDENCIAIS_CHAVE_PATH
      // (não muda tmpDir nem o path — só recarrega o módulo, como aconteceria
      // num processo novo lendo o mesmo arquivo já sincronizado pelo OneDrive).
      delete require.cache[require.resolve('./config.cjs')];
      delete require.cache[require.resolve('./crypto.cjs')];
      const maquinaB = require('./crypto.cjs') as typeof import('./crypto.cjs');

      expect(maquinaB.decifrar(cifrado)).toBe('segredo-compartilhado');
    });

    it('arquivo de chave já existente (pré-semeado) é reaproveitado, não sobrescrito', () => {
      const arquivoChave = path.join(tmpDir, 'price-credenciais-chave.txt');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(arquivoChave, 'chave-ja-semeada-manualmente');
      process.env.PRICE_CREDENCIAIS_CHAVE = '';
      process.env.PRICE_CREDENCIAIS_CHAVE_PATH = arquivoChave;
      delete require.cache[require.resolve('./config.cjs')];
      delete require.cache[require.resolve('./crypto.cjs')];
      const { cifrar, decifrar } = require('./crypto.cjs') as typeof import('./crypto.cjs');

      cifrar('qualquer coisa'); // não deve regravar o arquivo
      expect(fs.readFileSync(arquivoChave, 'utf8')).toBe('chave-ja-semeada-manualmente');

      // E decifra certo com a chave semeada (prova que ela foi de fato usada).
      const cifrado = cifrar('teste');
      expect(decifrar(cifrado)).toBe('teste');
    });

    it('PRICE_CREDENCIAIS_CHAVE no .env (quando presente) tem prioridade sobre o arquivo', () => {
      const arquivoChave = path.join(tmpDir, 'price-credenciais-chave.txt');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(arquivoChave, 'chave-do-arquivo');
      process.env.PRICE_CREDENCIAIS_CHAVE = 'chave-do-env';
      process.env.PRICE_CREDENCIAIS_CHAVE_PATH = arquivoChave;
      delete require.cache[require.resolve('./config.cjs')];
      delete require.cache[require.resolve('./crypto.cjs')];
      const { cifrar } = require('./crypto.cjs') as typeof import('./crypto.cjs');
      const cifrado = cifrar('teste-prioridade');

      // Decifra com a chave do ARQUIVO devia falhar — quem cifrou usou a do .env.
      process.env.PRICE_CREDENCIAIS_CHAVE = '';
      delete require.cache[require.resolve('./config.cjs')];
      delete require.cache[require.resolve('./crypto.cjs')];
      const { decifrar: decifrarSoComArquivo } = require('./crypto.cjs') as typeof import('./crypto.cjs');
      expect(() => decifrarSoComArquivo(cifrado)).toThrow(/Falha ao decifrar/);

      // E decifra certo se a mesma chave do .env for restaurada.
      process.env.PRICE_CREDENCIAIS_CHAVE = 'chave-do-env';
      delete require.cache[require.resolve('./config.cjs')];
      delete require.cache[require.resolve('./crypto.cjs')];
      const { decifrar: decifrarComEnv } = require('./crypto.cjs') as typeof import('./crypto.cjs');
      expect(decifrarComEnv(cifrado)).toBe('teste-prioridade');
    });
  });
});
