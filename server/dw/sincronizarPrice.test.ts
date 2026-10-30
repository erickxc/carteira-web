import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Isola ONEDRIVE_ROOT (a chave de cifra é gravada lá na 1ª vez) e SQLITE_DIR,
 * e recarrega os módulos que cacheiam caminho — mesmo padrão de
 * `server/routes/alvos.test.ts`. O repo é em memória e o DW é substituído.
 */
const MODULOS = ['../config.cjs', '../crypto.cjs', '../dominio/repo.cjs', '../dbSqlite.cjs', '../db.cjs', './sincronizarPrice.cjs'];
const limparCaches = () => {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
};

let oneDriveDir: string;
let sqliteDir: string;

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-syncprice-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-syncprice-sq-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  limparCaches();
});

afterEach(() => {
  // Handle do SQLite aberto ao carregar o módulo segura a pasta (EPERM no rmSync).
  try { require('../dbSqlite.cjs')._fecharParaTestes(); } catch { /* não aberta */ }
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

const CNPJ = '12345678000199';
const CNPJ2 = '98765432000188';

function rodar(clientes: object[]) {
  const { repoMemoria } = require('../dominio/repo.cjs');
  const { decifrar } = require('../crypto.cjs');
  const { sincronizarPriceDoDW } = require('./sincronizarPrice.cjs');
  const repo = repoMemoria({ Clientes: clientes });
  const consultados: string[][] = [];
  const buscarDadosPrice = async (cnpjs: string[]) => {
    consultados.push(cnpjs);
    return new Map(cnpjs.map((c) => [c, { senha: `nova-${c}` }]));
  };
  return sincronizarPriceDoDW({ repo, buscarDadosPrice, configurado: true })
    .then((r: unknown) => ({ r, repo, decifrar, consultados }));
}

describe('sincronizarPriceDoDW com produtos (1.7)', () => {
  it('grava a senha nova no produto 2D Price e o legado sai derivado igual', async () => {
    const { repo, decifrar, consultados } = await rodar([{
      id: 'c1', empresa: 'A', servicos: ['2D Price'],
      produtos: [
        { produto: 'Plataforma 2D', fase: 'Ativo', faseDesde: '2026-01-01', motivoFase: 'm' },
        { produto: '2D Price', fase: 'Ativo', faseDesde: '2026-01-01', motivoFase: 'm', login: CNPJ, senhaCifrada: 'antiga' },
      ],
      loginPrice: 'login-legado-divergente',
    }]);
    expect(consultados[0]).toEqual([CNPJ]);
    const c = repo.get('Clientes')[0];
    const price = c.produtos.find((p: { produto: string }) => p.produto === '2D Price');
    expect(decifrar(price.senhaCifrada)).toBe(`nova-${CNPJ}`);
    expect(c.senhaPriceCifrada).toBe(price.senhaCifrada);
    // Não cria produto nem mexe em fase (regra 2 do arquivo).
    expect(c.produtos).toHaveLength(2);
    expect(c.produtos.map((p: { fase: string }) => p.fase)).toEqual(['Ativo', 'Ativo']);
  });

  it('cliente com produtos e sem 2D Price não ganha produto; senha vai ao campo legado', async () => {
    const { repo, decifrar } = await rodar([{
      id: 'c2', empresa: 'Irmã', loginPrice: CNPJ2,
      produtos: [{ produto: 'Plataforma 2D', fase: 'Ativo', faseDesde: '2026-01-01', motivoFase: 'm' }],
    }]);
    const c = repo.get('Clientes')[0];
    expect(c.produtos).toHaveLength(1);
    expect(decifrar(c.senhaPriceCifrada)).toBe(`nova-${CNPJ2}`);
  });

  it('cliente não migrado (sem produtos) segue no campo legado e continua sem produtos', async () => {
    const { repo, decifrar } = await rodar([{ id: 'c3', empresa: 'B', servicos: ['Precificação'], loginPrice: CNPJ }]);
    const c = repo.get('Clientes')[0];
    expect(c.produtos).toBeUndefined();
    expect(decifrar(c.senhaPriceCifrada)).toBe(`nova-${CNPJ}`);
  });
});

describe('sincronizarPriceDoDW — bordas (testador)', () => {
  it('2D Price com nome antigo (Precificação) também recebe a senha no produto', async () => {
    const { repo, decifrar } = await rodar([{
      id: 'c4', empresa: 'C',
      produtos: [{ produto: 'Precificação', fase: 'Ativo', faseDesde: '2026-01-01', motivoFase: 'm', login: CNPJ, senhaCifrada: 'antiga' }],
    }]);
    const c = repo.get('Clientes')[0];
    expect(c.produtos).toHaveLength(1);
    expect(decifrar(c.produtos[0].senhaCifrada)).toBe(`nova-${CNPJ}`);
    expect(c.senhaPriceCifrada).toBe(c.produtos[0].senhaCifrada);
  });

  it('2D Price Suspenso: troca a senha mas mantém fase, faseDesde e motivo', async () => {
    const item = { produto: '2D Price', fase: 'Suspenso', faseDesde: '2026-05-01', motivoFase: 'pausa', login: CNPJ, senhaCifrada: 'antiga' };
    const { repo, decifrar } = await rodar([{ id: 'c5', empresa: 'D', produtos: [item] }]);
    const p = repo.get('Clientes')[0].produtos[0];
    expect(decifrar(p.senhaCifrada)).toBe(`nova-${CNPJ}`);
    expect({ fase: p.fase, faseDesde: p.faseDesde, motivoFase: p.motivoFase }).toEqual({ fase: 'Suspenso', faseDesde: '2026-05-01', motivoFase: 'pausa' });
  });

  it('CNPJ do produto vence o loginPrice divergente; login do produto e legado não mudam', async () => {
    const { repo, consultados } = await rodar([{
      id: 'c6', empresa: 'E', loginPrice: CNPJ2,
      produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-01-01', motivoFase: 'm', login: '12.345.678/0001-99' }],
    }]);
    expect(consultados[0]).toEqual([CNPJ]);
    const c = repo.get('Clientes')[0];
    expect(c.produtos[0].login).toBe('12.345.678/0001-99');
  });

  // BUG (testador, Task 5): a derivação grava loginPrice = '' (item sem login) e o
  // CNPJ some. `it.fails` até corrigir — quando passar a falhar, trocar por `it`.
  it.fails('item 2D Price sem login cai no loginPrice e não apaga o loginPrice ao gravar', async () => {
    const { repo, decifrar, consultados } = await rodar([{
      id: 'c7', empresa: 'F', loginPrice: CNPJ,
      produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-01-01', motivoFase: 'm' }],
    }]);
    expect(consultados[0]).toEqual([CNPJ]);
    const c = repo.get('Clientes')[0];
    expect(decifrar(c.produtos[0].senhaCifrada)).toBe(`nova-${CNPJ}`);
    // Se o login sumir, a próxima sincronização não acha mais o CNPJ.
    expect((c.produtos[0].login || c.loginPrice || '').replace(/\D/g, '')).toBe(CNPJ);
  });

  it('DW sem senha: produtos ficam intactos (senha antiga preservada)', async () => {
    const { repoMemoria } = require('../dominio/repo.cjs');
    const { sincronizarPriceDoDW } = require('./sincronizarPrice.cjs');
    const repo = repoMemoria({ Clientes: [{
      id: 'c8', empresa: 'G',
      produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-01-01', motivoFase: 'm', login: CNPJ, senhaCifrada: 'antiga' }],
    }] });
    await sincronizarPriceDoDW({ repo, configurado: true, buscarDadosPrice: async () => new Map([[CNPJ, { segmento: 'Moto' }]]) });
    const c = repo.get('Clientes')[0];
    expect(c.produtos[0].senhaCifrada).toBe('antiga');
    expect(c.produtos).toHaveLength(1);
  });

  it('sem DW configurado não consulta nem grava', async () => {
    const { repoMemoria } = require('../dominio/repo.cjs');
    const { sincronizarPriceDoDW } = require('./sincronizarPrice.cjs');
    const repo = repoMemoria({ Clientes: [{ id: 'c9', loginPrice: CNPJ }] });
    let chamou = false;
    const r = await sincronizarPriceDoDW({ repo, configurado: false, buscarDadosPrice: async () => { chamou = true; return new Map(); } });
    expect(r.rodou).toBe(false);
    expect(chamou).toBe(false);
  });
});
