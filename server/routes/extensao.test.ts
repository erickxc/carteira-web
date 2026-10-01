import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { montarZipExtensao } = require('./extensao.cjs');

let dir: string;
const escrever = (rel: string, conteudo: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), conteudo);
};

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-extensao-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('montarZipExtensao', () => {
  it('empacota a pasta como está agora, dentro de "2D Acessos/"', () => {
    escrever('manifest.json', '{"name":"2D Price","version":"1.1.0"}');
    escrever('popup.js', 'versao nova');
    const nomes = new AdmZip(montarZipExtensao(dir)).getEntries().map((e: { entryName: string }) => e.entryName);
    expect(nomes).toContain('2D Acessos/manifest.json');
    expect(nomes).toContain('2D Acessos/popup.js');
  });

  it('deixa de fora o backend da extensão (api/) e qualquer .env', () => {
    escrever('manifest.json', '{"name":"2D Price"}');
    escrever('api/app.py', 'servidor');
    escrever('api/.env', 'SENHA=x');
    escrever('.env', 'SENHA=y');
    const nomes = new AdmZip(montarZipExtensao(dir)).getEntries().map((e: { entryName: string }) => e.entryName);
    expect(nomes.some((n: string) => n.includes('api/') || n.includes('.env'))).toBe(false);
  });

  it('sem manifest.json (pasta ausente/errada) devolve null', () => {
    expect(montarZipExtensao(path.join(dir, 'nao-existe'))).toBeNull();
  });
});
