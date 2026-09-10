import { describe, expect, it } from 'vitest';
import { detectarNovidades, snapshotVazio } from './notificacoesNativas';
import type { AnaliseIA, Cliente, EventoAgenda } from '../types';

function cliente(id: string, empresa = 'Cliente ' + id): Cliente {
  return { id, empresa, monitor: '', servicos: [], observacao: '', status: 'Regular', createdAt: '2026-01-01' };
}

function evento(id: string, type: string): EventoAgenda {
  return {
    id, clientId: 'c1', clientName: 'Cliente 1', date: '2026-01-01', type, subject: 'Assunto', description: '',
    servicos: [], attachments: [], status: 'Pendente', monitores: [], createdAt: '2026-01-01',
  };
}

function analise(clientId: string, geradoEm: string): AnaliseIA {
  return { id: `a-${clientId}`, clientId, nivelRisco: 'baixo', resumo: 'resumo', fatores: [], sugestaoProximaPauta: '', geradoEm };
}

describe('detectarNovidades', () => {
  it('contra um snapshot vazio, tudo conta como novidade — quem chama descarta essa primeira leitura como baseline', () => {
    const snap = snapshotVazio();
    const novidades = detectarNovidades(snap, { clientes: [cliente('c1')], agenda: [], analisesIA: [] });
    expect(novidades).toEqual([{ categoria: 'cliente_novo', titulo: 'Cliente novo cadastrado', mensagem: 'Cliente c1' }]);
  });

  it('depois da baseline registrada, repetir os mesmos dados não notifica de novo', () => {
    const snap = snapshotVazio();
    detectarNovidades(snap, { clientes: [cliente('c1')], agenda: [evento('e1', 'Reunião')], analisesIA: [analise('c1', '2026-01-01T00:00:00Z')] });
    const novidades = detectarNovidades(snap, { clientes: [cliente('c1')], agenda: [evento('e1', 'Reunião')], analisesIA: [analise('c1', '2026-01-01T00:00:00Z')] });
    expect(novidades).toEqual([]);
  });

  it('detecta cliente novo depois da baseline', () => {
    const snap = snapshotVazio();
    detectarNovidades(snap, { clientes: [cliente('c1')], agenda: [], analisesIA: [] });
    const novidades = detectarNovidades(snap, { clientes: [cliente('c1'), cliente('c2')], agenda: [], analisesIA: [] });
    expect(novidades).toEqual([{ categoria: 'cliente_novo', titulo: 'Cliente novo cadastrado', mensagem: 'Cliente c2' }]);
  });

  it('separa evento novo de relatório novo pelo type', () => {
    const snap = snapshotVazio();
    detectarNovidades(snap, { clientes: [], agenda: [], analisesIA: [] });
    const novidades = detectarNovidades(snap, {
      clientes: [],
      agenda: [evento('e1', 'Reunião'), evento('e2', 'Relatório')],
      analisesIA: [],
    });
    expect(novidades).toEqual([
      { categoria: 'evento_novo', titulo: 'Novo evento na agenda', mensagem: 'Assunto — Cliente 1' },
      { categoria: 'relatorios', titulo: 'Relatório gerado', mensagem: 'Cliente 1' },
    ]);
  });

  it('detecta análise de IA atualizada quando geradoEm muda pro mesmo cliente', () => {
    const snap = snapshotVazio();
    detectarNovidades(snap, { clientes: [], agenda: [], analisesIA: [analise('c1', '2026-01-01T00:00:00Z')] });
    const novidades = detectarNovidades(snap, { clientes: [], agenda: [], analisesIA: [analise('c1', '2026-02-01T00:00:00Z')] });
    expect(novidades).toEqual([{ categoria: 'analises_ia', titulo: 'Análise de IA atualizada', mensagem: 'resumo' }]);
  });

  it('não repete a mesma novidade em chamadas seguintes sem mudança', () => {
    const snap = snapshotVazio();
    detectarNovidades(snap, { clientes: [cliente('c1')], agenda: [], analisesIA: [] });
    detectarNovidades(snap, { clientes: [cliente('c1'), cliente('c2')], agenda: [], analisesIA: [] });
    const novidades = detectarNovidades(snap, { clientes: [cliente('c1'), cliente('c2')], agenda: [], analisesIA: [] });
    expect(novidades).toEqual([]);
  });
});
