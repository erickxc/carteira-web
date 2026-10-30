import { describe, expect, it } from 'vitest';
import { resumoFicha } from './resumoFicha';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

const CADENCIAS = { monitoria_dias: 30, price_dias: 30 } as Cadencias;
const HOJE = new Date(2026, 9, 30, 12);

/** Data como o app grava: meia-noite local, `dias` a partir de HOJE. */
function dia(dias: number): string {
  return new Date(2026, 9, 30 + dias).toISOString();
}

function cliente(over: Partial<Cliente> = {}): Cliente {
  return {
    id: 'c1',
    empresa: 'Loja 1',
    monitor: 'Ana',
    servicos: [],
    observacao: '',
    estado: 'Ativo',
    status: 'Regular',
    createdAt: dia(-365),
    ...over,
  } as Cliente;
}

function evento(id: string, dias: number, status: string, over: Partial<EventoAgenda> = {}): EventoAgenda {
  return { id, clientId: 'c1', clientName: 'Loja 1', date: dia(dias), type: 'Reunião', subject: id, description: '', servicos: [], status, ...over } as EventoAgenda;
}

describe('resumoFicha', () => {
  it('cliente sem nada: prazos vazios, sem última nem próxima', () => {
    const c = cliente();
    expect(resumoFicha(c, [c], [], [], CADENCIAS, HOJE)).toEqual({ prazos: [], ultima: null, proxima: null });
  });

  it('última = concluído mais recente, ignorando cancelado, futuro e outro cliente', () => {
    const c = cliente();
    const agenda = [
      evento('antiga', -40, 'Concluído'),
      evento('recente', -5, 'Realizada'),
      evento('cancelada', -1, 'Cancelado'),
      evento('futura', 3, 'Concluído'),
      evento('outro', -2, 'Concluído', { clientId: 'c2' }),
    ];
    expect(resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE).ultima?.id).toBe('recente');
  });

  it('próxima = a mais perto a partir de hoje; hoje e Pendente contam, cancelado/reagendado não', () => {
    const c = cliente();
    const base = [evento('ontem', -1, 'Agendado'), evento('cancelada', 0, 'Cancelado'), evento('reagendada', 0, 'Reagendado'), evento('concluida', 0, 'Concluído')];
    const pendente = evento('pendente', 2, 'Pendente');
    expect(resumoFicha(c, [c], [...base, evento('longe', 9, 'Agendado'), pendente], [], CADENCIAS, HOJE).proxima?.id).toBe('pendente');
    expect(resumoFicha(c, [c], [...base, pendente, evento('hoje', 0, 'Agendado')], [], CADENCIAS, HOJE).proxima?.id).toBe('hoje');
  });

  it('próxima no mesmo dia: vale a hora mais cedo', () => {
    const c = cliente();
    const agenda = [evento('tarde', 1, 'Agendado', { time: '15:00' }), evento('manha', 1, 'Agendado', { time: '09:00' })];
    expect(resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE).proxima?.id).toBe('manha');
  });

  it('precificação salva na loja-irmã conta como última conversa e no prazo do 2D Price desta loja', () => {
    const c = cliente({ grupo: 'Rede', servicos: ['2D Price'] } as Partial<Cliente>);
    const irma = cliente({ id: 'c2', empresa: 'Loja 2', grupo: 'Rede' } as Partial<Cliente>);
    const preco = evento('preco', -10, 'Concluído', { clientId: 'c2', clientName: 'Loja 2', type: 'Precificação', servicos: ['2D Price'] });
    const r = resumoFicha(c, [c, irma], [preco], [], CADENCIAS, HOJE);
    expect(r.ultima?.doGrupo?.origemId).toBe('preco');
    expect(r.prazos).toEqual([{ servico: '2D Price', independente: false, atraso: -20, proximo: null }]);
  });

  it('ação de Price concluída na loja-irmã conta no prazo, como na fila', () => {
    const c = cliente({ grupo: 'Rede', servicos: ['2D Price'] } as Partial<Cliente>);
    const irma = cliente({ id: 'c2', empresa: 'Loja 2', grupo: 'Rede' } as Partial<Cliente>);
    const acao = { id: 'a1', clientId: 'c2', tipo: 'price', status: 'concluido', dueAt: dia(-10) } as Acao;
    expect(resumoFicha(c, [c, irma], [], [acao], CADENCIAS, HOJE).prazos[0].atraso).toBe(-20);
  });

  it('prazo coberto por reunião marcada mostra os dias reais, não o peso interno da fila', () => {
    const c = cliente({ servicos: ['Plataforma 2D'] });
    const agenda = [evento('feita', -40, 'Concluído', { servicos: ['Plataforma 2D'] }), evento('marcada', 5, 'Agendado', { servicos: ['Plataforma 2D'] })];
    const [prazo] = resumoFicha(c, [c], agenda, [], CADENCIAS, HOJE).prazos;
    expect(prazo.atraso).toBe(10);
    expect(prazo.proximo).not.toBeNull();
  });

  it('serviço independente entra marcado, sem atraso', () => {
    const c = cliente({ servicos: ['Plataforma 2D', '2D Price'], servicosIndependentes: ['2D Price'] });
    const r = resumoFicha(c, [c], [evento('feita', -10, 'Concluído', { servicos: ['Plataforma 2D'] })], [], CADENCIAS, HOJE);
    expect(r.prazos).toEqual([
      { servico: 'Plataforma 2D', independente: false, atraso: -20, proximo: null },
      { servico: '2D Price', independente: true, atraso: null, proximo: null },
    ]);
  });
});
