import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// `server/` é CommonJS (sem build step) — `createRequire` garante semântica
// de `require` correta em vez de depender de interop de ESM do bundler.
const require = createRequire(import.meta.url);

// Isola cada teste com um SQLITE_DIR próprio (nunca o arquivo real) —
// `server/config.cjs` lê `process.env.SQLITE_DIR` na primeira vez que é
// exigido, então cada teste precisa de um `require` fresco dos dois módulos
// depois de setar a env var, sem cache do módulo anterior.
let tmpDir: string;
let dbSqlite: typeof import('./dbSqlite.cjs');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-sqlite-test-'));
  process.env.SQLITE_DIR = tmpDir;
  const configPath = require.resolve('./config.cjs');
  const dbSqlitePath = require.resolve('./dbSqlite.cjs');
  delete require.cache[configPath];
  delete require.cache[dbSqlitePath];
  dbSqlite = require('./dbSqlite.cjs');
});

afterEach(() => {
  dbSqlite._fecharParaTestes();
  delete process.env.SQLITE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('dbSqlite: round-trip de tipos', () => {
  it('preserva string, number, boolean e null através de save/get', () => {
    dbSqlite.saveSheetData('Clientes', [
      { id: 'c1', empresa: 'Teste', servicos: ['Monitoria'], suspenso: false, monitoria: true, observacao: '' },
    ]);
    const [linha] = dbSqlite.getSheetData('Clientes');
    expect(linha.id).toBe('c1');
    expect(linha.empresa).toBe('Teste');
    expect(linha.servicos).toEqual(['Monitoria']);
    expect(linha.suspenso).toBe(false);
    expect(linha.monitoria).toBe(true);
  });

  it('coluna nunca definida vira chave OMITIDA no objeto (mesmo comportamento do SheetJS)', () => {
    dbSqlite.saveSheetData('Clientes', [{ id: 'c1', empresa: 'Teste' }]);
    const [linha] = dbSqlite.getSheetData('Clientes');
    expect('monitor' in linha).toBe(false);
    expect('grupo' in linha).toBe(false);
  });

  it('gera uma tabela por sheet, derivada de HEADERS_BY_SHEET (inclui as tabelas Agil)', () => {
    dbSqlite.saveSheetData('AgilBoards', [{ id: 'b1', workspaceId: 'w1', nome: 'Board Teste' }]);
    expect(dbSqlite.getSheetData('AgilBoards')).toHaveLength(1);
  });

  it('Cadencias usa `chave` como chave primária (não tem `id`)', () => {
    dbSqlite.saveSheetData('Cadencias', [{ chave: 'monitoria_dias', valor: 30 }]);
    const [linha] = dbSqlite.getSheetData('Cadencias');
    expect(linha.chave).toBe('monitoria_dias');
    expect(linha.valor).toBe(30);
  });
});

describe('dbSqlite: updateSheetRow', () => {
  it('faz merge raso e aplica transform, devolvendo a linha atualizada', () => {
    dbSqlite.saveSheetData('Acoes', [{ id: 'a1', clientId: 'c1', status: 'programado' }]);
    const updated = dbSqlite.updateSheetRow('Acoes', 'a1', { status: 'concluido' }, (row: Record<string, unknown>) => ({ ...row, updatedAt: 'x' }));
    expect(updated).toMatchObject({ id: 'a1', status: 'concluido', updatedAt: 'x' });
    expect(dbSqlite.getSheetData('Acoes')[0]).toMatchObject({ status: 'concluido' });
  });

  it('devolve null quando o id não existe, sem criar linha', () => {
    expect(dbSqlite.updateSheetRow('Acoes', 'inexistente', { status: 'x' })).toBeNull();
    expect(dbSqlite.getSheetData('Acoes')).toHaveLength(0);
  });
});

describe('dbSqlite: deleteSheetRow', () => {
  it('remove a linha e devolve true; false se não existia', () => {
    dbSqlite.saveSheetData('Clientes', [{ id: 'c1', empresa: 'Teste' }]);
    expect(dbSqlite.deleteSheetRow('Clientes', 'c1')).toBe(true);
    expect(dbSqlite.getSheetData('Clientes')).toHaveLength(0);
    expect(dbSqlite.deleteSheetRow('Clientes', 'c1')).toBe(false);
  });
});

describe('dbSqlite: initDbSqlite', () => {
  it('semeia Categorias/Modelos/Cadencias quando as tabelas estão vazias', () => {
    dbSqlite.initDbSqlite();
    expect(dbSqlite.getSheetData('Categorias').length).toBeGreaterThan(0);
    expect(dbSqlite.getSheetData('Modelos').length).toBeGreaterThan(0);
    expect(dbSqlite.getSheetData('Cadencias').length).toBeGreaterThan(0);
  });

  it('é idempotente: rodar duas vezes não duplica o seed', () => {
    dbSqlite.initDbSqlite();
    const antes = dbSqlite.getSheetData('Categorias').length;
    dbSqlite.initDbSqlite();
    expect(dbSqlite.getSheetData('Categorias')).toHaveLength(antes);
  });

  it('completa um tipo de categoria novo sem tocar nas categorias já cadastradas pelo usuário', () => {
    dbSqlite.saveSheetData('Categorias', [{ id: 'x1', tipo: 'servico', valor: 'Customizado', ordem: 0, createdAt: 'agora' }]);
    dbSqlite.initDbSqlite();
    const categorias = dbSqlite.getSheetData('Categorias');
    expect(categorias.some((c: { valor: string }) => c.valor === 'Customizado')).toBe(true);
    expect(categorias.some((c: { tipo: string }) => c.tipo === 'monitor')).toBe(true);
  });
});

describe('dbSqlite: guarda de escrita em APP_MODE=client (Etapa 2)', () => {
  afterEach(() => {
    delete process.env.APP_MODE;
  });

  it('bloqueia saveSheetData/updateSheetRow/deleteSheetRow quando APP_MODE=client', () => {
    process.env.APP_MODE = 'client';
    const modoPath = require.resolve('./modo.cjs');
    const dbSqlitePath = require.resolve('./dbSqlite.cjs');
    delete require.cache[modoPath];
    delete require.cache[dbSqlitePath];
    const dbSqliteCliente: typeof import('./dbSqlite.cjs') = require('./dbSqlite.cjs');

    expect(() => dbSqliteCliente.saveSheetData('Clientes', [{ id: 'c1', empresa: 'Teste' }])).toThrow(/APP_MODE=client/);
    expect(() => dbSqliteCliente.updateSheetRow('Clientes', 'c1', { empresa: 'X' })).toThrow(/APP_MODE=client/);
    expect(() => dbSqliteCliente.deleteSheetRow('Clientes', 'c1')).toThrow(/APP_MODE=client/);

    dbSqliteCliente._fecharParaTestes();
    delete require.cache[modoPath];
    delete require.cache[dbSqlitePath];
  });

  it('getSheetData continua liberado em APP_MODE=client (leitura não é bloqueada)', () => {
    process.env.APP_MODE = 'client';
    const modoPath = require.resolve('./modo.cjs');
    const dbSqlitePath = require.resolve('./dbSqlite.cjs');
    delete require.cache[modoPath];
    delete require.cache[dbSqlitePath];
    const dbSqliteCliente: typeof import('./dbSqlite.cjs') = require('./dbSqlite.cjs');

    expect(() => dbSqliteCliente.getSheetData('Clientes')).not.toThrow();

    dbSqliteCliente._fecharParaTestes();
    delete require.cache[modoPath];
    delete require.cache[dbSqlitePath];
  });
});
