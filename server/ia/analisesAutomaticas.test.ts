import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let oneDriveDir: string;
let sqliteDir: string;
let repoMemoria: typeof import('../dominio/repo.cjs').repoMemoria;
let gerarAnalisesPendentes: typeof import('./analisesAutomaticas.cjs').gerarAnalisesPendentes;
let DOSSIES_DIR: string;

function limparCaches() {
  for (const m of ['../config.cjs', '../modo.cjs', '../dominio/repo.cjs', './analisesAutomaticas.cjs', './analiseCliente.cjs', './ollamaClient.cjs']) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado ainda */ }
  }
}

function ollamaFake(resposta: unknown) {
  return { gerarJSON: async () => resposta, chat: async () => '' };
}

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-onedrive-ia-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-sqlite-ia-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  limparCaches();
  ({ repoMemoria } = require('../dominio/repo.cjs'));
  ({ gerarAnalisesPendentes } = require('./analisesAutomaticas.cjs'));
  ({ DOSSIES_DIR } = require('../config.cjs'));
});

afterEach(() => {
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

describe('analisesAutomaticas: gerarAnalisesPendentes', () => {
  it('analisa cliente com reunião concluída nova e grava dossiê + linha em AnalisesIA', async () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Empresa Teste' }],
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-08-01T10:00:00.000Z', status: 'Concluído', ata: 'Reunião ok.' }],
      AnalisesIA: [],
    });

    const processados = await gerarAnalisesPendentes({
      repo,
      ollama: ollamaFake({
        nivelRisco: 'baixo',
        resumo: 'Cliente em dia.',
        fatores: [],
        sugestaoProximaPauta: 'Seguir cadência normal.',
        dossieAtualizado: 'Cliente estável desde o início.',
      }),
    });

    expect(processados).toBe(1);
    const analises = repo._dump().AnalisesIA;
    expect(analises).toHaveLength(1);
    expect(analises[0]).toMatchObject({ clientId: 'c1', nivelRisco: 'baixo', ultimoEventoAnalisadoData: '2026-08-01T10:00:00.000Z' });
    expect(fs.readFileSync(path.join(DOSSIES_DIR, 'c1--empresa-teste.md'), 'utf8'))
      .toBe('## Empresa Teste\n**Nível de risco:** Baixo | **Atualizado em:** 01/08/2026\n\nCliente estável desde o início.\n');
  });

  it('não reprocessa cliente sem reunião nova desde a última análise', async () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Empresa Teste' }],
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-08-01T10:00:00.000Z', status: 'Concluído', ata: 'Reunião ok.' }],
      AnalisesIA: [{ id: 'a1', clientId: 'c1', nivelRisco: 'baixo', resumo: '', fatores: '[]', sugestaoProximaPauta: '', ultimoEventoAnalisadoData: '2026-08-01T10:00:00.000Z', geradoEm: '2026-08-02T00:00:00.000Z' }],
    });

    const processados = await gerarAnalisesPendentes({ repo, ollama: ollamaFake({}) });
    expect(processados).toBe(0);
  });

  it('ignora eventos que não são conclusão/cancelamento/reagendamento/agendamento (ex.: Pendente)', async () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Empresa Teste' }],
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-08-01T10:00:00.000Z', status: 'Pendente', ata: '' }],
      AnalisesIA: [],
    });

    const processados = await gerarAnalisesPendentes({ repo, ollama: ollamaFake({}) });
    expect(processados).toBe(0);
  });

  /**
   * Pedido do usuário: agendar uma reunião NOVA também deve forçar a
   * atualização do dossiê — é o sinal de que uma "próxima pauta" sugerida
   * virou ação (ver `server/ia/alertas.cjs`, "Pauta recomendada que morreu").
   * Antes só concluir/cancelar/reagendar contava.
   */
  it('conta reunião recém-agendada (status Agendado) como evento relevante', async () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Empresa Teste' }],
      Agenda: [{ id: 'e1', clientId: 'c1', date: '2026-08-01T10:00:00.000Z', status: 'Agendado', ata: '' }],
      AnalisesIA: [],
    });

    const processados = await gerarAnalisesPendentes({ repo, ollama: ollamaFake({ nivelRisco: 'baixo', resumo: '', fatores: [], sugestaoProximaPauta: '', dossieAtualizado: '### Perfil\nX\n\n### Pontos de Atenção\n— nenhum registro\n\n### Oportunidades\n— nenhum registro\n\n### Pendências\n— nenhum registro\n\n### Próxima pauta\n—' }) });
    expect(processados).toBe(1);
  });

  it('isola erro de um cliente sem interromper os demais', async () => {
    const repo = repoMemoria({
      Clientes: [
        { id: 'c1', empresa: 'Cliente com falha' },
        { id: 'c2', empresa: 'Cliente ok' },
      ],
      Agenda: [
        { id: 'e1', clientId: 'c1', date: '2026-08-01T10:00:00.000Z', status: 'Concluído', ata: 'x' },
        { id: 'e2', clientId: 'c2', date: '2026-08-01T10:00:00.000Z', status: 'Concluído', ata: 'y' },
      ],
      AnalisesIA: [],
    });

    let chamadas = 0;
    const ollamaComFalha = {
      gerarJSON: async () => {
        chamadas++;
        if (chamadas === 1) throw new Error('Ollama fora do ar');
        return { nivelRisco: 'baixo', resumo: '', fatores: [], sugestaoProximaPauta: '', dossieAtualizado: 'ok' };
      },
      chat: async () => '',
    };

    const processados = await gerarAnalisesPendentes({ repo, ollama: ollamaComFalha });
    expect(processados).toBe(1);
    expect(repo._dump().AnalisesIA.map((a: { clientId: string }) => a.clientId)).toEqual(['c2']);
  });
});
