import { describe, expect, it } from 'vitest';
import { ordenarPorProximidade, type Item } from './acoesHelpers';

const AGORA = new Date('2026-08-19T12:00:00Z');

function item(overrides: Partial<Item> & { key: string; date: Date }): Item {
  return {
    refId: overrides.key,
    clientId: 'c1',
    tipoLabel: 'Relatório',
    statusLabel: 'Agendado',
    statusBadge: 'muted',
    obs: '',
    origem: 'reuniao',
    ...overrides,
  };
}

function dia(offsetDias: number): Date {
  const d = new Date(AGORA);
  d.setDate(d.getDate() + offsetDias);
  return d;
}

describe('ordenarPorProximidade', () => {
  it('põe o que está perto de hoje antes do agendamento distante', () => {
    // Cenário do bug: três relatórios agendados para novembro (~+76 a +90 dias)
    // ocupavam as 3 vagas do card, escondendo o que acabou de acontecer.
    const itens = [
      item({ key: 'nov-3', date: dia(90) }),
      item({ key: 'nov-2', date: dia(83) }),
      item({ key: 'nov-1', date: dia(76) }),
      item({ key: 'hoje', date: dia(0) }),
      item({ key: 'semana-passada', date: dia(-7) }),
    ];
    const ordenado = ordenarPorProximidade(itens, AGORA).map((i) => i.key);
    expect(ordenado.slice(0, 3)).toEqual(['hoje', 'semana-passada', 'nov-1']);
  });

  it('no mesmo afastamento, o que já aconteceu vem primeiro', () => {
    const itens = [
      item({ key: 'futuro', date: dia(5) }),
      item({ key: 'passado', date: dia(-5) }),
    ];
    expect(ordenarPorProximidade(itens, AGORA).map((i) => i.key)).toEqual(['passado', 'futuro']);
  });

  it('só com itens futuros, o mais próximo vem primeiro', () => {
    const itens = [
      item({ key: 'longe', date: dia(60) }),
      item({ key: 'perto', date: dia(3) }),
      item({ key: 'medio', date: dia(20) }),
    ];
    expect(ordenarPorProximidade(itens, AGORA).map((i) => i.key)).toEqual(['perto', 'medio', 'longe']);
  });

  it('só com itens passados, o mais recente vem primeiro', () => {
    const itens = [
      item({ key: 'antigo', date: dia(-90) }),
      item({ key: 'recente', date: dia(-2) }),
      item({ key: 'medio', date: dia(-30) }),
    ];
    expect(ordenarPorProximidade(itens, AGORA).map((i) => i.key)).toEqual(['recente', 'medio', 'antigo']);
  });

  it('não muta o array recebido', () => {
    const itens = [item({ key: 'b', date: dia(30) }), item({ key: 'a', date: dia(0) })];
    const copia = [...itens];
    ordenarPorProximidade(itens, AGORA);
    expect(itens).toEqual(copia);
  });
});
