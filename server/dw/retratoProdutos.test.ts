import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// Isola ONEDRIVE_ROOT e SQLITE_DIR e recarrega quem cacheia caminho — mesmo
// padrão de `server/routes/alvos.test.ts`. O DW é substituído.
const MODULOS = ['../config.cjs', './retratoProdutos.cjs'];
const limparCaches = () => {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
};

let oneDriveDir: string;
let sqliteDir: string;

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-retrato-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-retrato-sq-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  limparCaches();
});

afterEach(() => {
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

const linha = (cnpj: string, marcadas: string[]) => {
  const cols = ['monitoria', 'controladoria', 'apura', 'alcance', 'nexus', 'optimarco', 'precificar'];
  return { cnpj, ...Object.fromEntries(cols.map((c) => [c, marcadas.includes(c) ? 'S' : 'N'])) };
};

describe('gerarRetrato', () => {
  it('grava dados/dw-produtos.json com os produtos marcados por CNPJ', async () => {
    const { gerarRetrato, lerRetrato } = require('./retratoProdutos.cjs');
    expect(lerRetrato()).toBeNull();

    const buscar = async () => [
      linha('11111111000111', ['monitoria', 'precificar']),
      linha('22222222000122', []),
      // CNPJ repetido no DW: qualquer linha marcada vale.
      linha('11111111000111', ['nexus']),
      linha('', ['apura']),
    ];
    const retrato = await gerarRetrato({ buscar, agora: '2026-10-30T07:30:00.000Z' });

    const esperado = {
      geradoEm: '2026-10-30T07:30:00.000Z',
      porCnpj: {
        '11111111000111': ['Plataforma 2D', '2D Nexus', '2D Price'],
        '22222222000122': [],
      },
    };
    expect(retrato).toEqual(esperado);
    const arquivo = path.join(oneDriveDir, 'dados', 'dw-produtos.json');
    expect(JSON.parse(fs.readFileSync(arquivo, 'utf-8'))).toEqual(esperado);
    expect(lerRetrato()).toEqual(esperado);
    // Sem sobra do tmp da escrita atômica.
    expect(fs.readdirSync(path.dirname(arquivo)).filter((f) => f.startsWith('dw-produtos'))).toEqual(['dw-produtos.json']);
  });

  it('falha do DW não apaga o retrato anterior', async () => {
    const { gerarRetrato, lerRetrato } = require('./retratoProdutos.cjs');
    await gerarRetrato({ buscar: async () => [linha('11111111000111', ['apura'])], agora: 'a' });
    await expect(gerarRetrato({ buscar: async () => { throw new Error('DW fora'); } })).rejects.toThrow('DW fora');
    expect(lerRetrato()).toEqual({ geradoEm: 'a', porCnpj: { '11111111000111': ['Apura'] } });
  });
});

describe('montarRetrato — bordas do DW', () => {
  it('aceita s minúsculo e espaços, ignora null/vazio/outros valores, CNPJ com máscara vira dígitos', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([
      { cnpj: '11.111.111/0001-11', monitoria: 's', apura: ' S ', nexus: null, alcance: '', optimarco: 'Sim', precificar: 'N' },
    ], 'g');
    expect(r.porCnpj).toEqual({ '11111111000111': ['Plataforma 2D', 'Apura'] });
  });

  it('ordem dos produtos segue o mapa de colunas, não a ordem das linhas repetidas', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([
      { cnpj: '1', precificar: 'S' },
      { cnpj: '1', monitoria: 'S' },
    ], 'g');
    expect(r.porCnpj['1']).toEqual(['Plataforma 2D', '2D Price']);
  });

  it('CNPJ repetido com a segunda linha toda N não apaga a marcação da primeira', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([linha('1', ['controladoria']), linha('1', [])], 'g');
    expect(r.porCnpj['1']).toEqual(['Controladoria']);
  });
});
