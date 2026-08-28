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
