import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

// Módulos de domínio são CommonJS (`server/` inteiro é `.cjs`, sem build step)
// — `createRequire` garante semântica de `require` correta em vez de depender
// de interop de ESM do bundler de teste.
const require = createRequire(import.meta.url);
const { repoMemoria } = require('./repo.cjs');
const clientesDominio = require('./clientes.cjs');
const agendaDominio = require('./agenda.cjs');
const acoesDominio = require('./acoes.cjs');

// `efeitosExternos: false` em todos os testes: nenhum deles deve tocar
// arquivo real (REUNIOES_DIR, geração de relatório) — só a planilha em
// memória do repo. Sem isso, os testes de domínio dependeriam de OneDrive
// disponível na máquina que roda `npm test`.
const SEM_EFEITOS = { efeitosExternos: false };

describe('dominio/clientes', () => {
  it('criar gera id e deriva monitoria/price/suspenso via syncClienteColumns', () => {
    const repo = repoMemoria({ Clientes: [], Agenda: [], Lembretes: [], Acoes: [] });
    const novo = clientesDominio.criar(repo, { empresa: 'Teste', servicos: ['Monitoria'], status: 'Suspenso' }, SEM_EFEITOS);
    expect(novo.id).toBeTruthy();
    expect(novo.monitoria).toBe(true);
    expect(novo.price).toBe(false);
    expect(novo.suspenso).toBe(true);
    expect(repo.get('Clientes')).toHaveLength(1);
  });

  it('criar ignora um id vindo no payload e gera um novo (mesmo comportamento de antes)', () => {
    const repo = repoMemoria({ Clientes: [] });
    const novo = clientesDominio.criar(repo, { id: 'id-forjado', empresa: 'Teste', servicos: [] }, SEM_EFEITOS);
    expect(novo.id).not.toBe('id-forjado');
  });

  it('opts.id permite ao chamador decidir o id (uso futuro: fila/overlay)', () => {
    const repo = repoMemoria({ Clientes: [] });
    const novo = clientesDominio.criar(repo, { empresa: 'Teste', servicos: [] }, { ...SEM_EFEITOS, id: 'id-fixo' });
    expect(novo.id).toBe('id-fixo');
  });

  it('atualizar faz merge e reaplica syncClienteColumns', () => {
    const repo = repoMemoria({ Clientes: [{ id: 'c1', empresa: 'Teste', servicos: [], status: 'Regular' }] });
    const updated = clientesDominio.atualizar(repo, 'c1', { status: 'Suspenso' }, SEM_EFEITOS);
    expect(updated?.suspenso).toBe(true);
  });

  it('atualizar devolve null quando o id não existe', () => {
    const repo = repoMemoria({ Clientes: [] });
    expect(clientesDominio.atualizar(repo, 'inexistente', { status: 'Regular' }, SEM_EFEITOS)).toBeNull();
  });

  it('remover faz cascade delete de Agenda, Lembretes e Acoes vinculados', () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Teste' }],
      Agenda: [{ id: 'e1', clientId: 'c1' }, { id: 'e2', clientId: 'outro' }],
      Lembretes: [{ id: 'l1', clientId: 'c1' }, { id: 'l2', clientId: 'outro' }],
      Acoes: [{ id: 'a1', clientId: 'c1' }, { id: 'a2', clientId: 'outro' }],
    });
    const found = clientesDominio.remover(repo, 'c1');
    expect(found).toBe(true);
    expect(repo.get('Clientes')).toHaveLength(0);
    expect(repo.get('Agenda').map((a: { id: string }) => a.id)).toEqual(['e2']);
    expect(repo.get('Lembretes').map((l: { id: string }) => l.id)).toEqual(['l2']);
    expect(repo.get('Acoes').map((a: { id: string }) => a.id)).toEqual(['a2']);
  });

  it('remover devolve false quando o cliente não existe (sem tocar as outras abas)', () => {
    const repo = repoMemoria({ Clientes: [], Agenda: [{ id: 'e1', clientId: 'x' }] });
    expect(clientesDominio.remover(repo, 'inexistente')).toBe(false);
    expect(repo.get('Agenda')).toHaveLength(1);
  });
});

describe('dominio/agenda', () => {
  it('remover faz cascade de Lembretes pelo eventId', () => {
    const repo = repoMemoria({
      Agenda: [{ id: 'e1', clientId: 'c1' }],
      Lembretes: [{ id: 'l1', eventId: 'e1' }, { id: 'l2', eventId: 'outro' }],
    });
    const found = agendaDominio.remover(repo, 'e1', SEM_EFEITOS);
    expect(found).toBe(true);
    expect(repo.get('Lembretes').map((l: { id: string }) => l.id)).toEqual(['l2']);
  });

  it('criar e atualizar preservam id e fazem merge simples', () => {
    const repo = repoMemoria({ Agenda: [] });
    const novo = agendaDominio.criar(repo, { clientId: 'c1', type: 'Reunião', status: 'Agendado' }, SEM_EFEITOS);
    const updated = agendaDominio.atualizar(repo, novo.id, { status: 'Concluído' }, SEM_EFEITOS);
    expect(updated?.status).toBe('Concluído');
    expect(updated?.clientId).toBe('c1');
  });
});

describe('dominio/acoes', () => {
  it('criar define createdAt/updatedAt; atualizar recalcula updatedAt', async () => {
    const repo = repoMemoria({ Acoes: [] });
    const nova = acoesDominio.criar(repo, { clientId: 'c1', tipo: 'contato', segmento: 'engajado', status: 'programado' });
    expect(nova.createdAt).toBe(nova.updatedAt);
    await new Promise((r) => setTimeout(r, 2));
    const updated = acoesDominio.atualizar(repo, nova.id, { status: 'concluido' });
    expect(updated?.status).toBe('concluido');
    expect(updated?.updatedAt).not.toBe(nova.createdAt);
  });
});
