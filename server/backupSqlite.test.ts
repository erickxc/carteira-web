import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');
const Database = require('better-sqlite3');

let sqliteDir: string;
let backupDir: string;
let dbSqlite: typeof import('./dbSqlite.cjs');
let backupSqlite: typeof import('./backupSqlite.cjs');

function limparCacheDe(modulePath: string) {
  delete require.cache[require.resolve(modulePath)];
}

beforeEach(() => {
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-sqlite-'));
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-backup-'));
  process.env.SQLITE_DIR = sqliteDir;
  process.env.BACKUP_ONEDRIVE_DIR = backupDir;
  limparCacheDe('./config.cjs');
  limparCacheDe('./dbSqlite.cjs');
  limparCacheDe('./backupSqlite.cjs');
  dbSqlite = require('./dbSqlite.cjs');
  backupSqlite = require('./backupSqlite.cjs');

  dbSqlite.saveSheetData('Clientes', [
    { id: 'c1', empresa: 'Empresa Teste', servicos: ['Monitoria'], suspenso: false },
  ]);
  dbSqlite.saveSheetData('Cadencias', [{ chave: 'monitoria_dias', valor: 30 }]);
});

afterEach(() => {
  dbSqlite._fecharParaTestes();
  delete process.env.SQLITE_DIR;
  delete process.env.BACKUP_ONEDRIVE_DIR;
  fs.rmSync(sqliteDir, { recursive: true, force: true });
  fs.rmSync(backupDir, { recursive: true, force: true });
});

describe('backupSqlite: exportarXlsx', () => {
  it('exporta database_dev.xlsx com os dados atuais, serializando arrays/objetos como JSON string', () => {
    const destino = backupSqlite.exportarXlsx();
    expect(fs.existsSync(destino)).toBe(true);

    const wb = xlsx.readFile(destino);
    const clientes = xlsx.utils.sheet_to_json(wb.Sheets['Clientes']);
    expect(clientes).toHaveLength(1);
    expect((clientes[0] as { servicos: string }).servicos).toBe('["Monitoria"]');

    const cadencias = xlsx.utils.sheet_to_json(wb.Sheets['Cadencias']);
    expect(cadencias).toEqual([{ chave: 'monitoria_dias', valor: 30 }]);
  });

  it('cria também uma cópia datada em backups/, e a segunda chamada no mesmo dia não duplica', () => {
    backupSqlite.exportarXlsx();
    const arquivos1 = fs.readdirSync(backupSqlite.BACKUPS_DIR).filter((f: string) => f.startsWith('database_dev-'));
    expect(arquivos1).toHaveLength(1);

    backupSqlite.exportarXlsx();
    const arquivos2 = fs.readdirSync(backupSqlite.BACKUPS_DIR).filter((f: string) => f.startsWith('database_dev-'));
    expect(arquivos2).toHaveLength(1);
  });

  it('remove cópias datadas com mais de 30 dias', () => {
    fs.mkdirSync(backupSqlite.BACKUPS_DIR, { recursive: true });
    fs.writeFileSync(path.join(backupSqlite.BACKUPS_DIR, 'database_dev-2020-01-01.xlsx'), 'antigo');
    backupSqlite.exportarXlsx();
    expect(fs.existsSync(path.join(backupSqlite.BACKUPS_DIR, 'database_dev-2020-01-01.xlsx'))).toBe(false);
  });
});

describe('backupSqlite: snapshotSqlite', () => {
  it('gera um snapshot .sqlite consistente com o conteúdo atual', async () => {
    const destino = await backupSqlite.snapshotSqlite();
    expect(destino).toBeTruthy();
    expect(fs.existsSync(destino as string)).toBe(true);

    const copia = new Database(destino as string, { readonly: true });
    const linhas = copia.prepare('SELECT * FROM Clientes').all() as { id: string }[];
    copia.close();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].id).toBe('c1');
  });

  it('não duplica no mesmo dia (segunda chamada devolve null)', async () => {
    await backupSqlite.snapshotSqlite();
    const segunda = await backupSqlite.snapshotSqlite();
    expect(segunda).toBeNull();
  });
});

describe('backupSqlite: rodarBackupSqlite', () => {
  it('roda os dois exports numa chamada só', async () => {
    const { sqlitePath, xlsxPath } = await backupSqlite.rodarBackupSqlite();
    expect(fs.existsSync(sqlitePath)).toBe(true);
    expect(fs.existsSync(xlsxPath)).toBe(true);
  });
});
