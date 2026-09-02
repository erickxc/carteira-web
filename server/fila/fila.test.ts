import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// A fila mora dentro de DATA_DIR (OneDrive) — precisa de um ONEDRIVE_ROOT
// isolado em todo teste, senão os testes escreveriam `filas/` dentro do
// OneDrive real do usuário. SQLITE_DIR também isolado (machine.cjs persiste
// machineId/seq lá, e dbSqlite.cjs abre o arquivo real).
const MODULOS_PARA_RESETAR = [
  '../config.cjs', '../modo.cjs', '../machine.cjs', '../dbSqlite.cjs',
  '../dominio/repo.cjs', '../dominio/clientes.cjs', '../dominio/agenda.cjs',
  '../dominio/lembretes.cjs', '../dominio/acoes.cjs', '../dominio/modelos.cjs',
  './caminhos.cjs', './entidades.cjs', './aplicar.cjs', './escrever.cjs', './pendentes.cjs', './mutacao.cjs', './status.cjs',
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

describe('fila/escrever: escreverOperacao', () => {
  it('grava um arquivo por operação em filas/pendentes, write-once (tmp+rename)', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const op = escreverOperacao({ entity: 'clientes', operation: 'update', recordId: 'c1', changes: { empresa: 'X' } });

    expect(op.schemaVersion).toBe(1);
    expect(op.entity).toBe('clientes');
    expect(op.seq).toBe(1);

    const { PENDENTES_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const arquivo = path.join(PENDENTES_DIR, `${op.operationId}.json`);
    expect(fs.existsSync(arquivo)).toBe(true);
    expect(JSON.parse(fs.readFileSync(arquivo, 'utf8'))).toMatchObject({ operationId: op.operationId, recordId: 'c1' });
  });

  it('seq é monotônico entre chamadas', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const op1 = escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c1', changes: {} });
    const op2 = escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c2', changes: {} });
    expect(op2.seq).toBe(op1.seq + 1);
  });
});

describe('fila/pendentes: aplicarOverlay', () => {
  it('sem pendentes, devolve os dados intactos', () => {
    const { aplicarOverlay } = carregar<typeof import('./pendentes.cjs')>('./pendentes.cjs');
    const dados = [{ id: 'c1', empresa: 'Original' }];
    expect(aplicarOverlay('Clientes', dados)).toEqual(dados);
  });

  it('aplica update pendente próprio por cima da leitura, sem gravar nada', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { aplicarOverlay } = carregar<typeof import('./pendentes.cjs')>('./pendentes.cjs');
    escreverOperacao({ entity: 'clientes', operation: 'update', recordId: 'c1', changes: { empresa: 'Atualizado' } });

    const dados = [{ id: 'c1', empresa: 'Original' }];
    const comOverlay = aplicarOverlay('Clientes', dados);
    // `syncClienteColumns` (transform aplicado por clientes.atualizar) também
    // deriva monitoria/price/controladoria/suspenso — não afeta o que este
    // teste verifica (overlay aplicado, original intocado).
    expect(comOverlay).toMatchObject([{ id: 'c1', empresa: 'Atualizado' }]);
    // Não mutou o array original nem gravou no SQLite local.
    expect(dados[0].empresa).toBe('Original');
  });

  it('ignora operação já com ack em resultados/ (não reaplica)', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { aplicarOverlay } = carregar<typeof import('./pendentes.cjs')>('./pendentes.cjs');
    const { RESULTADOS_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const op = escreverOperacao({ entity: 'clientes', operation: 'update', recordId: 'c1', changes: { empresa: 'Atualizado' } });

    fs.mkdirSync(RESULTADOS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTADOS_DIR, `${op.operationId}.json`), JSON.stringify({ status: 'applied' }));

    const dados = [{ id: 'c1', empresa: 'Original' }];
    expect(aplicarOverlay('Clientes', dados)).toEqual(dados);
  });

  it('continua aplicando uma operação com ack "error" (ainda não desistiu, controller vai tentar de novo)', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { aplicarOverlay } = carregar<typeof import('./pendentes.cjs')>('./pendentes.cjs');
    const { RESULTADOS_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const op = escreverOperacao({ entity: 'clientes', operation: 'update', recordId: 'c1', changes: { empresa: 'Atualizado' } });

    fs.mkdirSync(RESULTADOS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTADOS_DIR, `${op.operationId}.json`), JSON.stringify({ status: 'error', attempts: 2, error: 'timeout' }));

    const dados = [{ id: 'c1', empresa: 'Original' }];
    expect(aplicarOverlay('Clientes', dados)).toMatchObject([{ id: 'c1', empresa: 'Atualizado' }]);
  });

  it('para de aplicar uma operação com ack "skipped" (desistiu, exige investigação manual)', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { aplicarOverlay } = carregar<typeof import('./pendentes.cjs')>('./pendentes.cjs');
    const { RESULTADOS_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const op = escreverOperacao({ entity: 'clientes', operation: 'update', recordId: 'c1', changes: { empresa: 'Atualizado' } });

    fs.mkdirSync(RESULTADOS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTADOS_DIR, `${op.operationId}.json`), JSON.stringify({ status: 'skipped', attempts: 5 }));

    const dados = [{ id: 'c1', empresa: 'Original' }];
    expect(aplicarOverlay('Clientes', dados)).toEqual(dados);
  });

  it('ignora operações de outras máquinas', () => {
    const { PENDENTES_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const { aplicarOverlay } = carregar<typeof import('./pendentes.cjs')>('./pendentes.cjs');
    fs.mkdirSync(PENDENTES_DIR, { recursive: true });
    fs.writeFileSync(path.join(PENDENTES_DIR, 'op-outra-maquina.json'), JSON.stringify({
      schemaVersion: 1, operationId: 'op-outra-maquina', machineId: 'outra-maquina-id', seq: 1,
      createdAt: new Date().toISOString(), entity: 'clientes', operation: 'update', recordId: 'c1',
      changes: { empresa: 'Não deveria aparecer' },
    }));

    const dados = [{ id: 'c1', empresa: 'Original' }];
    expect(aplicarOverlay('Clientes', dados)).toEqual(dados);
  });
});

describe('fila/mutacao: executarMutacao', () => {
  it('em modo server, comportamento idêntico a chamar o domínio direto (grava de verdade)', () => {
    process.env.APP_MODE = 'server';
    limparCaches();
    const { executarMutacao } = carregar<typeof import('./mutacao.cjs')>('./mutacao.cjs');
    const dbSqlite = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');

    const criado = executarMutacao('clientes', 'create', { payload: { empresa: 'Empresa Server' } });
    expect(criado.empresa).toBe('Empresa Server');
    expect(dbSqlite.getSheetData('Clientes')).toHaveLength(1);
  });

  it('em modo client, NÃO grava no SQLite local — devolve resposta otimista e escreve na fila', () => {
    process.env.APP_MODE = 'client';
    limparCaches();
    const { executarMutacao } = carregar<typeof import('./mutacao.cjs')>('./mutacao.cjs');
    const dbSqlite = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');
    const { PENDENTES_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');

    const criado = executarMutacao('clientes', 'create', { payload: { empresa: 'Empresa Cliente' } });
    expect(criado.empresa).toBe('Empresa Cliente');
    expect(typeof criado.id).toBe('string');

    // Nada foi de fato persistido no SQLite local (só a fila tem o registro).
    expect(dbSqlite.getSheetData('Clientes')).toHaveLength(0);
    expect(fs.readdirSync(PENDENTES_DIR).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });

  it('em modo client, update encadeado na mesma máquina vê o create pendente anterior (overlay)', () => {
    process.env.APP_MODE = 'client';
    limparCaches();
    const { executarMutacao } = carregar<typeof import('./mutacao.cjs')>('./mutacao.cjs');

    const criado = executarMutacao('clientes', 'create', { payload: { empresa: 'Empresa Cliente' } });
    const atualizado = executarMutacao('clientes', 'update', { id: criado.id, patch: { empresa: 'Empresa Cliente Editada' } });

    expect(atualizado).not.toBeNull();
    expect(atualizado.empresa).toBe('Empresa Cliente Editada');
  });

  it('em modo client, update num id inexistente devolve null (mesmo contrato do modo server)', () => {
    process.env.APP_MODE = 'client';
    limparCaches();
    const { executarMutacao } = carregar<typeof import('./mutacao.cjs')>('./mutacao.cjs');
    expect(executarMutacao('clientes', 'update', { id: 'nao-existe', patch: { empresa: 'X' } })).toBeNull();
  });

  it('em modo client, delete não escreve na fila quando o id não existe', () => {
    process.env.APP_MODE = 'client';
    limparCaches();
    const { executarMutacao } = carregar<typeof import('./mutacao.cjs')>('./mutacao.cjs');
    const { PENDENTES_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');

    expect(executarMutacao('clientes', 'delete', { id: 'nao-existe' })).toBeNull();
    expect(fs.existsSync(PENDENTES_DIR) ? fs.readdirSync(PENDENTES_DIR) : []).toHaveLength(0);
  });

  // Módulo Ágil: as 8 entidades entraram na fila depois (mesmo bug já visto em
  // AcoesIA/UsoIA/MemoriaIA — rotas chamando o domínio direto sobre
  // repoPlanilha(), sem passar por executarMutacao/isClient). `agilTarefas` é
  // representativa: `criar()` usa `opts.id` (contrato exigido pelo cálculo
  // otimista em modo cliente) e tem campos extra (numero/ordem) calculados
  // pelo próprio domínio.
  it('em modo client, agilTarefas.create não grava no SQLite local e escreve na fila', () => {
    process.env.APP_MODE = 'client';
    limparCaches();
    const { executarMutacao } = carregar<typeof import('./mutacao.cjs')>('./mutacao.cjs');
    const dbSqlite = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');
    const { PENDENTES_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');

    const criada = executarMutacao('agilTarefas', 'create', {
      payload: { boardId: 'b1', colunaId: 'c1', swimlaneId: 's1', titulo: 'Tarefa via fila' },
    });
    expect(criada.titulo).toBe('Tarefa via fila');
    expect(typeof criada.id).toBe('string');
    expect(criada.numero).toBe(1);

    expect(dbSqlite.getSheetData('AgilTarefas')).toHaveLength(0);
    expect(fs.readdirSync(PENDENTES_DIR).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });

  it('em modo client, agilTarefas.update encadeado vê o create pendente anterior (overlay)', () => {
    process.env.APP_MODE = 'client';
    limparCaches();
    const { executarMutacao } = carregar<typeof import('./mutacao.cjs')>('./mutacao.cjs');

    const criada = executarMutacao('agilTarefas', 'create', {
      payload: { boardId: 'b1', colunaId: 'c1', swimlaneId: 's1', titulo: 'Tarefa' },
    });
    const atualizada = executarMutacao('agilTarefas', 'update', { id: criada.id, patch: { titulo: 'Tarefa editada' } });

    expect(atualizada).not.toBeNull();
    expect(atualizada.titulo).toBe('Tarefa editada');
  });

  it('em modo server, agilTarefas.create grava de verdade no SQLite', () => {
    process.env.APP_MODE = 'server';
    limparCaches();
    const { executarMutacao } = carregar<typeof import('./mutacao.cjs')>('./mutacao.cjs');
    const dbSqlite = carregar<typeof import('../dbSqlite.cjs')>('../dbSqlite.cjs');

    const criada = executarMutacao('agilTarefas', 'create', {
      payload: { boardId: 'b1', colunaId: 'c1', swimlaneId: 's1', titulo: 'Tarefa servidor' },
    });
    expect(criada.titulo).toBe('Tarefa servidor');
    expect(dbSqlite.getSheetData('AgilTarefas')).toHaveLength(1);
  });
});

describe('fila/status: statusFila', () => {
  it('sem nada pendente, devolve zerado', () => {
    const { statusFila } = carregar<typeof import('./status.cjs')>('./status.cjs');
    expect(statusFila()).toEqual({ pendentes: 0, comErro: 0, ultimoErro: null });
  });

  it('conta operações desta máquina sem ack e com ack "error"; ignora "applied"/"skipped"', () => {
    const { escreverOperacao } = carregar<typeof import('./escrever.cjs')>('./escrever.cjs');
    const { statusFila } = carregar<typeof import('./status.cjs')>('./status.cjs');
    const { RESULTADOS_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');

    escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c1', changes: {} }); // sem ack
    const opErro = escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c2', changes: {} });
    const opAplicada = escreverOperacao({ entity: 'clientes', operation: 'create', recordId: 'c3', changes: {} });

    fs.mkdirSync(RESULTADOS_DIR, { recursive: true });
    fs.writeFileSync(path.join(RESULTADOS_DIR, `${opErro.operationId}.json`), JSON.stringify({ status: 'error', error: 'timeout' }));
    fs.writeFileSync(path.join(RESULTADOS_DIR, `${opAplicada.operationId}.json`), JSON.stringify({ status: 'applied' }));

    expect(statusFila()).toEqual({ pendentes: 2, comErro: 1, ultimoErro: 'timeout' });
  });

  it('ignora operações de outras máquinas', () => {
    const { PENDENTES_DIR } = carregar<typeof import('./caminhos.cjs')>('./caminhos.cjs');
    const { statusFila } = carregar<typeof import('./status.cjs')>('./status.cjs');
    fs.mkdirSync(PENDENTES_DIR, { recursive: true });
    fs.writeFileSync(path.join(PENDENTES_DIR, 'op-outra-maquina.json'), JSON.stringify({
      schemaVersion: 1, operationId: 'op-outra-maquina', machineId: 'outra-maquina-id', seq: 1,
      createdAt: new Date().toISOString(), entity: 'clientes', operation: 'create', recordId: 'x1', changes: {},
    }));
    expect(statusFila()).toEqual({ pendentes: 0, comErro: 0, ultimoErro: null });
  });
});
