import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { empacotarPasta, escreverManifesto, lerVersaoPackageJson, limparReleasesAntigas } = require('./publicarRelease.cjs');

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-publicar-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('lerVersaoPackageJson', () => {
  it('lê a versão de um package.json arbitrário', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '3.2.1' }));
    expect(lerVersaoPackageJson(tmpDir)).toBe('3.2.1');
  });
});

describe('empacotarPasta', () => {
  it('gera um .zip com o conteúdo da pasta de origem, gravado de forma atômica (sem .tmp residual)', () => {
    const origem = path.join(tmpDir, 'origem');
    fs.mkdirSync(path.join(origem, 'server'), { recursive: true });
    fs.writeFileSync(path.join(origem, 'server.cjs'), '// app');
    fs.writeFileSync(path.join(origem, 'server', 'config.cjs'), '// config');

    const destino = path.join(tmpDir, 'release.zip');
    empacotarPasta(origem, destino);

    expect(fs.existsSync(destino)).toBe(true);
    expect(fs.existsSync(`${destino}.tmp`)).toBe(false);

    const zip = new AdmZip(destino);
    const nomes = zip.getEntries().map((e: { entryName: string }) => e.entryName.replace(/\\/g, '/'));
    expect(nomes).toContain('server.cjs');
    expect(nomes).toContain('server/config.cjs');
  });
});

describe('escreverManifesto', () => {
  it('grava releases/latest.json com versão, arquivo e timestamp', () => {
    const releasesDir = path.join(tmpDir, 'releases');
    const destino = escreverManifesto(releasesDir, { versao: '1.2.3', arquivo: 'carteira-v1.2.3.zip' });
    expect(fs.existsSync(destino)).toBe(true);
    const manifesto = JSON.parse(fs.readFileSync(destino, 'utf8'));
    expect(manifesto.versao).toBe('1.2.3');
    expect(manifesto.arquivo).toBe('carteira-v1.2.3.zip');
    expect(typeof manifesto.publicadoEm).toBe('string');
  });

  it('sobrescreve o manifesto anterior sem deixar .tmp residual', () => {
    const releasesDir = path.join(tmpDir, 'releases');
    escreverManifesto(releasesDir, { versao: '1.0.0', arquivo: 'a.zip' });
    const destino = escreverManifesto(releasesDir, { versao: '2.0.0', arquivo: 'b.zip' });
    expect(JSON.parse(fs.readFileSync(destino, 'utf8')).versao).toBe('2.0.0');
    expect(fs.existsSync(`${destino}.tmp`)).toBe(false);
  });
});

describe('limparReleasesAntigas', () => {
  it('apaga todo .zip exceto o da versão atual', () => {
    const releasesDir = path.join(tmpDir, 'releases');
    fs.mkdirSync(releasesDir, { recursive: true });
    fs.writeFileSync(path.join(releasesDir, 'carteira-v1.0.0.zip'), 'a');
    fs.writeFileSync(path.join(releasesDir, 'carteira-v1.1.0.zip'), 'b');
    fs.writeFileSync(path.join(releasesDir, 'carteira-v1.2.0.zip'), 'c');
    fs.writeFileSync(path.join(releasesDir, 'latest.json'), '{}');

    limparReleasesAntigas(releasesDir, 'carteira-v1.2.0.zip');

    const restantes = fs.readdirSync(releasesDir).sort();
    expect(restantes).toEqual(['carteira-v1.2.0.zip', 'latest.json']);
  });

  it('não falha quando a pasta de releases ainda não existe', () => {
    expect(() => limparReleasesAntigas(path.join(tmpDir, 'inexistente'), 'carteira-v1.0.0.zip')).not.toThrow();
  });
});
