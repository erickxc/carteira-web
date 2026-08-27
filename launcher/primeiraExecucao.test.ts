import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let tmpDir: string;
let ponteiroPath: string;
let primeiraExecucao: typeof import('./primeiraExecucao.cjs');

function limparCacheDe(modulePath: string) {
  delete require.cache[require.resolve(modulePath)];
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-primeira-exec-'));
  ponteiroPath = path.join(tmpDir, 'ponteiro', 'pasta-instalacao.txt');
  process.env.CARTEIRA_PONTEIRO_INSTALL = ponteiroPath;
  process.env.CARTEIRA_INSTALL_DIR = 'C:\\SistemaCarteira';
  limparCacheDe('./config.cjs');
  limparCacheDe('./primeiraExecucao.cjs');
  primeiraExecucao = require('./primeiraExecucao.cjs');
});

afterEach(() => {
  delete process.env.CARTEIRA_PONTEIRO_INSTALL;
  delete process.env.CARTEIRA_INSTALL_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('obterPastaInstalacao', () => {
  it('primeira execução: cria automaticamente a pasta padrão, sem perguntar nada', () => {
    const pasta = primeiraExecucao.obterPastaInstalacao();
    expect(pasta).toBe('C:\\SistemaCarteira');
    expect(primeiraExecucao.lerPastaConfigurada()).toBe('C:\\SistemaCarteira');
  });

  it('já configurada (ex.: alguém trocou manualmente): devolve a gravada, não a padrão', () => {
    primeiraExecucao.salvarPastaConfigurada('D:\\JaEscolhida');
    const pasta = primeiraExecucao.obterPastaInstalacao();
    expect(pasta).toBe('D:\\JaEscolhida');
  });

  it('chamar duas vezes não regrava nem muda o resultado', () => {
    const primeira = primeiraExecucao.obterPastaInstalacao();
    const segunda = primeiraExecucao.obterPastaInstalacao();
    expect(segunda).toBe(primeira);
  });
});
