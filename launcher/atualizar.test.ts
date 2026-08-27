import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { versaoMaiorQue, precisaAtualizar, lerVersaoInstalada, aplicarAtualizacao } = require('./atualizar.cjs');

let tmpDir: string;
let appDir: string;
let versaoArquivoPath: string;

function criarZipFixture(destino: string, conteudoServerJs: string) {
  const zip = new AdmZip();
  zip.addFile('server.cjs', Buffer.from(conteudoServerJs));
  zip.addFile('marca.txt', Buffer.from('release-fixture'));
  zip.writeZip(destino);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-launcher-'));
  appDir = path.join(tmpDir, 'app');
  versaoArquivoPath = path.join(tmpDir, 'versao-instalada.txt');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('versaoMaiorQue', () => {
  it('compara segmentos numericamente (não como string)', () => {
    expect(versaoMaiorQue('1.10.0', '1.2.0')).toBe(true);
    expect(versaoMaiorQue('1.2.0', '1.10.0')).toBe(false);
  });

  it('versões iguais não são "maior"', () => {
    expect(versaoMaiorQue('1.2.3', '1.2.3')).toBe(false);
  });

  it('trata ausência de versão como 0.0.0', () => {
    expect(versaoMaiorQue('0.0.1', undefined)).toBe(true);
  });
});

describe('lerVersaoInstalada / precisaAtualizar', () => {
  it('sem arquivo de versão, assume 0.0.0 (qualquer release é "mais nova")', () => {
    expect(lerVersaoInstalada(versaoArquivoPath)).toBe('0.0.0');
    expect(precisaAtualizar(lerVersaoInstalada(versaoArquivoPath), '1.0.0')).toBe(true);
  });

  it('com versão igual instalada, não precisa atualizar', () => {
    fs.writeFileSync(versaoArquivoPath, '1.0.0');
    expect(precisaAtualizar(lerVersaoInstalada(versaoArquivoPath), '1.0.0')).toBe(false);
  });
});

describe('aplicarAtualizacao', () => {
  it('instala numa pasta vazia (primeira instalação)', () => {
    const zipPath = path.join(tmpDir, 'v1.zip');
    criarZipFixture(zipPath, '// v1');
    const resultado = aplicarAtualizacao({ appDir, zipPath, novaVersao: '1.0.0', versaoArquivoPath });
    expect(resultado.ok).toBe(true);
    expect(fs.readFileSync(path.join(appDir, 'server.cjs'), 'utf8')).toBe('// v1');
    expect(fs.readFileSync(versaoArquivoPath, 'utf8')).toBe('1.0.0');
  });

  it('troca uma instalação existente pela nova, sem deixar pasta -antigo/-novo residual', () => {
    const zipV1 = path.join(tmpDir, 'v1.zip');
    criarZipFixture(zipV1, '// v1');
    aplicarAtualizacao({ appDir, zipPath: zipV1, novaVersao: '1.0.0', versaoArquivoPath });

    const zipV2 = path.join(tmpDir, 'v2.zip');
    criarZipFixture(zipV2, '// v2');
    const resultado = aplicarAtualizacao({ appDir, zipPath: zipV2, novaVersao: '2.0.0', versaoArquivoPath });

    expect(resultado.ok).toBe(true);
    expect(fs.readFileSync(path.join(appDir, 'server.cjs'), 'utf8')).toBe('// v2');
    expect(fs.readFileSync(versaoArquivoPath, 'utf8')).toBe('2.0.0');
    expect(fs.existsSync(`${appDir}-antigo`)).toBe(false);
    expect(fs.existsSync(`${appDir}-novo`)).toBe(false);
  });

  it('zip corrompido: NÃO apaga a instalação anterior, devolve ok:false', () => {
    const zipV1 = path.join(tmpDir, 'v1.zip');
    criarZipFixture(zipV1, '// v1');
    aplicarAtualizacao({ appDir, zipPath: zipV1, novaVersao: '1.0.0', versaoArquivoPath });

    const zipCorrompido = path.join(tmpDir, 'corrompido.zip');
    fs.writeFileSync(zipCorrompido, 'isto nao e um zip valido');
    const resultado = aplicarAtualizacao({ appDir, zipPath: zipCorrompido, novaVersao: '2.0.0', versaoArquivoPath });

    expect(resultado.ok).toBe(false);
    expect(fs.readFileSync(path.join(appDir, 'server.cjs'), 'utf8')).toBe('// v1'); // instalação anterior intacta
    expect(fs.readFileSync(versaoArquivoPath, 'utf8')).toBe('1.0.0'); // versão não avançou
    expect(fs.existsSync(`${appDir}-novo`)).toBe(false); // nada residual
  });
});
