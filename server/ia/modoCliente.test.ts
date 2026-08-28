import { createRequire } from 'module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require2 = createRequire(import.meta.url);

/**
 * Bug real de produção: máquinas em APP_MODE=client (as remotas, fora da
 * Karol-2D) derrubavam com "escrita direta no SQLite bloqueada" a cada
 * pergunta ao monitorIA — AcoesIA, UsoIA e MemoriaIA nunca entraram na fila
 * multi-máquina (server/fila/entidades.cjs), então QUALQUER chamada de
 * ferramenta ou resposta do agente tentava escrever direto e o guard de
 * `server/dbSqlite.cjs` derrubava o processo.
 *
 * `isClient` é lido de `server/modo.cjs` na primeira vez que o módulo é
 * exigido — precisa de `require` fresco depois de setar `APP_MODE`, mesmo
 * cuidado dos outros testes que tocam config/estado de módulo.
 */
let repoMemoria: typeof import('../dominio/repo.cjs').repoMemoria;
let orquestrador: typeof import('./orquestrador.cjs');
let uso: typeof import('./uso.cjs');
let tools: typeof import('./tools.cjs');

function recarregar() {
  for (const m of ['./modo.cjs', '../dominio/repo.cjs', './orquestrador.cjs', './uso.cjs', './tools.cjs'].map((x) => x.replace('./modo.cjs', '../modo.cjs'))) {
    try { delete require2.cache[require2.resolve(m)]; } catch { /* não carregado */ }
  }
  repoMemoria = require2('../dominio/repo.cjs').repoMemoria;
  orquestrador = require2('./orquestrador.cjs');
  uso = require2('./uso.cjs');
  tools = require2('./tools.cjs');
}

describe('APP_MODE=client: escrita de IA nunca derruba a resposta ao usuário', () => {
  beforeEach(() => {
    process.env.APP_MODE = 'client';
    recarregar();
  });

  afterEach(() => {
    delete process.env.APP_MODE;
    recarregar();
  });

  it('registrarAcao não lança e não grava nada (sem fila pra AcoesIA ainda)', () => {
    const repo = repoMemoria({ AcoesIA: [] });
    expect(() => orquestrador.registrarAcao(repo, { ferramenta: 'x', argumentos: {}, resultado: {}, origem: 'chat' })).not.toThrow();
    expect(repo.get('AcoesIA')).toEqual([]);
  });

  it('registrarUso não lança e não grava nada (sem fila pra UsoIA ainda)', () => {
    const repo = repoMemoria({ UsoIA: [] });
    expect(() => uso.registrarUso(repo, { origem: 'chat', provedor: 'ollama', turnId: 't1', duracaoMs: 1 })).not.toThrow();
    expect(repo.get('UsoIA')).toEqual([]);
  });

  it('registrar_memoria falha com mensagem clara — não finge ter salvo', () => {
    const repo = repoMemoria({ MemoriaIA: [] });
    const executar = tools.FERRAMENTAS.find((f: { name: string }) => f.name === 'registrar_memoria')!.executar;
    expect(() => executar(repo, { texto: 'regra' })).toThrow(/máquina principal/i);
    expect(repo.get('MemoriaIA')).toEqual([]);
  });

  it('remover_memoria falha com mensagem clara — não finge ter apagado', () => {
    const repo = repoMemoria({ MemoriaIA: [{ id: 'm1', texto: 'x' }] });
    const executar = tools.FERRAMENTAS.find((f: { name: string }) => f.name === 'remover_memoria')!.executar;
    expect(() => executar(repo, { id: 'm1' })).toThrow(/máquina principal/i);
    expect(repo.get('MemoriaIA')).toHaveLength(1);
  });

  it('corrigir_dossie_cliente continua funcionando (o dossiê é ARQUIVO, não SQLite) sem sincronizar AnalisesIA', () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'X', servicos: [] }],
      AnalisesIA: [{ id: 'a1', clientId: 'c1', nivelRisco: 'baixo', resumo: '', sugestaoProximaPauta: 'pauta antiga' }],
    });
    const executar = tools.FERRAMENTAS.find((f: { name: string }) => f.name === 'corrigir_dossie_cliente')!.executar;
    const dossie = '### Perfil\nX\n\n### Pontos de Atenção\n— nenhum registro\n\n### Oportunidades\n— nenhum registro\n\n### Pendências\n— nenhum registro\n\n### Próxima pauta\nnova pauta';
    expect(() => executar(repo, { clientId: 'c1', dossie })).not.toThrow();
    // AnalisesIA (SQLite) não pode ter sido tocada nesta máquina.
    expect(repo.get('AnalisesIA')[0].sugestaoProximaPauta).toBe('pauta antiga');
  });
});

describe('APP_MODE=server (padrão): nada disso se aplica', () => {
  beforeEach(() => { recarregar(); });

  it('registrarAcao grava normalmente', () => {
    const repo = repoMemoria({ AcoesIA: [] });
    orquestrador.registrarAcao(repo, { ferramenta: 'x', argumentos: {}, resultado: {}, origem: 'chat' });
    expect(repo.get('AcoesIA')).toHaveLength(1);
  });

  it('registrar_memoria grava normalmente', () => {
    const repo = repoMemoria({ MemoriaIA: [] });
    const executar = tools.FERRAMENTAS.find((f: { name: string }) => f.name === 'registrar_memoria')!.executar;
    executar(repo, { texto: 'regra' });
    expect(repo.get('MemoriaIA')).toHaveLength(1);
  });
});
