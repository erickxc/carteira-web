import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require2 = createRequire(import.meta.url);

/**
 * Bug real de produção: máquinas em `APP_MODE=client` (as remotas, fora da
 * Karol-2D) derrubavam com "escrita direta no SQLite bloqueada" a cada
 * pergunta ao monitorIA — `AcoesIA`, `UsoIA` e `MemoriaIA` escreviam via
 * `repo.save` direto, fora da fila multi-máquina, e a guarda de
 * `server/dbSqlite.cjs` derrubava o processo.
 *
 * Correção definitiva: as três viraram entidades da fila
 * (`server/fila/entidades.cjs` + módulos em `server/dominio/`). Em cliente a
 * escrita vira um arquivo de operação em `PENDENTES_DIR` (o controller aplica
 * depois); em servidor grava direto sobre o repo RECEBIDO.
 *
 * Essa distinção não é detalhe: `executarMutacao` usa `repoPlanilha()` e
 * IGNORA o repo do chamador. Chamar sempre por ele quebraria o isolamento de
 * quem injeta `repoMemoria` — durante o desenvolvimento disto uma execução
 * chegou a gravar uma linha no banco de produção.
 */
let repoMemoria: typeof import('../dominio/repo.cjs').repoMemoria;
let orquestrador: typeof import('./orquestrador.cjs');
let uso: typeof import('./uso.cjs');
let tools: typeof import('./tools.cjs');

// Todo módulo que CACHEIA caminho derivado de ONEDRIVE_ROOT/SQLITE_DIR precisa
// entrar aqui — inclusive `machine.cjs` (guarda machineId/seq em SQLITE_DIR) e
// os da fila. Faltar um faz o teste seguinte escrever na pasta do teste
// ANTERIOR (ou, pior, na real): aconteceu — 5 operações de teste chegaram na
// fila de produção e o controller as rejeitou com "entidade desconhecida".
const MODULOS = [
  '../modo.cjs', '../config.cjs', '../machine.cjs', '../dominio/repo.cjs', '../dbSqlite.cjs',
  '../fila/caminhos.cjs', '../fila/mutacao.cjs', '../fila/escrever.cjs', '../fila/pendentes.cjs',
  './analisesAutomaticas.cjs', './orquestrador.cjs', './uso.cjs', './tools.cjs',
];

function recarregar() {
  for (const m of MODULOS) {
    try { delete require2.cache[require2.resolve(m)]; } catch { /* não carregado */ }
  }
  repoMemoria = require2('../dominio/repo.cjs').repoMemoria;
  orquestrador = require2('./orquestrador.cjs');
  uso = require2('./uso.cjs');
  tools = require2('./tools.cjs');
}

const ferramenta = (nome: string) => tools.FERRAMENTAS.find((f: { name: string }) => f.name === nome)!.executar;

/** Operações que foram parar na fila (arquivos JSON em PENDENTES_DIR). */
function operacoesNaFila(entity: string) {
  const { PENDENTES_DIR } = require2('../fila/caminhos.cjs');
  if (!fs.existsSync(PENDENTES_DIR)) return [];
  return fs.readdirSync(PENDENTES_DIR)
    .filter((f: string) => f.endsWith('.json'))
    .map((f: string) => JSON.parse(fs.readFileSync(path.join(PENDENTES_DIR, f), 'utf8')))
    .filter((op: { entity: string }) => op.entity === entity);
}

describe('APP_MODE=client: escrita de IA vai pra fila, nunca direto no SQLite', () => {
  let tmpOneDrive: string;
  let tmpSqlite: string;

  beforeEach(() => {
    // Isola as DUAS raízes: `ONEDRIVE_ROOT` porque a fila grava arquivos de
    // operação em `PENDENTES_DIR` (derivado dele) e os dossiês vivem lá; e
    // `SQLITE_DIR` porque o caminho cliente da fila LÊ o banco real pra
    // calcular a resposta otimista — sem isolar, o teste leria (e o
    // `delete` decidiria com base em) dado de produção.
    tmpOneDrive = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-fila-test-'));
    tmpSqlite = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-fila-sql-'));
    process.env.ONEDRIVE_ROOT = tmpOneDrive;
    process.env.SQLITE_DIR = tmpSqlite;

    process.env.APP_MODE = 'client';
    recarregar();
  });

  afterEach(() => {
    try { require2('../dbSqlite.cjs')._fecharParaTestes(); } catch { /* já fechado */ }
    delete process.env.APP_MODE;
    delete process.env.ONEDRIVE_ROOT;
    delete process.env.SQLITE_DIR;
    for (const dir of [tmpOneDrive, tmpSqlite]) {
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* SO libera depois */ }
    }
    recarregar();
  });

  it('registrarAcao não lança e enfileira em vez de escrever direto', () => {
    const repo = repoMemoria({ AcoesIA: [] });
    expect(() => orquestrador.registrarAcao(repo, { ferramenta: 'x', argumentos: {}, resultado: {}, origem: 'chat' })).not.toThrow();
    expect(repo.get('AcoesIA')).toEqual([]); // não tocou o SQLite local
    expect(operacoesNaFila('acoesIA')).toHaveLength(1);
  });

  it('registrarUso não lança e enfileira', () => {
    const repo = repoMemoria({ UsoIA: [] });
    expect(() => uso.registrarUso(repo, { origem: 'chat', provedor: 'ollama', turnId: 't1', duracaoMs: 1 })).not.toThrow();
    expect(repo.get('UsoIA')).toEqual([]);
    expect(operacoesNaFila('usoIA')).toHaveLength(1);
  });

  it('registrar_memoria funciona (enfileira) em vez de recusar', () => {
    const repo = repoMemoria({ MemoriaIA: [] });
    const nova = ferramenta('registrar_memoria')(repo, { texto: 'regra nova' });
    expect(nova.texto).toBe('regra nova');
    expect(nova.id).toBeTruthy(); // id definitivo gerado já no cliente
    expect(operacoesNaFila('memoriaIA')).toHaveLength(1);
  });

  it('remover_memoria não enfileira delete de registro que o cliente não enxerga', () => {
    // Contrato da fila (`fila/mutacao.cjs`): o caminho cliente valida contra o
    // que ELE enxerga (o snapshot publicado pelo controller, não o SQLite
    // local) e devolve null sem enfileirar quando o id não existe lá. Sem
    // snapshot semeado, é este o caminho exercitado — e o importante é que
    // NÃO lança nem enfileira lixo.
    const repo = repoMemoria({ MemoriaIA: [{ id: 'm1', texto: 'x' }] });
    expect(() => ferramenta('remover_memoria')(repo, { id: 'm1' })).not.toThrow();
    expect(operacoesNaFila('memoriaIA')).toEqual([]);
  });

  it('corrigir_dossie_cliente funciona (o dossiê é ARQUIVO, não SQLite) sem sincronizar AnalisesIA', () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'X', servicos: [] }],
      AnalisesIA: [{ id: 'a1', clientId: 'c1', nivelRisco: 'baixo', resumo: '', sugestaoProximaPauta: 'pauta antiga' }],
    });
    const dossie = '### Perfil\nX\n\n### Pontos de Atenção\n— nenhum registro\n\n### Oportunidades\n— nenhum registro\n\n### Pendências\n— nenhum registro\n\n### Próxima pauta\nnova pauta';
    expect(() => ferramenta('corrigir_dossie_cliente')(repo, { clientId: 'c1', dossie })).not.toThrow();
    // AnalisesIA fica FORA da fila de propósito (dono único: a análise
    // automática, que só roda no servidor) — não pode ter sido tocada aqui.
    expect(repo.get('AnalisesIA')[0].sugestaoProximaPauta).toBe('pauta antiga');
  });
});

describe('APP_MODE=server (padrão): grava direto no repo RECEBIDO', () => {
  beforeEach(() => { recarregar(); });

  it('registrarAcao grava no repo injetado (não no banco real)', () => {
    const repo = repoMemoria({ AcoesIA: [] });
    orquestrador.registrarAcao(repo, { ferramenta: 'x', argumentos: {}, resultado: {}, origem: 'chat' });
    expect(repo.get('AcoesIA')).toHaveLength(1);
  });

  it('registrarUso grava no repo injetado', () => {
    const repo = repoMemoria({ UsoIA: [] });
    uso.registrarUso(repo, { origem: 'chat', provedor: 'ollama', turnId: 't1', duracaoMs: 1 });
    expect(repo.get('UsoIA')).toHaveLength(1);
  });

  it('registrar_memoria grava no repo injetado', () => {
    const repo = repoMemoria({ MemoriaIA: [] });
    ferramenta('registrar_memoria')(repo, { texto: 'regra' });
    expect(repo.get('MemoriaIA')).toHaveLength(1);
  });

  it('remover_memoria remove do repo injetado', () => {
    const repo = repoMemoria({ MemoriaIA: [{ id: 'm1', texto: 'x' }] });
    ferramenta('remover_memoria')(repo, { id: 'm1' });
    expect(repo.get('MemoriaIA')).toEqual([]);
  });
});
