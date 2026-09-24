import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let onedriveRoot: string;
let backup: typeof import('./backup.cjs');

function limparCacheDe(modulePath: string) {
  delete require.cache[require.resolve(modulePath)];
}

beforeEach(() => {
  onedriveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-onedrive-'));
  process.env.ONEDRIVE_ROOT = onedriveRoot + path.sep;
  limparCacheDe('./config.cjs');
  limparCacheDe('./backup.cjs');
  backup = require('./backup.cjs');

  fs.mkdirSync(path.dirname(backup.BACKUP_DIR).replace(/backups$/, ''), { recursive: true });
});

afterEach(() => {
  delete process.env.ONEDRIVE_ROOT;
  fs.rmSync(onedriveRoot, { recursive: true, force: true });
});

describe('backup: limparAntigos (via backupDiario)', () => {
  it('mantém só os 2 mais recentes, apagando os demais independente da idade', () => {
    const { DB_FILE } = require('./config.cjs');
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, 'dados');
    fs.mkdirSync(backup.BACKUP_DIR, { recursive: true });
    fs.writeFileSync(path.join(backup.BACKUP_DIR, 'database_dev-2026-01-01.xlsx'), 'antigo1');
    fs.writeFileSync(path.join(backup.BACKUP_DIR, 'database_dev-2026-01-02.xlsx'), 'antigo2');

    backup.backupDiario(); // cria a cópia de hoje, 3ª no total

    const restantes = fs.readdirSync(backup.BACKUP_DIR).filter((f) => f.startsWith('database_dev-')).sort();
    expect(restantes).toHaveLength(2);
    expect(restantes[0]).not.toBe('database_dev-2026-01-01.xlsx');
  });
});
