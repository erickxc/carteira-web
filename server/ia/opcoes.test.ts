import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Resolução de valores de cadastro (monitor/serviço/sala/tipo) ao criar
 * evento/lembrete.
 *
 * Existe por causa de um bug real: o agente criou uma reunião com
 * `monitores: ["Erick"]` — a opção cadastrada é "Erick Cardoso". O valor foi
 * gravado como veio, não casou com nenhuma opção na tela de edição (que é um
 * <select>), e o campo apareceu VAZIO pro usuário. Silencioso: nenhum erro,
 * nenhum log, só dado corrompido — o pior tipo de falha porque parece que deu
 * certo.
 *
 * `ONEDRIVE_ROOT`/`SQLITE_DIR` isolados (mesmo padrão de `tools.test.ts`):
 * `criar_evento` GRAVA de verdade via `executarMutacao`, que abre seu próprio
 * `repoPlanilha()` ignorando o `repoMemoria()` passado aqui — sem isolar essas
 * env vars, os testes de "criar_evento: resolve antes de gravar" escreviam
 * reuniões reais no banco de PRODUÇÃO desta máquina (achado real: 328 linhas
 * de "Cliente Teste" acumuladas ao longo de dias de execução da suíte, uma
 * combinação exata com estes 2 testes que completam sem lançar erro).
 */

let tmpOneDrive: string;
let tmpSqlite: string;
let repoMemoria: typeof import('../dominio/repo.cjs').repoMemoria;
let FERRAMENTAS: { name: string; description: string; parameters: unknown; executar: (repo: unknown, args?: unknown) => unknown }[];
let resolverOpcao: typeof import('./tools.cjs').resolverOpcao;
let dbSqlite: typeof import('../dbSqlite.cjs');

const MODULOS = [
  '../config.cjs', '../dbSqlite.cjs', '../modo.cjs', '../dominio/repo.cjs',
  '../fila/mutacao.cjs', '../dominio/agenda.cjs', '../dominio/lembretes.cjs', './tools.cjs',
];

function limparCaches() {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
}

beforeEach(() => {
  tmpOneDrive = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-opcoes-od-'));
  tmpSqlite = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-opcoes-sq-'));
  process.env.ONEDRIVE_ROOT = tmpOneDrive;
  process.env.SQLITE_DIR = tmpSqlite;
  limparCaches();
  ({ repoMemoria } = require('../dominio/repo.cjs'));
  ({ FERRAMENTAS, resolverOpcao } = require('./tools.cjs'));
  dbSqlite = require('../dbSqlite.cjs');
});

afterEach(() => {
  // Fecha a conexão SQLite antes de apagar a pasta temp — mesmo padrão de
  // `tools.test.ts`/`dbSqlite.test.ts` (Windows não deixa remover arquivo com
  // handle aberto).
  dbSqlite._fecharParaTestes();
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(tmpOneDrive, { recursive: true, force: true });
  fs.rmSync(tmpSqlite, { recursive: true, force: true });
});

const F = (nome: string) => FERRAMENTAS.find((f) => f.name === nome)!;

const CATEGORIAS = [
  { id: '1', tipo: 'monitor', valor: 'Yann Cruz' },
  { id: '2', tipo: 'monitor', valor: 'Erick Cardoso' },
  { id: '3', tipo: 'monitor', valor: 'Karol Santana' },
  { id: '4', tipo: 'servico', valor: 'Monitoria' },
  { id: '5', tipo: 'servico', valor: 'Precificação' },
  { id: '6', tipo: 'sala', valor: 'Nova Iorque' },
  { id: '7', tipo: 'sala', valor: 'Paris' },
  { id: '8', tipo: 'tipo_evento', valor: 'Reunião' },
];

describe('resolverOpcao', () => {
  it('casa nome parcial com a opção cadastrada — o bug real', () => {
    const repo = repoMemoria({ Categorias: CATEGORIAS });
    expect(resolverOpcao(repo, 'monitor', 'Erick', 'monitor')).toBe('Erick Cardoso');
  });

  it('ignora acento e maiúscula no match exato', () => {
    const repo = repoMemoria({ Categorias: CATEGORIAS });
    expect(resolverOpcao(repo, 'servico', 'precificacao', 'servico')).toBe('Precificação');
    expect(resolverOpcao(repo, 'monitor', 'KAROL SANTANA', 'monitor')).toBe('Karol Santana');
  });

  it('erra com a lista de opções quando não existe — nunca inventa nem grava vazio', () => {
    const repo = repoMemoria({ Categorias: CATEGORIAS });
    expect(() => resolverOpcao(repo, 'monitor', 'João', 'monitor'))
      .toThrow(/não existe.*Yann Cruz.*Erick Cardoso.*Karol Santana/s);
  });

  it('erra (não escolhe por conta própria) quando o parcial é ambíguo', () => {
    const comAmbiguidade = repoMemoria({ Categorias: [...CATEGORIAS, { id: '9', tipo: 'monitor', valor: 'Erick Almeida' }] });
    expect(() => resolverOpcao(comAmbiguidade, 'monitor', 'erick', 'monitor')).toThrow(/ambíguo/);
  });

  it('categoria sem nenhuma opção cadastrada não trava — devolve o valor como veio', () => {
    const semCategoria = repoMemoria({ Categorias: [] });
    expect(resolverOpcao(semCategoria, 'monitor', 'Qualquer', 'monitor')).toBe('Qualquer');
  });
});

describe('criar_evento: resolve antes de gravar', () => {
  function repoComCliente() {
    return repoMemoria({
      Categorias: CATEGORIAS,
      Clientes: [{ id: 'c1', empresa: 'Cliente Teste', servicos: '[]' }],
      Agenda: [],
    });
  }

  it('grava o nome completo mesmo quando o modelo manda parcial', () => {
    const repo = repoComCliente();
    const criado = F('criar_evento').executar(repo, {
      clientId: 'c1', type: 'reuniao', date: '2026-09-10', time: '10:00',
      monitores: ['Erick'], servicos: ['monitoria'], sala: 'nova iorque',
    }) as { monitores: string[]; servicos: string[]; sala: string; type: string };
    expect(criado.monitores).toEqual(['Erick Cardoso']);
    expect(criado.servicos).toEqual(['Monitoria']);
    expect(criado.sala).toBe('Nova Iorque');
    expect(criado.type).toBe('Reunião');
  });

  /**
   * Bug real: o agente criou uma reunião com `["Erick", "Erick Cardoso"]` — os
   * dois resolvem pro MESMO monitor, e a reunião ficava com ele duplicado
   * ("Monitores: Erick Cardoso, Erick Cardoso" na ata). Deduplicar tem de ser
   * DEPOIS de resolver: os textos de entrada são diferentes, o valor final não.
   */
  it('não duplica o monitor quando dois textos resolvem pro mesmo cadastro', () => {
    const repo = repoComCliente();
    const criado = F('criar_evento').executar(repo, {
      clientId: 'c1', type: 'Reunião', date: '2026-09-10',
      monitores: ['Erick', 'Erick Cardoso'], servicos: ['monitoria', 'Monitoria'],
    }) as { monitores: string[]; servicos: string[] };
    expect(criado.monitores).toEqual(['Erick Cardoso']);
    expect(criado.servicos).toEqual(['Monitoria']);
  });

  it('falha ANTES de gravar quando o monitor não existe — não cria evento com dado ruim', () => {
    const repo = repoComCliente();
    expect(() => F('criar_evento').executar(repo, {
      clientId: 'c1', type: 'Reunião', date: '2026-09-10', monitores: ['Fulano'],
    })).toThrow(/não existe/);
    expect(repo.get('Agenda')).toHaveLength(0);
  });
});

describe('buscar_opcoes_evento', () => {
  it('devolve as categorias usadas na criação/edição de evento, lembrete e cliente', () => {
    const repo = repoMemoria({
      Categorias: [
        ...CATEGORIAS,
        { id: '9', tipo: 'tipo_lembrete', valor: 'Contato' },
        { id: '10', tipo: 'status_evento', valor: 'Agendado' },
        { id: '11', tipo: 'status_evento', valor: 'Pendente' },
        { id: '12', tipo: 'status_cliente', valor: 'Regular' },
      ],
    });
    expect(F('buscar_opcoes_evento').executar(repo)).toEqual({
      monitor: ['Yann Cruz', 'Erick Cardoso', 'Karol Santana'],
      servico: ['Monitoria', 'Precificação'],
      sala: ['Nova Iorque', 'Paris'],
      tipo_evento: ['Reunião'],
      tipo_lembrete: ['Contato'],
      // `status_evento` faltava aqui, e o agente ficava sem saber que
      // "Rascunho" não existe (nem que "Pendente" é o equivalente) — criou
      // evento como "Agendado" afirmando ter criado um rascunho.
      status_evento: ['Agendado', 'Pendente'],
      status_cliente: ['Regular'],
    });
  });

  it('categoria sem valor cadastrado vem como lista vazia, não quebra', () => {
    const repo = repoMemoria({ Categorias: [...CATEGORIAS] });
    const r = F('buscar_opcoes_evento').executar(repo) as Record<string, string[]>;
    expect(r.status_evento).toEqual([]);
    expect(r.status_cliente).toEqual([]);
  });
});
