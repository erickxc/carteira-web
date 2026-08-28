import { describe, expect, it } from 'vitest';
import { gerarAlertas } from './alertas.cjs';
import { repoMemoria } from '../dominio/repo.cjs';

/**
 * Os alertas existem pra transformar as análises automáticas — que rodavam e
 * ninguém lia — em conversa. Cada caso abaixo é um gatilho que as normas do
 * agente já descreviam mas que só disparava se alguém, por acaso, perguntasse
 * sobre aquele cliente.
 */
const AGORA = new Date('2026-08-28T12:00:00.000Z');

const cliente = (id: string, empresa: string, extra: Record<string, unknown> = {}) => ({
  id, empresa, estado: 'Ativo', status: 'Regular', servicos: '["Monitoria"]',
  createdAt: '2026-01-01T00:00:00.000Z', observacao: '', ...extra,
});

const base = (over: Record<string, unknown> = {}) => repoMemoria({
  Clientes: [], Agenda: [], Acoes: [], AnalisesIA: [], Cadencias: [], ...over,
});

describe('alertas do monitorIA', () => {
  it('risco alto sem reunião futura vira alerta de severidade alta', () => {
    const repo = base({
      Clientes: [cliente('c1', 'Multimarcas')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'alto', resumo: 'Vendas caindo há 3 meses.' }],
    });
    const [alerta] = gerarAlertas(repo, { agora: AGORA }).filter((a: { tipo: string }) => a.tipo === 'risco_sem_pauta');
    expect(alerta.severidade).toBe('alta');
    expect(alerta.detalhe).toBe('Vendas caindo há 3 meses.');
    expect(alerta.clientId).toBe('c1');
    // A pergunta vai LITERAL pro chat: tem que citar o cliente e pedir ação.
    expect(alerta.pergunta).toContain('Multimarcas');
  });

  it('risco alto COM reunião marcada não alerta', () => {
    const repo = base({
      Clientes: [cliente('c1', 'Multimarcas')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'alto', resumo: '' }],
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-09-10', status: 'Agendado' }],
    });
    expect(gerarAlertas(repo, { agora: AGORA }).filter((a: { tipo: string }) => a.tipo === 'risco_sem_pauta')).toEqual([]);
  });

  it('reunião cancelada não conta como compromisso de pé', () => {
    const repo = base({
      Clientes: [cliente('c1', 'Multimarcas')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'alto', resumo: '' }],
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-09-10', status: 'Cancelado' }],
    });
    expect(gerarAlertas(repo, { agora: AGORA }).some((a: { tipo: string }) => a.tipo === 'risco_sem_pauta')).toBe(true);
  });

  it('cliente inativo/suspenso não gera alerta', () => {
    // Não faz sentido cobrar cadência de quem saiu do atendimento normal —
    // mesma regra de `isClienteAtivo` no resto do app.
    const repo = base({
      Clientes: [cliente('c1', 'Suspensa', { status: 'Suspenso' }), cliente('c2', 'Desligada', { estado: 'Inativo' })],
      AnalisesIA: [
        { id: 'a', clientId: 'c1', nivelRisco: 'alto', resumo: '' },
        { id: 'b', clientId: 'c2', nivelRisco: 'alto', resumo: '' },
      ],
    });
    expect(gerarAlertas(repo, { agora: AGORA })).toEqual([]);
  });

  it('um cliente com dois problemas aparece uma vez só, no mais grave', () => {
    // Sem isso, o mesmo cliente ocuparia dois cartões e a lista pareceria
    // maior que o problema.
    const repo = base({
      Clientes: [cliente('c1', 'Dupla')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'alto', resumo: '' }],
    });
    const alertas = gerarAlertas(repo, { agora: AGORA });
    expect(alertas.filter((a: { clientId: string }) => a.clientId === 'c1')).toHaveLength(1);
    expect(alertas[0].severidade).toBe('alta');
  });

  it('cliente ativo sem análise nenhuma vira alerta de baixa', () => {
    const repo = base({
      Clientes: [cliente('c1', 'Novata')],
      // Contato recente pra não disparar o alerta de "sem contato".
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-08-27', status: 'Concluído' }],
    });
    const tipos = gerarAlertas(repo, { agora: AGORA }).map((a: { tipo: string }) => a.tipo);
    expect(tipos).toContain('sem_analise');
  });

  it('ordena por severidade e respeita o teto', () => {
    const clientes = Array.from({ length: 12 }, (_, i) => cliente(`c${i}`, `Loja ${String(i).padStart(2, '0')}`));
    const repo = base({ Clientes: clientes });
    const alertas = gerarAlertas(repo, { agora: AGORA, max: 4 });
    expect(alertas).toHaveLength(4);
    const peso = { alta: 3, media: 2, baixa: 1 } as Record<string, number>;
    const pesos = alertas.map((a: { severidade: string }) => peso[a.severidade]);
    expect([...pesos].sort((x, y) => y - x)).toEqual(pesos);
  });

  it('carteira sem problema não inventa alerta', () => {
    const repo = base({
      Clientes: [cliente('c1', 'Ok')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'baixo', resumo: '' }],
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-08-27', status: 'Concluído' }, { id: 'e2', clientId: 'c1', date: '2026-09-05', status: 'Agendado' }],
    });
    expect(gerarAlertas(repo, { agora: AGORA })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Os dois alertas abaixo (contradição e pauta parada) dependem do dossiê, que
// é um ARQUIVO em DOSSIES_DIR — não dá pra usar `repoMemoria` sozinho. Isola
// com um DOSSIES_DIR temporário e `require` fresco, mesmo cuidado de
// `dbSqlite.test.ts`: sem isso o teste leria/escreveria no dossiê REAL.
// ---------------------------------------------------------------------------
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';

const require2 = createRequire(import.meta.url);
let tmpDossies: string;
let alertasComDossie: typeof import('./alertas.cjs');
let analisesAutomaticas: typeof import('./analisesAutomaticas.cjs');

function recarregarComDossieTemp() {
  for (const m of ['../config.cjs', './analisesAutomaticas.cjs', './alertas.cjs']) {
    try { delete require2.cache[require2.resolve(m)]; } catch { /* não carregado ainda */ }
  }
  analisesAutomaticas = require2('./analisesAutomaticas.cjs');
  alertasComDossie = require2('./alertas.cjs');
}

describe('alertas que dependem do dossiê (contradição, pauta parada, padrões)', () => {
  beforeEach(() => {
    // `DOSSIES_DIR` não tem override próprio — deriva de `ONEDRIVE_ROOT`
    // (config.cjs: DATA_DIR = ONEDRIVE_ROOT + 'Carteira Web', DOSSIES_DIR =
    // DATA_DIR + 'dossies'). É por ONEDRIVE_ROOT que se isola, mesmo padrão
    // dos outros testes que tocam SQLITE_DIR/config.
    tmpDossies = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-dossies-test-'));
    process.env.ONEDRIVE_ROOT = tmpDossies;
    recarregarComDossieTemp();
  });

  afterEach(() => {
    delete process.env.ONEDRIVE_ROOT;
    fs.rmSync(tmpDossies, { recursive: true, force: true });
  });

  function gravarDossie(clientId: string, empresa: string, pontosDeAtencao: string[]) {
    const corpo = `### Perfil\nCliente teste.\n\n### Pontos de Atenção\n${pontosDeAtencao.map((p) => `- ${p}`).join('\n')}\n\n### Oportunidades\n— nenhum registro\n\n### Pendências\n— nenhum registro\n\n### Próxima pauta\nRevisar.`;
    // Usa a mesma função de gravação da análise automática, pra testar contra
    // o formato REAL de arquivo, não uma versão simplificada inventada aqui.
    (analisesAutomaticas as unknown as { corrigirDossieCliente: (a: unknown) => void }).corrigirDossieCliente({
      clientId, empresa, nivelRisco: 'baixo', corpoNovo: corpo,
    });
  }

  it('dossiê com 2+ sinais negativos e risco baixo vira alerta de contradição', () => {
    const repo = repoMemoria({
      Clientes: [cliente('c1', 'Loja Contraditória')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'baixo', resumo: '' }],
      // Contato recente: sem isso o cliente também dispara "sem_contato"
      // (severidade alta), que pelo dedup por-cliente vence a contradição
      // (severidade media) e o teste passaria checando o alerta errado.
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-08-27', status: 'Concluído' }],
    });
    gravarDossie('c1', 'Loja Contraditória', ['[10/08] cliente cancelou a reunião', '[15/08] não compareceu de novo, sem retorno']);
    const alertas = alertasComDossie.gerarAlertas(repo, { agora: AGORA });
    const contradicao = alertas.find((a: { tipo: string }) => a.tipo === 'contradicao_dossie');
    expect(contradicao).toBeDefined();
    expect(contradicao.titulo).toContain('2 sinais negativos');
  });

  it('1 sinal negativo só não é contradição — precisa de padrão, não de um evento isolado', () => {
    const repo = repoMemoria({
      Clientes: [cliente('c1', 'Loja Ok')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'baixo', resumo: '' }],
    });
    gravarDossie('c1', 'Loja Ok', ['[10/08] reunião cancelada uma vez, remarcada sem problema']);
    expect(alertasComDossie.gerarAlertas(repo, { agora: AGORA }).some((a: { tipo: string }) => a.tipo === 'contradicao_dossie')).toBe(false);
  });

  it('risco já alto/médio não precisa de alerta de contradição — a classificação já reflete o problema', () => {
    const repo = repoMemoria({
      Clientes: [cliente('c1', 'Loja Alto')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'alto', resumo: '' }],
    });
    gravarDossie('c1', 'Loja Alto', ['[10/08] cancelou', '[15/08] não compareceu']);
    expect(alertasComDossie.gerarAlertas(repo, { agora: AGORA }).some((a: { tipo: string }) => a.tipo === 'contradicao_dossie')).toBe(false);
  });

  it('padrão de carteira só acende com massa mínima de clientes', () => {
    const repo = repoMemoria({ Clientes: Array.from({ length: 6 }, (_, i) => cliente(`c${i}`, `Loja ${i}`)) });
    // 5 clientes com "sem ata" (o mínimo), 1 sem nada.
    for (let i = 0; i < 5; i++) gravarDossie(`c${i}`, `Loja ${i}`, ['[10/08] reunião sem ata de pauta']);
    gravarDossie('c5', 'Loja 5', ['[10/08] tudo certo']);

    const padroes = alertasComDossie.gerarPadroesCarteira(repo);
    const semAta = padroes.find((p: { id: string }) => p.id === 'padrao:sem_ata');
    expect(semAta?.titulo).toContain('5 clientes');
  });

  it('padrão abaixo do mínimo não gera card — silêncio é melhor que ruído', () => {
    const repo = repoMemoria({ Clientes: Array.from({ length: 3 }, (_, i) => cliente(`c${i}`, `Loja ${i}`)) });
    for (let i = 0; i < 3; i++) gravarDossie(`c${i}`, `Loja ${i}`, ['[10/08] reunião cancelada']);
    expect(alertasComDossie.gerarPadroesCarteira(repo)).toEqual([]);
  });
});
