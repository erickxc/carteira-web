import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { registrarVersao } = require('./registroVersao.cjs');

let dir: string;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it('grava uma linha só quando a versão muda', () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-versao-'));
  expect(registrarVersao({ dir, versao: '1.5.0' })).toBe(true);
  expect(registrarVersao({ dir, versao: '1.5.0' })).toBe(false);
  expect(registrarVersao({ dir, versao: '1.5.1' })).toBe(true);

  const linhas = fs.readFileSync(path.join(dir, `${os.hostname()}.log`), 'utf8').trim().split('\n');
  expect(linhas.map((l) => l.split('\t')[1])).toEqual(['1.5.0', '1.5.1']);
});
