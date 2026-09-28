import { describe, expect, it } from 'vitest';
import { cancelamentosPorAtendimento, cargaPorMonitor, esforcoPorAtendimento, finsDeMes, reunioesPorDia } from './analises';
import type { Acao, Cliente, EventoAgenda } from '../types';
import type { LinhaAtendimento } from './indicadoresPrazo';
import type { RelogioServico } from './cadenciaServico';

const AGORA = new Date(2026, 8, 25, 12);
const dia = (d: number, m = 8) => new Date(2026, m, d, 10).toISOString();
const cli = (id: string) => ({ id, empresa: id.toUpperCase() }) as Cliente;
const ev = (clientId: string, type: string, status: string, date: string, extra: Partial<EventoAgenda> = {}) =>
  ({ id: `${clientId}${type}${date}`, clientId, type, status, date, subject: 'x', ...extra }) as EventoAgenda;

describe('analises', () => {
  it('esforço: conta concluídos de agenda + ações, sem relatório', () => {
    const r = esforcoPorAtendimento([cli('a'), cli('b')], [
      ev('a', 'Reunião', 'Concluído', dia(10)),
      ev('a', 'Contato', 'Concluído', dia(11)),
      ev('a', 'Relatório', 'Concluído', dia(12)), // relatório não é esforço de atendimento
      ev('a', 'Reunião', 'Cancelado', dia(13)),
      ev('b', 'Reunião', 'Concluído', dia(1, 2)), // fora dos 90 dias
    ], [{ clientId: 'a', tipo: 'price', status: 'concluido', createdAt: dia(14) } as Acao], AGORA);
    expect(r).toEqual([{ id: 'a', nome: 'A', reuniao: 1, contato: 1, precificacao: 1, total: 3 }]);
    // Relatório com Precificação (ex.: Viannax) é entrega de Price: conta como precificação.
    const preco = esforcoPorAtendimento([cli('a')], [ev('a', 'Relatório', 'Concluído', dia(20), { servicos: ['Precificação'] })], [], AGORA);
    expect(preco[0]).toMatchObject({ precificacao: 1, total: 1 });
  });

  it('cancelamentos: por atendimento, sobre reuniões com desfecho', () => {
    const r = cancelamentosPorAtendimento([cli('a'), cli('b')], [
      ev('a', 'Reunião', 'Cancelado', dia(5)),
      ev('a', 'Reunião', 'Cancelado', dia(20)),
      ev('a', 'Reunião', 'Concluído', dia(22)),
      ev('b', 'Reunião', 'Concluído', dia(22)),
      ev('b', 'Reunião', 'Agendado', dia(24)), // sem desfecho
    ], AGORA);
    expect(r.canceladas).toBe(2);
    expect(r.comDesfecho).toBe(4);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ id: 'a', canceladas: 2, comDesfecho: 3 });
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
