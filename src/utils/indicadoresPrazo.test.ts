import { describe, expect, it } from 'vitest';
import { calcularIndicadoresPrazo, recortarAte } from './indicadoresPrazo';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

const NOW = new Date('2026-09-25T18:00:00.000Z');
const diasAtras = (n: number) => new Date(NOW.getTime() - n * 864e5).toISOString();
const CAD = { monitoria_dias: 30, price_dias: 15, recontato_dias: 5 } as Cadencias;

const cli = (id: string, servicos: string[], extra: Partial<Cliente> = {}) =>
  ({ id, empresa: id, estado: 'Ativo', status: 'Regular', servicos, servicosIndependentes: [], createdAt: '2026-01-01T00:00:00.000Z', ...extra }) as Cliente;
const ev = (clientId: string, type: string, status: string, dias: number, servicos: string[]) =>
  ({ id: `${clientId}-${type}-${dias}`, clientId, clientName: clientId, type, status, date: diasAtras(dias), servicos }) as EventoAgenda;

const nomes = (xs: { nome: string }[]) => xs.map((x) => x.nome);

function calcular(ativos: Cliente[], agenda: EventoAgenda[], acoes: Acao[] = []) {
  return calcularIndicadoresPrazo({ ativos, agenda, acoes, cadencias: CAD, now: NOW, periodo: new Date(2026, 8, 1) });
}

describe('calcularIndicadoresPrazo', () => {
  const ativos = [cli('emdia', ['Monitoria']), cli('meio', ['Monitoria', 'Precificação']), cli('nunca', ['Monitoria'])];
  const agenda = [
    ev('emdia', 'Reunião', 'Concluído', 3, ['Monitoria']),
    ev('meio', 'Reunião', 'Concluído', 3, ['Monitoria']), // Price nunca
    ev('nunca', 'Reunião', 'Agendado', 3, ['Monitoria']), // passado em aberto: não conta
  ];

  it('Ritmo: em dia só com todos os serviços no prazo', () => {
    const r = calcular(ativos, agenda);
    expect(r.ritmo.total).toBe(3);
    expect(nomes(r.ritmo.emDia)).toEqual(['emdia']);
    expect(r.totalEmDia).toBe(1);
  });

  it('Ritmo: em dia com entrega já marcada vai também para emDiaMarcada', () => {
    const r = calcular(ativos, [...agenda, ev('emdia', 'Reunião', 'Agendado', -4, ['Monitoria'])]);
    expect(nomes(r.ritmo.emDia)).toEqual(['emdia']);
    expect(nomes(r.ritmo.emDiaMarcada)).toEqual(['emdia']);
    expect(nomes(calcular(ativos, agenda).ritmo.emDiaMarcada)).toEqual([]);
  });

  it('Cobertura por Serviço: base só com relógio do serviço', () => {
    const r = calcular(ativos, agenda);
    const m = r.porServico.find((s) => s.servico === 'Monitoria')!;
    expect([nomes(m.cobertos), nomes(m.descobertos)]).toEqual([['emdia', 'meio'], ['nunca']]);
    const p = r.porServico.find((s) => s.servico === 'Price')!;
    expect([nomes(p.cobertos), nomes(p.descobertos)]).toEqual([[], ['meio']]);
  });

  it('Cobertura: só entrega concluída conta', () => {
    const r = calcular(ativos, agenda);
    expect(nomes(r.cobertura.cobertos)).toEqual(['emdia', 'meio']);
    expect(nomes(r.cobertura.semContato)).toEqual(['nunca']);
  });

  it('Linhas: prazos por serviço e última entrega de cada atendimento', () => {
    const r = calcular(ativos, agenda);
    const meio = r.linhas.get('meio')!;
    expect(meio.relogios.Monitoria?.statusReal).toBe('em_dia');
    expect(meio.relogios.Price?.statusReal).toBe('nunca');
    expect(meio.ultimaEntrega?.tipo).toBe('Reunião');
    expect(r.linhas.get('nunca')!.ultimaEntrega).toBeNull();
  });

  it('Sem acompanhamento: lista completa, mais antigo primeiro, sem contar "Agendado"', () => {
    const r = calcular(
      [cli('a', ['Monitoria']), cli('b', ['Monitoria']), cli('c', ['Monitoria'])],
      [ev('a', 'Contato', 'Concluído', 40, ['Monitoria']), ev('b', 'Contato', 'Concluído', 2, ['Monitoria']), ev('c', 'Reunião', 'Agendado', 2, ['Monitoria'])],
    );
    expect(r.semAcompanhamento.map((x) => x.cliente.id)).toEqual(['c', 'a']);
  });
});

describe('recortarAte', () => {
  it('tira o que foi criado depois da data', () => {
    const itens = [{ createdAt: '2026-08-01T00:00:00.000Z' }, { createdAt: '2026-09-20T00:00:00.000Z' }, {}];
    expect(recortarAte(itens, new Date('2026-08-25T00:00:00.000Z'))).toHaveLength(2);
  });
});
