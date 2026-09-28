import { describe, expect, it } from 'vitest';
import { forcaPorIdade, montarGruposPrazo } from './gruposPrazo';
import type { LinhaAtendimento } from './indicadoresPrazo';

const HOJE = new Date(2026, 8, 25);
const dias = (n: number) => new Date(2026, 8, 25 - n);

describe('gruposPrazo', () => {
  it('força da cor: hoje = 1, some aos 90 dias', () => {
    expect(forcaPorIdade(HOJE, HOJE)).toBe(1);
    expect(forcaPorIdade(dias(45), HOJE)).toBeCloseTo(0.5);
    expect(forcaPorIdade(dias(200), HOJE)).toBe(0);
  });

  it('Serviço usa a última entrega do próprio serviço; toda lista termina em "Última entrega"', () => {
    const g = montarGruposPrazo({
      ritmo: { emDia: [], agendaMarcada: [], contatoRecente: [], precisa: [] },
      cobertura: { cobertos: [], semContato: [] },
      servicos: [{ servico: 'Price', descobertos: [{ id: 'a', nome: 'A' }] }],
      filtroServico: 'Todos', janela: 'ago + set', hoje: HOJE,
    });
    const l = { id: 'a', nome: 'A', relogios: { Price: { ultimo: dias(20) } }, ultimaEntrega: { data: dias(2), tipo: 'Reunião' } } as unknown as LinhaAtendimento;
    const price = g.servico[0];
    expect(price.entrega(l)).toEqual(dias(20));
    expect(price.colunas.at(-1)!.titulo).toBe('Última entrega');
    expect(g.ritmo.every((x) => x.colunas.at(-1)!.titulo === 'Última entrega')).toBe(true);
  });
});
