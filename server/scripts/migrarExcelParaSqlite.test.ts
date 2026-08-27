import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

let tmpDir: string;
let fixturePath: string;
let dbSqlite: typeof import('../dbSqlite.cjs');
let migrarModulo: typeof import('./migrarExcelParaSqlite.cjs');

function limparCacheDe(modulePath: string) {
  const resolvido = require.resolve(modulePath);
  delete require.cache[resolvido];
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-migracao-test-'));
  process.env.SQLITE_DIR = tmpDir;
  limparCacheDe('../config.cjs');
  limparCacheDe('../dbSqlite.cjs');
  limparCacheDe('./migrarExcelParaSqlite.cjs');
  dbSqlite = require('../dbSqlite.cjs');
  migrarModulo = require('./migrarExcelParaSqlite.cjs');

  // Fixture pequena: 2-3 linhas em duas sheets, mesmo formato serializado que
  // o app grava hoje (arrays como JSON string na célula).
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([
    { id: 'c1', empresa: 'Empresa A', servicos: '["Monitoria"]', suspenso: false },
    { id: 'c2', empresa: 'Empresa B', servicos: '["Precificação"]', suspenso: true },
  ]), 'Clientes');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([
    { id: 'e1', clientId: 'c1', type: 'Reunião', status: 'Concluído' },
  ]), 'Agenda');
  fixturePath = path.join(tmpDir, 'fixture.xlsx');
  xlsx.writeFile(wb, fixturePath, { bookType: 'xlsx' });
});

afterEach(() => {
  dbSqlite._fecharParaTestes();
  delete process.env.SQLITE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('migrarExcelParaSqlite', () => {
  it('migra cada sheet do xlsx para a tabela SQLite correspondente', () => {
    const resultado = migrarModulo.migrarExcelParaSqlite(fixturePath);
    expect(resultado.Clientes).toBe(2);
    expect(resultado.Agenda).toBe(1);

    const clientes = dbSqlite.getSheetData('Clientes');
    expect(clientes).toHaveLength(2);
    const empresaA = clientes.find((c: { id: string }) => c.id === 'c1');
    expect(empresaA.empresa).toBe('Empresa A');
    expect(empresaA.servicos).toBe('["Monitoria"]'); // célula já vinha como string serializada — migração não reinterpreta
    expect(empresaA.suspenso).toBe(false);

    const agenda = dbSqlite.getSheetData('Agenda');
    expect(agenda).toHaveLength(1);
    expect(agenda[0].clientId).toBe('c1');
  });

  it('sheets ausentes no xlsx de origem migram como 0 linhas, sem erro', () => {
    const resultado = migrarModulo.migrarExcelParaSqlite(fixturePath);
    expect(resultado.Lembretes).toBe(0);
    expect(dbSqlite.getSheetData('Lembretes')).toHaveLength(0);
  });

  it('é seguro rodar de novo sobre a mesma origem (idempotente por sheet)', () => {
    migrarModulo.migrarExcelParaSqlite(fixturePath);
    migrarModulo.migrarExcelParaSqlite(fixturePath);
    expect(dbSqlite.getSheetData('Clientes')).toHaveLength(2);
  });
});
