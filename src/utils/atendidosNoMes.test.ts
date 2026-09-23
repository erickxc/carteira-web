import { describe, expect, it } from 'vitest';
import { contarAtendidosNoMes } from './atendidosNoMes';
import type { Cliente, EventoAgenda } from '../types';

const cli = (id: string, grupo?: string) => ({ id, grupo } as Cliente);
const ev = (clientId: string, date: string, type = 'Reunião', status = 'Concluído') => ({ clientId, date, type, status } as EventoAgenda);

const setembro = new Date(2026, 8, 1);
const hoje = new Date(2026, 8, 23, 12);

describe('contarAtendidosNoMes', () => {
  it('conta cliente com reunião, relatório ou precificação no mês', () => {
    const ativos = [cli('a'), cli('b'), cli('c'), cli('d')];
    const agenda = [ev('a', '2026-09-05'), ev('b', '2026-09-10', 'Relatório'), ev('c', '2026-09-12', 'Precificação')];
    expect(contarAtendidosNoMes(ativos, agenda, setembro, hoje)).toBe(3);
  });

  it('contato/ligação, cancelada e reagendada não contam', () => {
    const ativos = [cli('a'), cli('b'), cli('c')];
    const agenda = [ev('a', '2026-09-05', 'Contato'), ev('b', '2026-09-05', 'Reunião', 'Cancelado'), ev('c', '2026-09-05', 'Reunião', 'Reagendado')];
    expect(contarAtendidosNoMes(ativos, agenda, setembro, hoje)).toBe(0);
  });

  it('reunião futura dentro do mês ainda não é atendimento', () => {
    expect(contarAtendidosNoMes([cli('a')], [ev('a', '2026-09-28', 'Reunião', 'Agendado')], setembro, hoje)).toBe(0);
  });

  it('outro mês não conta', () => {
    expect(contarAtendidosNoMes([cli('a')], [ev('a', '2026-08-30')], setembro, hoje)).toBe(0);
  });

  it('grupo conta uma vez, como no total de clientes ativos', () => {
    const ativos = [cli('a', 'Altese'), cli('b', 'Altese'), cli('c')];
    const agenda = [ev('a', '2026-09-05'), ev('b', '2026-09-06')];
    expect(contarAtendidosNoMes(ativos, agenda, setembro, hoje)).toBe(1);
  });

  it('evento de cliente fora dos ativos não conta', () => {
    expect(contarAtendidosNoMes([cli('a')], [ev('x', '2026-09-05')], setembro, hoje)).toBe(0);
  });
});
