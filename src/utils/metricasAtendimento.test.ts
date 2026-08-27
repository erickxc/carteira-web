import { describe, expect, it } from 'vitest';
import {
  calcularCicloAtendimento,
  calcularConfiabilidade,
  calcularEsforcoAgenda,
  formatarDias,
  serieEsforcoPorMes,
} from './metricasAtendimento';
import type { Acao, EventoAgenda } from '../types';

const NOW = new Date('2026-08-17T12:00:00Z');

function iso(diasAtras: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString();
}

let seq = 0;
function evento(overrides: Partial<EventoAgenda> = {}): EventoAgenda {
  seq++;
  return {
    id: `e${seq}`,
    clientId: 'c1',
    clientName: 'Empresa Teste',
    date: iso(10),
    type: 'Reunião',
    subject: 'Reunião',
    description: '',
    servicos: [],
    attachments: [],
    status: 'Concluído',
    monitores: [],
    createdAt: iso(10),
    ...overrides,
  };
}

function acao(overrides: Partial<Acao> = {}): Acao {
  seq++;
  return {
    id: `a${seq}`,
    clientId: 'c1',
    tipo: 'contato',
    segmento: 'engajado',
    status: 'concluido',
    createdAt: iso(5),
    updatedAt: iso(5),
    ...overrides,
  };
}

describe('calcularConfiabilidade', () => {
  it('classifica desfecho por status e ignora reuniões futuras', () => {
    const realizada = evento({ status: 'Concluído', date: iso(5) });
    const cancelada = evento({ status: 'Cancelado', date: iso(3) });
    const reagendada = evento({ status: 'Reagendado', date: iso(2) });
    const futura = evento({ status: 'Agendado', date: iso(-5) });
    const r = calcularConfiabilidade([realizada, cancelada, reagendada, futura], NOW);
    expect(r).toMatchObject({ realizadas: 1, canceladas: 1, reagendadas: 1, total: 3 });
    expect(r.taxaRealizacao).toBeCloseTo(100 / 3, 5);
  });

  it('ignora eventos que não são Reunião (ex.: Contato)', () => {
    const contato = evento({ type: 'Contato', date: iso(5) });
    const r = calcularConfiabilidade([contato], NOW);
    expect(r.total).toBe(0);
  });

  it('taxaRealizacao é 0 quando não há histórico (evita divisão por zero)', () => {
    const r = calcularConfiabilidade([], NOW);
    expect(r.taxaRealizacao).toBe(0);
    expect(r.taxaRemarcacao).toBe(0);
  });

  it('contabiliza remarcações independente do desfecho', () => {
    const remarcadaMasRealizada = evento({ status: 'Concluído', date: iso(1), reagendamentos: 2 });
    const r = calcularConfiabilidade([remarcadaMasRealizada], NOW);
    expect(r.realizadas).toBe(1);
    expect(r.reunioesRemarcadas).toBe(1);
    expect(r.remarcacoes).toBe(2);
  });
});

describe('calcularEsforcoAgenda', () => {
  it('acoesPorEntrega = total de ações / (reunião + relatório), nunca menor que 1', () => {
    const reuniao = evento({ type: 'Reunião', date: iso(5) });
    const contato1 = evento({ type: 'Contato', date: iso(8) });
    const contato2 = evento({ type: 'Contato', date: iso(6) });
    const r = calcularEsforcoAgenda([reuniao, contato1, contato2], [], NOW);
    expect(r.acoesEntrega).toBe(1);
    expect(r.totalAcoes).toBe(3);
    expect(r.acoesPorEntrega).toBe(3);
  });

  it('acoesPorEntrega é null quando não há entrega no período', () => {
    const contato = evento({ type: 'Contato', date: iso(5) });
    const r = calcularEsforcoAgenda([contato], [], NOW);
    expect(r.acoesEntrega).toBe(0);
    expect(r.acoesPorEntrega).toBeNull();
  });

  it('ignora eventos cancelados/reagendados/futuros e ações dispensadas/futuras', () => {
    const cancelado = evento({ type: 'Reunião', status: 'Cancelado', date: iso(5) });
    const futuro = evento({ type: 'Reunião', date: iso(-5) });
    const acaoDispensada = acao({ tipo: 'reuniao', status: 'dispensado' });
    const acaoFutura = acao({ tipo: 'reuniao', dueAt: iso(-5) });
    const r = calcularEsforcoAgenda([cancelado, futuro], [acaoDispensada, acaoFutura], NOW);
    expect(r.totalAcoes).toBe(0);
  });

  it('conta contato com origem "cliente" separadamente, sem duplicar no total', () => {
    const contatoCliente = evento({ type: 'Contato', origem: 'cliente', date: iso(3) });
    const reuniao = evento({ type: 'Reunião', date: iso(1) });
    const r = calcularEsforcoAgenda([contatoCliente, reuniao], [], NOW);
    expect(r.contatosDoCliente).toBe(1);
    expect(r.porTipo.contato).toBe(1);
    expect(r.totalAcoes).toBe(2);
  });

  it('soma ações da tabela Acoes por tipo, junto com os eventos da agenda', () => {
    const reuniaoEvento = evento({ type: 'Reunião', date: iso(5) });
    const acaoReuniao = acao({ tipo: 'reuniao' });
    const acaoPrice = acao({ tipo: 'price' });
    const r = calcularEsforcoAgenda([reuniaoEvento], [acaoReuniao, acaoPrice], NOW);
    expect(r.porTipo.reuniao).toBe(2);
    expect(r.porTipo.price).toBe(1);
    expect(r.acoesEntrega).toBe(2);
  });

  it('conta evento tipo Precificação no mesmo balde de Price', () => {
    // Precificação avulsa entregue fora de reunião — mesmo balde `price` da
    // Ação tipo 'price', não "outros".
    const precificacao = evento({ type: 'Precificação', date: iso(3) });
    const r = calcularEsforcoAgenda([precificacao], [], NOW);
    expect(r.porTipo.price).toBe(1);
    expect(r.porTipo.outros).toBe(0);
  });
});

describe('serieEsforcoPorMes', () => {
  it('omite meses sem entrega em vez de gerar ponto zero', () => {
    const soContato = evento({ type: 'Contato', date: iso(40) });
    const serie = serieEsforcoPorMes([soContato], [], NOW);
    expect(serie).toHaveLength(0);
  });

  it('gera um ponto por mês com entrega, calculado isoladamente por mês', () => {
    const mesPassado = new Date(NOW);
    mesPassado.setMonth(mesPassado.getMonth() - 1);
    const reuniaoMesPassado = evento({ type: 'Reunião', date: mesPassado.toISOString() });
    const reuniaoMesAtual = evento({ type: 'Reunião', date: iso(2) });
    const serie = serieEsforcoPorMes([reuniaoMesPassado, reuniaoMesAtual], [], NOW);
    expect(serie.length).toBeGreaterThanOrEqual(2);
    expect(serie.every((p) => p.acoesEntrega > 0)).toBe(true);
  });

  it('retorna vazio quando não há nenhum evento/ação no passado', () => {
    expect(serieEsforcoPorMes([], [], NOW)).toEqual([]);
  });
});

describe('calcularCicloAtendimento', () => {
  it('mede o intervalo entre reuniões consecutivas do mesmo cliente', () => {
    const r1 = evento({ clientId: 'c1', type: 'Reunião', date: iso(40) });
    const r2 = evento({ clientId: 'c1', type: 'Reunião', date: iso(10) });
    const r = calcularCicloAtendimento([r1, r2], NOW);
    expect(r.intervaloEntreReunioes).toBe(30);
    expect(r.amostraIntervalos).toBe(1);
  });

  it('não pareia reuniões de clientes diferentes', () => {
    const rA = evento({ clientId: 'A', type: 'Reunião', date: iso(40) });
    const rB = evento({ clientId: 'B', type: 'Reunião', date: iso(10) });
    const r = calcularCicloAtendimento([rA, rB], NOW);
    expect(r.intervaloEntreReunioes).toBeNull();
    expect(r.amostraIntervalos).toBe(0);
  });

  it('mede dias até retomar contato (só contato NOSSO, não do cliente)', () => {
    const reuniao = evento({ clientId: 'c1', type: 'Reunião', date: iso(20) });
    const contatoCliente = evento({ clientId: 'c1', type: 'Contato', origem: 'cliente', date: iso(15) });
    const contatoNosso = evento({ clientId: 'c1', type: 'Contato', date: iso(12) });
    const r = calcularCicloAtendimento([reuniao, contatoCliente, contatoNosso], NOW);
    expect(r.diasParaRetomarContato).toBe(8); // 20 - 12
  });

  it('sem nenhuma amostra, todos os campos ficam null com contagem 0', () => {
    const r = calcularCicloAtendimento([], NOW);
    expect(r).toEqual({
      intervaloEntreReunioes: null,
      diasParaRetomarContato: null,
      diasDoContatoAteProximaReuniao: null,
      amostraIntervalos: 0,
      amostraRetomadas: 0,
    });
  });
});

describe('formatarDias', () => {
  it('null vira travessão', () => {
    expect(formatarDias(null)).toBe('—');
  });

  it('singular para 1 dia', () => {
    expect(formatarDias(1)).toBe('1 dia');
  });

  it('plural e arredonda', () => {
    expect(formatarDias(2.6)).toBe('3 dias');
  });
});
