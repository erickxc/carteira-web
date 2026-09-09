import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

// Módulos de domínio são CommonJS — mesmo padrão de dominio.test.ts.
const require = createRequire(import.meta.url);
const { repoMemoria } = require('./repo.cjs');
const workspacesDominio = require('./agilWorkspaces.cjs');
const boardsDominio = require('./agilBoards.cjs');
const tarefasDominio = require('./agilTarefas.cjs');
const iniciativasDominio = require('./agilIniciativas.cjs');
const frentesDominio = require('./agilFrentes.cjs');
const camposPersonalizadosDominio = require('./agilCamposPersonalizados.cjs');

describe('dominio/agilIniciativas', () => {
  it('criar gera id, ordem por board e createdAt', () => {
    const repo = repoMemoria({ AgilIniciativas: [] });
    const nova = iniciativasDominio.criar(repo, { boardId: 'b1', titulo: 'Épico 1' });
    expect(nova.id).toBeTruthy();
    expect(nova.ordem).toBe(0);
    expect(nova.createdAt).toBeTruthy();
    expect(repo.get('AgilIniciativas')).toHaveLength(1);
  });

  it('remover NÃO apaga as tarefas que apontavam pra ela — só limpa iniciativaId (não-destrutivo)', () => {
    const repo = repoMemoria({
      AgilIniciativas: [{ id: 'i1', boardId: 'b1', titulo: 'Épico', ordem: 0 }],
      AgilTarefas: [
        { id: 't1', boardId: 'b1', colunaId: 'c1', iniciativaId: 'i1', titulo: 'Tarefa A' },
        { id: 't2', boardId: 'b1', colunaId: 'c1', iniciativaId: 'outra', titulo: 'Tarefa B' },
      ],
    });
    const found = iniciativasDominio.remover(repo, 'i1');
    expect(found).toBe(true);
    expect(repo.get('AgilIniciativas')).toHaveLength(0);
    expect(repo.get('AgilTarefas')).toHaveLength(2);
    expect(repo.get('AgilTarefas').find((t: { id: string }) => t.id === 't1').iniciativaId).toBe('');
    expect(repo.get('AgilTarefas').find((t: { id: string }) => t.id === 't2').iniciativaId).toBe('outra');
  });

  it('remover devolve false quando a iniciativa não existe', () => {
    const repo = repoMemoria({ AgilIniciativas: [] });
    expect(iniciativasDominio.remover(repo, 'inexistente')).toBe(false);
  });
});

describe('dominio/agilFrentes', () => {
  it('criar gera id, ordem global e createdAt', () => {
    const repo = repoMemoria({ AgilFrentes: [{ id: 'f0', nome: 'Monitoria', cor: '#123456', ordem: 0 }] });
    const nova = frentesDominio.criar(repo, { nome: 'Análise', cor: '#654321' });
    expect(nova.ordem).toBe(1);
    expect(repo.get('AgilFrentes')).toHaveLength(2);
  });

  it('remover limpa frenteId das tarefas que a usavam, sem apagar as tarefas', () => {
    const repo = repoMemoria({
      AgilFrentes: [{ id: 'f1', nome: 'Alvos', cor: '#111111', ordem: 0 }],
      AgilTarefas: [
        { id: 't1', boardId: 'b1', colunaId: 'c1', frenteId: 'f1', titulo: 'Tarefa A' },
        { id: 't2', boardId: 'b1', colunaId: 'c1', frenteId: 'outra', titulo: 'Tarefa B' },
      ],
    });
    const found = frentesDominio.remover(repo, 'f1');
    expect(found).toBe(true);
    expect(repo.get('AgilTarefas').find((t: { id: string }) => t.id === 't1').frenteId).toBe('');
    expect(repo.get('AgilTarefas').find((t: { id: string }) => t.id === 't2').frenteId).toBe('outra');
  });
});

describe('dominio/agilCamposPersonalizados', () => {
  it('criar gera id, ordem por board e createdAt', () => {
    const repo = repoMemoria({ AgilCamposPersonalizados: [] });
    const novo = camposPersonalizadosDominio.criar(repo, { boardId: 'b1', nome: 'Valor do contrato', tipo: 'numero' });
    expect(novo.id).toBeTruthy();
    expect(novo.ordem).toBe(0);
    expect(repo.get('AgilCamposPersonalizados')).toHaveLength(1);
  });

  it('atualizar faz merge (ex.: trocar tipo pra selecao e gravar opcoes)', () => {
    const repo = repoMemoria({ AgilCamposPersonalizados: [{ id: 'c1', boardId: 'b1', nome: 'Status', tipo: 'texto', ordem: 0 }] });
    const salvo = camposPersonalizadosDominio.atualizar(repo, 'c1', { tipo: 'selecao', opcoes: JSON.stringify(['A', 'B']) });
    expect(salvo.tipo).toBe('selecao');
    expect(salvo.opcoes).toBe(JSON.stringify(['A', 'B']));
  });

  it('remover NÃO limpa o valor gravado nas tarefas — só some da lista de campos', () => {
    const repo = repoMemoria({
      AgilCamposPersonalizados: [{ id: 'c1', boardId: 'b1', nome: 'Status', tipo: 'texto', ordem: 0 }],
      AgilTarefas: [{ id: 't1', boardId: 'b1', colunaId: 'col1', titulo: 'Tarefa', camposPersonalizados: JSON.stringify({ c1: 'em dia' }) }],
    });
    const found = camposPersonalizadosDominio.remover(repo, 'c1');
    expect(found).toBe(true);
    expect(repo.get('AgilCamposPersonalizados')).toHaveLength(0);
    expect(repo.get('AgilTarefas')[0].camposPersonalizados).toBe(JSON.stringify({ c1: 'em dia' }));
  });
});

describe('dominio/agilBoards', () => {
  it('criar já nasce com as 5 colunas de período padrão, sem criar board companheiro', () => {
    const repo = repoMemoria({ AgilBoards: [], AgilColunas: [] });
    const novo = boardsDominio.criar(repo, { workspaceId: 'w1', nome: 'Board 1' });
    expect(novo.ehIniciativas).toBeUndefined();
    expect(novo.iniciativasBoardId).toBeUndefined();
    expect(repo.get('AgilBoards')).toHaveLength(1);
    const colunas = repo.get('AgilColunas').filter((c: { boardId: string }) => c.boardId === novo.id);
    expect(colunas.map((c: { titulo: string }) => c.titulo)).toEqual(['Backlog', 'A fazer', 'Em andamento', 'Validação', 'Concluído']);
  });

  it('remover faz cascade: colunas, tarefas, subtarefas, comentários, iniciativas e campos personalizados do board somem', () => {
    const repo = repoMemoria({
      AgilBoards: [{ id: 'b1', workspaceId: 'w1', nome: 'Board' }],
      AgilColunas: [{ id: 'c1', boardId: 'b1', titulo: 'Backlog', ordem: 0 }],
      AgilTarefas: [{ id: 't1', boardId: 'b1', colunaId: 'c1', titulo: 'Tarefa' }],
      AgilSubtarefas: [{ id: 's1', tarefaId: 't1', titulo: 'Sub' }],
      AgilComentarios: [{ id: 'co1', tarefaId: 't1', autor: 'x', texto: 'oi' }],
      AgilIniciativas: [{ id: 'i1', boardId: 'b1', titulo: 'Épico' }],
      AgilCamposPersonalizados: [{ id: 'cp1', boardId: 'b1', nome: 'Status', tipo: 'texto' }],
    });
    const found = boardsDominio.remover(repo, 'b1');
    expect(found).toBe(true);
    expect(repo.get('AgilColunas')).toHaveLength(0);
    expect(repo.get('AgilTarefas')).toHaveLength(0);
    expect(repo.get('AgilSubtarefas')).toHaveLength(0);
    expect(repo.get('AgilComentarios')).toHaveLength(0);
    expect(repo.get('AgilIniciativas')).toHaveLength(0);
    expect(repo.get('AgilCamposPersonalizados')).toHaveLength(0);
  });

  it('remover board NÃO apaga Frentes (globais) — elas sobrevivem ao board', () => {
    const repo = repoMemoria({
      AgilBoards: [{ id: 'b1', workspaceId: 'w1', nome: 'Board' }],
      AgilFrentes: [{ id: 'f1', nome: 'Monitoria', cor: '#111111' }],
      AgilTarefas: [{ id: 't1', boardId: 'b1', colunaId: 'c1', frenteId: 'f1', titulo: 'Tarefa' }],
    });
    boardsDominio.remover(repo, 'b1');
    expect(repo.get('AgilFrentes')).toHaveLength(1);
  });
});

describe('dominio/agilTarefas', () => {
  it('criar ordena por coluna (sem swimlane) e numera sequencialmente por board', () => {
    const repo = repoMemoria({ AgilTarefas: [] });
    const t1 = tarefasDominio.criar(repo, { boardId: 'b1', colunaId: 'c1', titulo: 'Tarefa 1' });
    const t2 = tarefasDominio.criar(repo, { boardId: 'b1', colunaId: 'c1', titulo: 'Tarefa 2' });
    expect(t1.numero).toBe(1);
    expect(t2.numero).toBe(2);
    expect(t2.ordem).toBe(1);
    expect(t1.swimlaneId).toBeUndefined();
  });

  it('remover devolve iniciativaId vazio pras tarefas que apontavam pra ela como iniciativa', () => {
    const repo = repoMemoria({
      AgilTarefas: [
        { id: 'epico', boardId: 'b1', colunaId: 'c1', titulo: 'Épico' },
        { id: 't1', boardId: 'b1', colunaId: 'c1', iniciativaId: 'epico', titulo: 'Filha' },
      ],
    });
    tarefasDominio.remover(repo, 'epico');
    expect(repo.get('AgilTarefas').find((t: { id: string }) => t.id === 't1').iniciativaId).toBe('');
  });
});

describe('dominio/agilWorkspaces', () => {
  it('remover faz cascade em cadeia: área → boards → colunas/tarefas/iniciativas', () => {
    const repo = repoMemoria({
      AgilWorkspaces: [{ id: 'w1', nome: 'Área' }],
      AgilBoards: [{ id: 'b1', workspaceId: 'w1', nome: 'Board' }],
      AgilColunas: [{ id: 'c1', boardId: 'b1', titulo: 'Backlog', ordem: 0 }],
      AgilTarefas: [{ id: 't1', boardId: 'b1', colunaId: 'c1', titulo: 'Tarefa' }],
      AgilIniciativas: [{ id: 'i1', boardId: 'b1', titulo: 'Épico' }],
    });
    const found = workspacesDominio.remover(repo, 'w1');
    expect(found).toBe(true);
    expect(repo.get('AgilBoards')).toHaveLength(0);
    expect(repo.get('AgilColunas')).toHaveLength(0);
    expect(repo.get('AgilTarefas')).toHaveLength(0);
    expect(repo.get('AgilIniciativas')).toHaveLength(0);
  });
});
