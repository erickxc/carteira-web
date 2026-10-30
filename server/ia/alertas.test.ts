import { afterAll, describe, expect, it, vi } from 'vitest';
import { gerarAlertas } from './alertas.cjs';
import { repoMemoria } from '../dominio/repo.cjs';

// `gerarAlertas` lê o retrato do DW por padrão: sem isto, os casos abaixo que não
// passam `retrato` leriam o arquivo real do OneDrive desta máquina.
const pastaIsolada = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const pasta = mkdtempSync(join(tmpdir(), 'carteira-alertas-'));
  process.env.ONEDRIVE_ROOT = pasta;
  process.env.SQLITE_DIR = pasta;
  return pasta;
});

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

describe('alerta de certificado', () => {
  afterAll(() => fs.rmSync(pastaIsolada, { recursive: true, force: true }));

  // Data local, como a tela: 2026-08-28 + 30 dias = 2026-09-27.
  const comLojas = (...cnpjs: string[]) => cliente('c1', 'Pecita', {
    monitor: 'Erick',
    lojasCadastro: cnpjs.map((cnpj, i) => ({ nome: `Loja ${i + 1}`, cnpj })),
  });
  const retratoCom = (validades: Record<string, string | null>) => ({
    geradoEm: 'x',
    porCnpj: Object.fromEntries(Object.entries(validades).map(([cnpj, certificadoValidade]) => [cnpj, { certificadoValidade }])),
  });
  const certificados = (repo: unknown, retrato: unknown) => gerarAlertas(repo, { agora: AGORA, retrato })
    .filter((a: { tipo: string }) => a.tipo === 'certificado');

  it('loja vencida gera cartão crítico, com a loja e a pergunta pronta', () => {
    const repo = base({ Clientes: [comLojas('111')] });
    const [alerta, ...resto] = certificados(repo, retratoCom({ 111: '2026-08-27' }));
    expect(resto).toEqual([]);
    expect(alerta).toMatchObject({ id: 'certificado:c1', severidade: 'alta', clientId: 'c1', cliente: 'Pecita', monitor: 'Erick' });
    expect(alerta.detalhe).toBe('Loja 1: vencido em 27/08/2026');
    expect(alerta.pergunta).toContain('Pecita');
    expect(alerta.pergunta).toContain(alerta.detalhe);
  });

  it('a 30 dias gera; a 31 não gera', () => {
    const repo = base({ Clientes: [comLojas('111')] });
    const [alerta] = certificados(repo, retratoCom({ 111: '2026-09-27' }));
    expect(alerta.severidade).toBe('media');
    expect(alerta.detalhe).toBe('Loja 1: vence em 27/09/2026');
    expect(certificados(repo, retratoCom({ 111: '2026-09-28' }))).toEqual([]);
  });

  it('sem retrato, CNPJ fora do retrato, sem data ou data ilegível não geram', () => {
    const repo = base({ Clientes: [comLojas('111')] });
    expect(certificados(repo, null)).toEqual([]);
    expect(certificados(repo, retratoCom({ 222: '2026-08-27' }))).toEqual([]);
    expect(certificados(repo, retratoCom({ 111: null }))).toEqual([]);
    expect(certificados(repo, retratoCom({ 111: 'lixo' }))).toEqual([]);
  });

  it('duas lojas do mesmo cliente = um cartão, a pior primeiro; só as que precisam de atenção', () => {
    const repo = base({ Clientes: [comLojas('111', '222', '333')] });
    const lista = certificados(repo, retratoCom({ 111: '2026-09-10', 222: '2026-08-01', 333: '2027-01-01' }));
    expect(lista).toHaveLength(1);
    expect(lista[0].severidade).toBe('alta');
    expect(lista[0].detalhe).toBe('Loja 2: vencido em 01/08/2026; Loja 1: vence em 10/09/2026');
  });

  it('CNPJ com pontuação casa com o retrato e cliente inativo não gera', () => {
    const repo = base({ Clientes: [
      cliente('c1', 'Pecita', { lojasCadastro: [{ nome: 'Matriz', cnpj: '07.503.705/0001-70' }] }),
      cliente('c2', 'Saiu', { estado: 'Inativo', lojasCadastro: [{ nome: 'Matriz', cnpj: '111' }] }),
    ] });
    const lista = certificados(repo, retratoCom({ 111: '2026-08-01', '07503705000170': '2026-08-01' }));
    expect(lista.map((a: { clientId: string }) => a.clientId)).toEqual(['c1']);
  });

  it('fica fora do dedup e do max: quem não vê este tipo não pode perder o cartão que ele tomaria', () => {
    const clientes = Array.from({ length: 3 }, (_, i) => cliente(`c${i}`, `Loja ${i}`, { lojasCadastro: [{ nome: 'Matriz', cnpj: `${i}` }] }));
    const repo = base({
      Clientes: clientes,
      AnalisesIA: clientes.map((c) => ({ id: `a${c.id}`, clientId: c.id, nivelRisco: 'alto', resumo: '' })),
    });
    const alertas: { tipo: string; clientId: string }[] = gerarAlertas(repo, {
      agora: AGORA, max: 2, retrato: retratoCom({ 0: '2026-08-01', 1: '2026-08-01', 2: '2026-08-01' }),
    });
    expect(alertas.filter((a) => a.tipo === 'certificado')).toHaveLength(3);
    expect(alertas.filter((a) => a.tipo === 'risco_sem_pauta')).toHaveLength(2);
  });

  it('vence hoje ainda é "vencendo"; ontem já é "vencido" e sobe a severidade', () => {
    const repo = base({ Clientes: [comLojas('111')] });
    const [hoje] = certificados(repo, retratoCom({ 111: '2026-08-28' }));
    expect(hoje).toMatchObject({ severidade: 'media', titulo: 'Pecita: certificado digital vencendo', detalhe: 'Loja 1: vence em 28/08/2026' });
    const [ontem] = certificados(repo, retratoCom({ 111: '2026-08-27' }));
    expect(ontem).toMatchObject({ severidade: 'alta', titulo: 'Pecita: certificado digital vencido' });
  });

  it('o limite de 30 dias é por dia do calendário, não pela hora do relógio', () => {
    const repo = base({ Clientes: [comLojas('111')] });
    const noDia = (agora: Date, data: string) => gerarAlertas(repo, { agora, retrato: retratoCom({ 111: data }) })
      .filter((a: { tipo: string }) => a.tipo === 'certificado');
    for (const agora of [new Date(2026, 7, 28, 0, 1), new Date(2026, 7, 28, 23, 59)]) {
      expect(noDia(agora, '2026-09-27')).toHaveLength(1);
      expect(noDia(agora, '2026-09-28')).toEqual([]);
      expect(noDia(agora, '2026-08-28')[0].severidade).toBe('media');
      expect(noDia(agora, '2026-08-27')[0].severidade).toBe('alta');
    }
  });

  it('só cliente em atendimento: suspenso, "Atendido pelo Marco" e pausado não geram', () => {
    const lojas = [{ nome: 'Matriz', cnpj: '111' }];
    const retrato = retratoCom({ 111: '2026-08-01' });
    for (const extra of [{ status: 'Suspenso' }, { status: 'Atendido pelo Marco' }, { pausadoAte: '2026-12-31' }]) {
      expect(certificados(base({ Clientes: [cliente('c1', 'Pecita', { lojasCadastro: lojas, ...extra })] }), retrato)).toEqual([]);
    }
  });

  it('cadastro torto não derruba nem inventa cartão: sem lojas, loja nula, sem CNPJ, sem nome, lojas em texto JSON', () => {
    const retrato = retratoCom({ 111: '2026-08-01' });
    expect(certificados(base({ Clientes: [cliente('c1', 'A')] }), retrato)).toEqual([]);
    expect(certificados(base({ Clientes: [cliente('c1', 'A', { lojasCadastro: [null, { nome: 'Sem CNPJ' }, { nome: 'Vazio', cnpj: '' }] })] }), retrato)).toEqual([]);
    const [semNome] = certificados(base({ Clientes: [cliente('c1', 'A', { lojasCadastro: [{ cnpj: '111' }] })] }), retrato);
    expect(semNome.detalhe).toBe('111: vencido em 01/08/2026');
    const [emTexto] = certificados(base({ Clientes: [cliente('c1', 'A', { lojasCadastro: JSON.stringify([{ nome: 'M', cnpj: '111' }]) })] }), retrato);
    expect(emTexto.detalhe).toBe('M: vencido em 01/08/2026');
  });

  it('retrato do formato antigo (só produtos, ou sem porCnpj) não gera cartão nem quebra', () => {
    const repo = base({ Clientes: [comLojas('111')] });
    expect(certificados(repo, { geradoEm: 'x', porCnpj: { 111: { produtos: ['Apura'] } } })).toEqual([]);
    expect(certificados(repo, { geradoEm: 'x' })).toEqual([]);
  });

  it('cliente com risco alto e certificado tem dois cartões, com ids distintos, o mais grave antes', () => {
    const repo = base({
      Clientes: [comLojas('111')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'alto', resumo: '' }],
    });
    const alertas: { id: string; tipo: string }[] = gerarAlertas(repo, { agora: AGORA, retrato: retratoCom({ 111: '2026-09-10' }) });
    expect(alertas.map((a) => a.tipo)).toEqual(['risco_sem_pauta', 'certificado']);
    expect(new Set(alertas.map((a) => a.id)).size).toBe(2);
  });

  it('sem a opção `retrato`, lê o arquivo da pasta de dados; arquivo corrompido não derruba os outros alertas', () => {
    const arquivo = path.join(pastaIsolada, 'dados', 'dw-produtos.json');
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    const repo = base({
      Clientes: [comLojas('111')],
      AnalisesIA: [{ id: 'a', clientId: 'c1', nivelRisco: 'alto', resumo: '' }],
    });
    const tipos = () => gerarAlertas(repo, { agora: AGORA }).map((a: { tipo: string }) => a.tipo);

    fs.writeFileSync(arquivo, JSON.stringify(retratoCom({ 111: '2026-08-01' })));
    expect(tipos()).toContain('certificado');

    fs.writeFileSync(arquivo, '{ corrompido');
    expect(tipos()).toEqual(['risco_sem_pauta']);
  });
});

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
    // 5 clientes com cancelamento (o mínimo), 1 sem nada.
    for (let i = 0; i < 5; i++) gravarDossie(`c${i}`, `Loja ${i}`, ['[10/08] reunião cancelada pelo cliente']);
    gravarDossie('c5', 'Loja 5', ['[10/08] tudo certo']);

    const padroes = alertasComDossie.gerarPadroesCarteira(repo);
    const cancel = padroes.find((p: { id: string }) => p.id === 'padrao:cancelamento');
    expect(cancel?.titulo).toContain('5 clientes');
  });

  it('ata não preenchida não é padrão da carteira (desde 22/10/2026)', () => {
    const repo = repoMemoria({ Clientes: Array.from({ length: 6 }, (_, i) => cliente(`c${i}`, `Loja ${i}`)) });
    for (let i = 0; i < 6; i++) gravarDossie(`c${i}`, `Loja ${i}`, ['[10/08] reunião sem ata de pauta']);
    expect(alertasComDossie.gerarPadroesCarteira(repo)).toEqual([]);
  });

  it('padrão abaixo do mínimo não gera card — silêncio é melhor que ruído', () => {
    const repo = repoMemoria({ Clientes: Array.from({ length: 3 }, (_, i) => cliente(`c${i}`, `Loja ${i}`)) });
    for (let i = 0; i < 3; i++) gravarDossie(`c${i}`, `Loja ${i}`, ['[10/08] reunião cancelada']);
    expect(alertasComDossie.gerarPadroesCarteira(repo)).toEqual([]);
  });
});
