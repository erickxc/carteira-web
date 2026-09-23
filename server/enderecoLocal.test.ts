import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { lerAbrirPorNome, gravarAbrirPorNome } = require('./enderecoLocal.cjs');

let dir: string;
let arquivo: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'endereco-local-'));
  arquivo = path.join(dir, 'endereco-local.json');
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('enderecoLocal', () => {
  it('sem arquivo, vem ligado (padrão pra todo mundo)', () => {
    expect(lerAbrirPorNome(arquivo)).toBe(true);
  });

  it('grava e lê o valor desta máquina', () => {
    gravarAbrirPorNome(false, arquivo);
    expect(lerAbrirPorNome(arquivo)).toBe(false);
    gravarAbrirPorNome(true, arquivo);
    expect(lerAbrirPorNome(arquivo)).toBe(true);
  });

  it('arquivo corrompido cai no padrão, sem lançar', () => {
    fs.writeFileSync(arquivo, '{ nao é json');
    expect(lerAbrirPorNome(arquivo)).toBe(true);
  });
});
