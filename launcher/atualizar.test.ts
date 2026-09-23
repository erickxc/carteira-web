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

  it('zip corrompido: mensagem diz que o zip está incompleto/corrompido e em qual etapa', () => {
    const zipCorrompido = path.join(tmpDir, 'corrompido.zip');
    fs.writeFileSync(zipCorrompido, 'isto nao e um zip valido');
    const resultado = aplicarAtualizacao({ appDir, zipPath: zipCorrompido, novaVersao: '2.0.0', versaoArquivoPath });
    expect(resultado.ok).toBe(false);
    expect(resultado.etapa).toBe('leitura-zip');
    expect(resultado.erro).toMatch(/incompleto ou corrompido/);
  });

  it('zip inexistente: etapa leitura-zip, código ENOENT e dica do OneDrive', () => {
    const resultado = aplicarAtualizacao({ appDir, zipPath: path.join(tmpDir, 'nao-existe.zip'), novaVersao: '2.0.0', versaoArquivoPath });
    expect(resultado.ok).toBe(false);
    expect(resultado.etapa).toBe('leitura-zip');
    expect(resultado.codigo).toBe('ENOENT');
    expect(resultado.erro).toMatch(/OneDrive/);
  });

  it('zip sem ponto de entrada (inicio.cjs/server.cjs): recusa antes de tocar na instalação', () => {
    const zipV1 = path.join(tmpDir, 'v1.zip');
    criarZipFixture(zipV1, '// v1');
    aplicarAtualizacao({ appDir, zipPath: zipV1, novaVersao: '1.0.0', versaoArquivoPath });

    const zipVazio = path.join(tmpDir, 'vazio.zip');
    const zip = new AdmZip();
    zip.addFile('marca.txt', Buffer.from('sem servidor'));
    zip.writeZip(zipVazio);
    const resultado = aplicarAtualizacao({ appDir, zipPath: zipVazio, novaVersao: '2.0.0', versaoArquivoPath });

    expect(resultado.ok).toBe(false);
    expect(resultado.etapa).toBe('validacao');
    expect(fs.readFileSync(path.join(appDir, 'server.cjs'), 'utf8')).toBe('// v1');
    expect(fs.existsSync(`${appDir}-novo`)).toBe(false);
  });

  it('zip com versão diferente da anunciada (OneDrive com zip antigo): recusa', () => {
    const zipPath = path.join(tmpDir, 'v2.zip');
    const zip = new AdmZip();
    zip.addFile('server.cjs', Buffer.from('// v?'));
    zip.addFile('package.json', Buffer.from(JSON.stringify({ version: '1.9.0' })));
    zip.writeZip(zipPath);
    const resultado = aplicarAtualizacao({ appDir, zipPath, novaVersao: '2.0.0', versaoArquivoPath });
    expect(resultado.ok).toBe(false);
    expect(resultado.etapa).toBe('validacao');
    expect(resultado.erro).toMatch(/1\.9\.0/);
  });

  it('pasta travada por outro processo (EBUSY) por um instante: tenta de novo e conclui', () => {
    const zipV1 = path.join(tmpDir, 'v1.zip');
    criarZipFixture(zipV1, '// v1');
    aplicarAtualizacao({ appDir, zipPath: zipV1, novaVersao: '1.0.0', versaoArquivoPath });

    let falhas = 2;
    const fsInstavel = {
      ...fs,
      renameSync: (de: string, para: string) => {
        if (de === appDir && falhas-- > 0) throw Object.assign(new Error('resource busy'), { code: 'EBUSY' });
        return fs.renameSync(de, para);
      },
    };
    const zipV2 = path.join(tmpDir, 'v2.zip');
    criarZipFixture(zipV2, '// v2');
    const resultado = aplicarAtualizacao(
      { appDir, zipPath: zipV2, novaVersao: '2.0.0', versaoArquivoPath },
      { fs: fsInstavel, dormir: () => {} },
    );
    expect(resultado.ok).toBe(true);
    expect(fs.readFileSync(path.join(appDir, 'server.cjs'), 'utf8')).toBe('// v2');
  });

  it('BUG antigo: falha só ao apagar a pasta -antigo depois da troca NÃO é falha da atualização', () => {
    const zipV1 = path.join(tmpDir, 'v1.zip');
    criarZipFixture(zipV1, '// v1');
    aplicarAtualizacao({ appDir, zipPath: zipV1, novaVersao: '1.0.0', versaoArquivoPath });

    const oldDir = `${appDir}-antigo`;
    const fsLimpezaTravada = {
      ...fs,
      rmSync: (alvo: string, opts: fs.RmOptions) => {
        if (alvo === oldDir && fs.existsSync(alvo)) throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        return fs.rmSync(alvo, opts);
      },
    };
    const zipV2 = path.join(tmpDir, 'v2.zip');
    criarZipFixture(zipV2, '// v2');
    const resultado = aplicarAtualizacao(
      { appDir, zipPath: zipV2, novaVersao: '2.0.0', versaoArquivoPath },
      { fs: fsLimpezaTravada, dormir: () => {} },
    );

    expect(resultado.ok).toBe(true);
    // Antes: devolvia ok:false e NÃO gravava a versão — a máquina reinstalava a cada abertura.
    expect(fs.readFileSync(versaoArquivoPath, 'utf8')).toBe('2.0.0');
    expect(resultado.avisos.join(' ')).toMatch(/-antigo/);
  });

  it('BUG antigo: se a troca falha E a restauração também falha, isso é dito com todas as letras', () => {
    const zipV1 = path.join(tmpDir, 'v1.zip');
    criarZipFixture(zipV1, '// v1');
    aplicarAtualizacao({ appDir, zipPath: zipV1, novaVersao: '1.0.0', versaoArquivoPath });

    const oldDir = `${appDir}-antigo`;
    const tmpNovo = `${appDir}-novo`;
    const fsTrocaQuebrada = {
      ...fs,
      renameSync: (de: string, para: string) => {
        if (de === tmpNovo || de === oldDir) throw Object.assign(new Error('access denied'), { code: 'EACCES' });
        return fs.renameSync(de, para);
      },
    };
    const zipV2 = path.join(tmpDir, 'v2.zip');
    criarZipFixture(zipV2, '// v2');
    const resultado = aplicarAtualizacao(
      { appDir, zipPath: zipV2, novaVersao: '2.0.0', versaoArquivoPath },
      { fs: fsTrocaQuebrada, dormir: () => {} },
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.etapa).toBe('restauracao');
    expect(resultado.erro).toMatch(/app-antigo/);
    // A instalação anterior não foi perdida: continua inteira na pasta -antigo.
    expect(fs.readFileSync(path.join(oldDir, 'server.cjs'), 'utf8')).toBe('// v1');
  });
});
