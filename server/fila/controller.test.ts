import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const MODULOS_PARA_RESETAR = [
  '../config.cjs', '../modo.cjs', '../machine.cjs', '../dbSqlite.cjs',
  '../dominio/repo.cjs', '../dominio/clientes.cjs', '../dominio/agenda.cjs',
  '../dominio/lembretes.cjs', '../dominio/acoes.cjs', '../dominio/modelos.cjs',
  './caminhos.cjs', './entidades.cjs', './aplicar.cjs', './escrever.cjs', './pendentes.cjs', './mutacao.cjs',
  './snapshot.cjs', './controller.cjs',
];

let oneDriveDir: string;
let sqliteDir: string;

function limparCaches() {
  for (const m of MODULOS_PARA_RESETAR) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* módulo não carregado ainda */ }
  }
}

function carregar<T>(nomeRelativo: string): T {
  return require(nomeRelativo);
}

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-onedrive-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-sqlite-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  process.env.APP_MODE = 'server';
  limparCaches();
});

afterEach(() => {
  try { carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs')._fecharParaTestes(); } catch { /* não carregado */ }
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  delete process.env.APP_MODE;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

describe('fila/controller: processarUmCiclo', () => {
  it('aplica uma operação pendente de verdade, grava ack e move pra processadas/', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { processarUmCiclo } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    const dbSqlite = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');
    const { PENDENTES_DIR, RESULTADOS_DIR, PROCESSADAS_DIR, LOG_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');

    const op = escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c1', changes: { empresa: 'Cliente Remoto' } });
    const resultado = processarUmCiclo();

    expect(resultado).toEqual({ aplicadas: 1, comErro: 0, total: 1 });
    expect(dbSqlite.getSheetData('Clientes')).toMatchObject([{ id: 'c1', empresa: 'Cliente Remoto' }]);

    const ack = JSON.parse(fs.readFileSync(path.join(RESULTADOS_DIR, `${op.operationId}.json`), 'utf8'));
    expect(ack.status).toBe('applied');

    expect(fs.existsSync(path.join(PENDENTES_DIR, `${op.operationId}.json`))).toBe(false);
    const mes = new Date().toISOString().slice(0, 7);
    expect(fs.existsSync(path.join(PROCESSADAS_DIR, mes, `${op.operationId}.json`))).toBe(true);

    const log = fs.readFileSync(path.join(LOG_DIR, `aplicadas-${mes}.jsonl`), 'utf8').trim().split('\n');
    expect(log).toHaveLength(1);
    expect(JSON.parse(log[0])).toMatchObject({ operationId: op.operationId, entity: 'clientes' });
  });

  it('create idempotente: reprocessar um create cujo id já existe aplica como update (não duplica)', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { processarUmCiclo } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    const dbSqlite = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');

    dbSqlite.saveSheetData('Clientes', [{ id: 'c1', empresa: 'Já existe (aplicado antes, crash antes do ack)' }]);
    escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c1', changes: { empresa: 'Nome do create reprocessado' } });

    const resultado = processarUmCiclo();
    expect(resultado.aplicadas).toBe(1);
    expect(dbSqlite.getSheetData('Clientes')).toHaveLength(1);
    expect(dbSqlite.getSheetData('Clientes')[0]).toMatchObject({ id: 'c1', empresa: 'Nome do create reprocessado' });
  });

  it('operação já com ack "applied" (crash entre aplicar e mover) só é movida, nunca reaplicada', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { processarUmCiclo } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    const dbSqlite = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');
    const { RESULTADOS_DIR, PROCESSADAS_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');

    const op = escreverOperacao({ entity: 'clientes', operation: 'update', recordId: 'c1', changes: { empresa: 'X' } });
    fs.mkdirSync(RESULTADOS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTADOS_DIR, `${op.operationId}.json`), JSON.stringify({ status: 'applied', attempts: 1 }));

    const resultado = processarUmCiclo();
    expect(resultado).toEqual({ aplicadas: 0, comErro: 0, total: 1 });
    expect(dbSqlite.getSheetData('Clientes')).toHaveLength(0); // update num id inexistente nunca aconteceu de fato
    const mes = new Date().toISOString().slice(0, 7);
    expect(fs.existsSync(path.join(PROCESSADAS_DIR, mes, `${op.operationId}.json`))).toBe(true);
  });

  it('operação inválida (entidade desconhecida) falha, some da fila depois de MAX_TENTATIVAS ciclos', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { processarUmCiclo, MAX_TENTATIVAS } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    const { PENDENTES_DIR, RESULTADOS_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');

    const op = escreverOperacao({ entity: 'entidade-que-nao-existe', operation: 'create', recordId: 'x1', changes: {} });

    let ultimoResultado;
    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      ultimoResultado = processarUmCiclo();
    }
    expect(ultimoResultado).toEqual({ aplicadas: 0, comErro: 1, total: 1 });

    const ack = JSON.parse(fs.readFileSync(path.join(RESULTADOS_DIR, `${op.operationId}.json`), 'utf8'));
    expect(ack.status).toBe('skipped');
    expect(ack.attempts).toBe(MAX_TENTATIVAS);
    expect(fs.existsSync(path.join(PENDENTES_DIR, `${op.operationId}.json`))).toBe(false);
  });

  it('ignora arquivos que não seguem o padrão "<uuid>.json" (cópia de conflito do OneDrive)', () => {
    const { PENDENTES_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const { processarUmCiclo } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    fs.mkdirSync(PENDENTES_DIR, { recursive: true });
    fs.writeFileSync(path.join(PENDENTES_DIR, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890-PCDAKAROL.json'), '{}');

    const resultado = processarUmCiclo();
    expect(resultado).toEqual({ aplicadas: 0, comErro: 0, total: 0 });
    expect(fs.readdirSync(PENDENTES_DIR)).toHaveLength(1); // não apagou o arquivo estranho
  });
});

describe('fila/controller: lock (evita dois processos aplicando a fila junto)', () => {
  it('pula o ciclo quando outro processo (pid diferente) já detém um lock fresco', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { processarUmCiclo } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    const { LOCK_FILE } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const { machineId } = carregar<typeof import('../machine.cjs')>('../machine.cjs');

    escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c1', changes: { empresa: 'X' } });
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ machineId, pid: process.pid + 1, heartbeat: new Date().toISOString() }));

    const resultado = processarUmCiclo();
    expect(resultado).toEqual({ aplicadas: 0, comErro: 0, total: 0, bloqueado: true });
  });

  it('ignora um lock expirado (heartbeat antigo) e processa normalmente', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { processarUmCiclo } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    const { LOCK_FILE } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const { machineId } = carregar<typeof import('../machine.cjs')>('../machine.cjs');

    escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c1', changes: { empresa: 'X' } });
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    const heartbeatAntigo = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10min atrás
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ machineId, pid: process.pid + 1, heartbeat: heartbeatAntigo }));

    const resultado = processarUmCiclo();
    expect(resultado).toEqual({ aplicadas: 1, comErro: 0, total: 1 });
  });

  it('libera o lock depois do ciclo (não fica travado pra sempre)', () => {
    const { processarUmCiclo } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    const { LOCK_FILE } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    processarUmCiclo();
    expect(fs.existsSync(LOCK_FILE)).toBe(false);
  });
});

describe('fila/controller + snapshot + leitura remota: round-trip completo', () => {
  it('operação aplicada pelo controller aparece na leitura remota (getSheetDataRemota) depois do snapshot', async () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { rodarCicloComSnapshot } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    const dbSqlite = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');

    escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c1', changes: { empresa: 'Cliente Remoto' } });
    await rodarCicloComSnapshot();

    expect(dbSqlite.getSheetDataRemota('Clientes')).toMatchObject([{ id: 'c1', empresa: 'Cliente Remoto' }]);
  });

  it('repoPlanilha().get em APP_MODE=client lê do snapshot, nunca do SQLite local (vazio)', async () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { rodarCicloComSnapshot } = carregar<typeof import('./controller.cjs')>('./controller.cjs');
    escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c1', changes: { empresa: 'Cliente Remoto' } });
    await rodarCicloComSnapshot();
    // Fecha a conexão da "máquina server" antes de trocar de instância —
    // senão o handle aberto do SQLite fica vazando (Windows não deixa
    // remover o diretório temporário depois, no afterEach).
    carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs')._fecharParaTestes();

    // Simula uma MÁQUINA REMOTA de verdade: SQLITE_DIR próprio, vazio — só o
    // snapshot em DATA_DIR (compartilhado) é comum entre as duas.
    const sqliteDirRemota = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-sqlite-remota-'));
    process.env.SQLITE_DIR = sqliteDirRemota;
    process.env.APP_MODE = 'client';
    limparCaches();
    const { repoPlanilha } = carregar<typeof import('../dominio/repo.cjs')>('../dominio/repo.cjs');
    const dbSqliteCliente = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');

    try {
      expect(repoPlanilha().get('Clientes')).toMatchObject([{ id: 'c1', empresa: 'Cliente Remoto' }]);
      expect(dbSqliteCliente.getSheetData('Clientes')).toHaveLength(0); // local (dessa "máquina") continua vazio
    } finally {
      dbSqliteCliente._fecharParaTestes();
      fs.rmSync(sqliteDirRemota, { recursive: true, force: true });
    }
  });

  it('sem snapshot publicado ainda, leitura remota devolve [] (não é erro)', () => {
    process.env.APP_MODE = 'client';
    limparCaches();
    const dbSqliteCliente = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');
    expect(dbSqliteCliente.getSheetDataRemota('Clientes')).toEqual([]);
  });
});
