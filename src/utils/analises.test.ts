import { describe, expect, it } from 'vitest';
import { cancelamentosPorAtendimento, cargaPorMonitor, dificeisDeMarcar, finsDeMes, reunioesPorDia } from './analises';
import type { Acao, Cliente, EventoAgenda } from '../types';
import type { LinhaAtendimento } from './indicadoresPrazo';
import type { RelogioServico } from './cadenciaServico';

const AGORA = new Date(2026, 8, 25, 12);
const dia = (d: number, m = 8) => new Date(2026, m, d, 10).toISOString();
const cli = (id: string) => ({ id, empresa: id.toUpperCase() }) as Cliente;
const ev = (clientId: string, type: string, status: string, date: string, extra: Partial<EventoAgenda> = {}) =>
  ({ id: `${clientId}${type}${date}`, clientId, type, status, date, subject: 'x', ...extra }) as EventoAgenda;

describe('analises', () => {
  it('difíceis de marcar: tentativas por entrega no mês; ação repetida e contato do cliente não contam', () => {
    const r = dificeisDeMarcar([cli('a'), cli('b'), cli('c')], [
      ev('a', 'Contato', 'Concluído', dia(2), { origem: 'nos' }),
      ev('a', 'Ligação', 'Concluído', dia(9)),
      ev('a', 'Contato', 'Concluído', dia(10), { origem: 'cliente' }), // o cliente procurou: não é tentativa
      ev('a', 'Contato', 'Concluído', dia(11), { motivoContato: 'cancelamento' }), // aviso de cancelamento
      ev('a', 'Contato', 'Agendado', dia(12)), // não concluído
      ev('a', 'Reunião', 'Concluído', dia(20)),
      ev('a', 'Contato', 'Concluído', dia(28, 7)), // mês anterior
      ev('b', 'Contato', 'Concluído', dia(3)),
      ev('b', 'Relatório', 'Concluído', dia(4), { servicos: ['Precificação'] }), // relatório de preço é entrega
      ev('b', 'Precificação', 'Concluído', dia(5)),
      ev('c', 'Reunião', 'Concluído', dia(6)), // sem tentativa: fora da lista
    ], [
      { clientId: 'a', tipo: 'contato', status: 'concluido', dueAt: dia(15) },
      { clientId: 'a', tipo: 'contato', status: 'concluido', dueAt: dia(15) }, // repetida no mesmo dia
      { clientId: 'a', tipo: 'contato', status: 'concluido', dueAt: dia(2) }, // mesmo dia de contato na agenda
      { clientId: 'a', tipo: 'price', status: 'concluido', dueAt: dia(16) }, // não é tentativa
    ] as Acao[], AGORA);
    expect(r).toEqual([
      { id: 'a', nome: 'A', tentativas: 3, entregas: 1 },
      { id: 'b', nome: 'B', tentativas: 1, entregas: 2 },
    ]);
  });

  it('difíceis de marcar: janela de N meses termina no mês de referência', () => {
    const agenda = [
      ev('a', 'Contato', 'Concluído', dia(20)),
      ev('a', 'Contato', 'Concluído', dia(5, 7)), // agosto
      ev('a', 'Contato', 'Concluído', dia(5, 6)), // julho
      ev('a', 'Contato', 'Concluído', dia(30, 5)), // junho: fora do trimestre
    ];
    expect(dificeisDeMarcar([cli('a')], agenda, [], AGORA, 1)[0].tentativas).toBe(1);
    expect(dificeisDeMarcar([cli('a')], agenda, [], AGORA, 3)[0].tentativas).toBe(3);
    expect(dificeisDeMarcar([cli('a')], agenda, [], AGORA, 6)[0].tentativas).toBe(4);
  });

  it('cancelamentos: só o mês de referência, por quem cancelou; errata fora da conta', () => {
    const r = cancelamentosPorAtendimento([cli('a'), cli('b')], [
      ev('a', 'Reunião', 'Cancelado', dia(5), { motivoCategoria: 'cliente_cancelou' }),
      ev('a', 'Reunião', 'Cancelado', dia(20), { motivo: 'Cliente não apareceu' }),
      ev('a', 'Reunião', 'Concluído', dia(22)),
      ev('b', 'Reunião', 'Cancelado', dia(10), { motivoCategoria: 'nos_cancelamos' }),
      ev('b', 'Reunião', 'Cancelado', dia(11), { motivo: 'errata' }),
      ev('b', 'Reunião', 'Cancelado', dia(12)),
      ev('b', 'Reunião', 'Concluído', dia(22)),
      ev('b', 'Reunião', 'Agendado', dia(24)), // sem desfecho
      ev('a', 'Reunião', 'Cancelado', dia(28, 7), { motivoCategoria: 'cliente_cancelou' }), // mês anterior
    ], AGORA);
    expect(r.doCliente).toBe(2);
    expect(r.comDesfecho).toBe(6);
    expect(r.lancamentosErrados).toBe(1);
    expect(r.porCategoria).toEqual({ cliente_cancelou: 1, cliente_ausente: 1, nos_cancelamos: 1, sem_categoria: 1 });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ id: 'a', canceladas: 2 });
    expect(r.itens[0].ultima?.getDate()).toBe(20);
  });

  it('reuniões por dia: cancelada conta à parte, não ocupa agenda; média só dos dias úteis até hoje', () => {
    const r = reunioesPorDia([
      ev('a', 'Reunião', 'Concluído', dia(1)),
      ev('b', 'Reunião', 'Concluído', dia(1)),
      ev('a', 'Reunião', 'Cancelado', dia(2)),
      ev('a', 'Reunião', 'Agendado', dia(29)),
    ], new Date(2026, 8, 1), AGORA);
    expect(r.dias).toHaveLength(30);
    expect(r.pico?.n).toBe(2);
    expect(r.dias.find((d) => d.data.getDate() === 29)?.n).toBe(1);
    expect(r.diasVazios).toBe(r.diasUteis - 1);
    expect(r.dias.find((d) => d.data.getDate() === 2)).toMatchObject({ n: 0, canceladas: 1 });
    expect(r.canceladas).toBe(1);
    // Projeção: 3 reuniões (2 feitas + 1 marcada no dia 29) nos 21 dias úteis do mês.
    expect(r.projecaoPorDiaUtil).toBeCloseTo(3 / r.dias.filter((d) => d.util).length);
    expect(reunioesPorDia([], new Date(2026, 7, 1), AGORA).projecaoPorDiaUtil).toBeNull();
  });

  it('fins de mês: o mês corrente termina hoje', () => {
    const f = finsDeMes(AGORA, 3);
    expect(f.map((d) => d.getMonth())).toEqual([6, 7, 8]);
    expect(f[2]).toEqual(AGORA);
    expect(f[0].getDate()).toBe(31);
  });

  it('carga por monitor: carteira pelo cadastro, produção por quem fez (inclusive cliente inativo)', () => {
    const a = { ...cli('a'), monitor: 'Yann' }, b = { ...cli('b'), monitor: 'Yann' }, c = { ...cli('c'), monitor: 'Erick' };
    const inativo = { ...cli('x'), monitor: 'Erick' };
    const rel = (servico: string, statusReal: string, ultimo: Date | null = null) => ({ servico, statusReal, ultimo }) as unknown as RelogioServico;
    const linha = (id: string, relogios: RelogioServico[], ultimoContato: Date | null = null) =>
      [id, { id, relogios: Object.fromEntries(relogios.map((r) => [r.servico, r])), ultimoContato } as LinhaAtendimento] as const;
    const linhas = new Map([
      // 'a': Monitoria vencida, contato concluído ontem depois da última entrega → aguardando retorno
      linha('a', [rel('Monitoria', 'vencido', new Date(2026, 7, 1))], new Date(2026, 8, 24)),
      linha('b', [rel('Monitoria', 'em_dia'), rel('Price', 'nunca')]),
      linha('c', [rel('Monitoria', 'em_dia')]),
    ]);
    const agenda = [
      ev('a', 'Reunião', 'Concluído', dia(10), { servicos: ['Monitoria', 'Precificação'], monitores: ['Erick'] }), // Erick fez na carteira do Yann
      ev('b', 'Reunião', 'Concluído', dia(11), { servicos: ['Monitoria'], monitores: [] }), // sem monitor → cadastro (Yann)
      ev('x', 'Reunião', 'Concluído', dia(12), { servicos: ['Monitoria'], monitores: ['Erick'] }), // cliente inativo conta
      ev('b', 'Reunião', 'Cancelado', dia(12), { servicos: ['Monitoria'], monitores: ['Yann'] }),
      ev('c', 'Precificação', 'Concluído', dia(13), { servicos: ['Precificação'], monitores: ['Erick'] }),
      ev('a', 'Relatório', 'Concluído', dia(13), { monitores: ['Yann'] }),
      ev('a', 'Reunião', 'Concluído', dia(10, 7), { servicos: ['Monitoria'], monitores: ['Yann'] }), // mês anterior
    ];
    const carga = (modo: 'reunioes' | 'entregas') =>
      cargaPorMonitor([a, b, c] as Cliente[], [a, b, c, inativo] as Cliente[], linhas, agenda, [], new Date(2026, 8, 1), AGORA, 5, modo);
    // Só reuniões: a precificação avulsa não conta; relatório só na coluna própria.
    expect(carga('reunioes')).toEqual([
      { monitor: 'Yann', atendimentos: 2, atrasados: 2, atrasadosMonitoria: 1, atrasadosPrice: 1, aguardandoRetorno: 1, reunioes: 1, monitoria: 1, price: 0, relatorios: 1, canceladas: 1 },
      { monitor: 'Erick', atendimentos: 1, atrasados: 0, atrasadosMonitoria: 0, atrasadosPrice: 0, aguardandoRetorno: 0, reunioes: 2, monitoria: 2, price: 1, relatorios: 0, canceladas: 0 },
    ]);
    // Entregas: precificação e relatório entram no total.
    const e = carga('entregas');
    expect(e.map((x) => [x.monitor, x.reunioes, x.price])).toEqual([['Yann', 2, 0], ['Erick', 3, 2]]);
  });
});
