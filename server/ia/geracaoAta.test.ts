import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarAtaIA, montarPromptAta } from './geracaoAta.cjs';

const require = createRequire(import.meta.url);

function llmFake(resposta: unknown) {
  return { gerarJSON: async () => resposta, chat: async () => '' };
}

/** Fake que preenche o acumulador de uso, como os provedores reais fazem. */
function llmComUso(resposta: unknown, uso: Record<string, unknown>) {
  return {
    gerarJSON: async (_prompt: string, opts?: { coletarUso?: Record<string, unknown> }) => {
      if (opts?.coletarUso) Object.assign(opts.coletarUso, uso);
      return resposta;
    },
    chat: async () => '',
  };
}

let tmpOneDrive: string;
let tmpSqlite: string;

beforeEach(() => {
  tmpOneDrive = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-ata-od-'));
  tmpSqlite = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-ata-sq-'));
  process.env.ONEDRIVE_ROOT = tmpOneDrive;
  process.env.SQLITE_DIR = tmpSqlite;
});

afterEach(() => {
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  fs.rmSync(tmpOneDrive, { recursive: true, force: true });
  fs.rmSync(tmpSqlite, { recursive: true, force: true });
});

describe('geracaoAta: mede consumo (painel de uso)', () => {
  /**
   * Bug real: gerar ata chamava o modelo por um caminho que NÃO passava pelo
   * `registrarUso` — gastava tokens (pagos, no provedor Claude) de forma
   * invisível no painel de consumo, ao contrário do chat.
   */
  it('registra uma linha em UsoIA com origem "ata"', async () => {
    const { repoMemoria } = require('../dominio/repo.cjs');
    const repo = repoMemoria({ UsoIA: [] });

    await gerarAtaIA({
      subject: 'Reunião mensal',
      llm: llmComUso(
        { oQueFoiTratado: 'Tudo tratado.', decisoes: '', proximosPassos: '' },
        { modelo: 'claude-haiku-4-5', inputTokens: 1200, outputTokens: 300, custoUsd: 0.004 },
      ),
      repo,
    });

    const linhas = repo.get('UsoIA');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      origem: 'ata', modelo: 'claude-haiku-4-5', inputTokens: 1200, outputTokens: 300, custoUsd: 0.004,
    });
  });

  it('sem repo (uso avulso/teste), não tenta medir e não quebra', async () => {
    const r = await gerarAtaIA({
      subject: 'x',
      llm: llmComUso({ oQueFoiTratado: 'ok', decisoes: '', proximosPassos: '' }, { inputTokens: 10 }),
    });
    expect(r.oQueFoiTratado).toBe('ok');
  });
});

describe('geracaoAta: gerarAtaIA', () => {
  it('devolve as 3 seções já normalizadas (trim, string)', async () => {
    const resultado = await gerarAtaIA({
      subject: 'Revisão de estoque',
      resumo: 'Conversamos sobre o estoque parado.',
      checklist: [{ text: 'Revisar estoque parado', done: true }],
      llm: llmFake({
        oQueFoiTratado: '  Foi discutido o estoque parado de amortecedores.  ',
        decisoes: 'Reduzir pedido do próximo mês\nRevisar fornecedor X',
        proximosPassos: 'Enviar planilha de giro até sexta',
      }),
    });

    expect(resultado).toEqual({
      oQueFoiTratado: 'Foi discutido o estoque parado de amortecedores.',
      decisoes: 'Reduzir pedido do próximo mês\nRevisar fornecedor X',
      proximosPassos: 'Enviar planilha de giro até sexta',
    });
  });

  it('devolve string vazia para seção que o modelo não retornou como string', async () => {
    const resultado = await gerarAtaIA({
      subject: 'Reunião de rotina',
      llm: llmFake({ oQueFoiTratado: 'Tudo em dia.', decisoes: null, proximosPassos: undefined }),
    });
    expect(resultado.decisoes).toBe('');
    expect(resultado.proximosPassos).toBe('');
  });

  it('trunca seção absurdamente longa em vez de deixar crescer sem limite', async () => {
    const textoGigante = 'x'.repeat(10_000);
    const resultado = await gerarAtaIA({
      subject: 'Teste',
      llm: llmFake({ oQueFoiTratado: textoGigante, decisoes: '', proximosPassos: '' }),
    });
    expect(resultado.oQueFoiTratado.length).toBeLessThanOrEqual(4000);
  });
});

describe('geracaoAta: montarPromptAta', () => {
  it('inclui a transcrição e instrui a priorizá-la sobre o resumo', () => {
    const prompt = montarPromptAta({
      subject: 'Reunião mensal',
      resumo: 'Resumo curto.',
      transcricao: 'Cliente disse que vai reduzir compra de pneus.',
    });
    expect(prompt).toContain('Cliente disse que vai reduzir compra de pneus.');
    expect(prompt).toMatch(/[Pp]riorize a TRANSCRIÇÃO/);
  });

  it('sinaliza transcrição não fornecida quando ausente, sem inventar conteúdo', () => {
    const prompt = montarPromptAta({ subject: 'Reunião mensal', resumo: 'Resumo curto.' });
    expect(prompt).toContain('(não fornecida)');
  });

  it('inclui a pauta (checklist) e os produtos/situação quando presentes', () => {
    const prompt = montarPromptAta({
      subject: 'Reunião mensal',
      checklist: [{ text: 'Tratar tabela de preços', done: false }],
      produtosSituacao: [{ produto: 'Kit Amortecedor', cliente: 'Widmen', situacao: 'zerou' }],
    });
    expect(prompt).toContain('Tratar tabela de preços');
    expect(prompt).toContain('Widmen · Kit Amortecedor: zerou');
  });

  it('cai no fallback description quando não há resumo', () => {
    const prompt = montarPromptAta({ subject: 'Reunião mensal', description: 'Descrição antiga do evento.' });
    expect(prompt).toContain('Descrição antiga do evento.');
  });
});
