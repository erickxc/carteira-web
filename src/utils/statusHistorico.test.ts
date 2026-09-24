import { describe, expect, it } from 'vitest';
import { clientesEm } from './statusHistorico';
import { isClienteAtivo } from './formatters';
import type { Cliente, StatusHistoricoItem } from '../types';

const c = (id: string, extra: Partial<Cliente> = {}) =>
  ({ id, empresa: id, status: 'Suspenso', estado: 'Inativo', ...extra }) as Cliente;
const h = (clientId: string, status: string, estado: string, mudouEm: string): StatusHistoricoItem =>
  ({ id: `${clientId}${mudouEm}`, clientId, status, estado, pausadoAte: '', mudouEm });

const fimDeJulho = new Date(2026, 6, 31, 23, 59, 59, 999);

describe('clientesEm', () => {
  it('usa a situação vigente na data, não a de hoje', () => {
    const historico = [
      h('a', 'Regular', 'Ativo', '2026-05-01T00:00:00.000Z'),
      h('a', 'Suspenso', 'Ativo', '2026-09-10T12:00:00.000Z'),
    ];
    const [a] = clientesEm([c('a')], historico, fimDeJulho);
    expect(a.status).toBe('Regular');
    expect(isClienteAtivo(a, fimDeJulho)).toBe(true);
  });

  it('cliente criado depois da data não existia ainda', () => {
    const historico = [h('novo', 'Regular', 'Ativo', '2026-08-15T00:00:00.000Z')];
    expect(clientesEm([c('novo')], historico, fimDeJulho)).toHaveLength(0);
  });

  it('cliente sem linha no log fica como está hoje', () => {
    const [x] = clientesEm([c('x', { status: 'Regular', estado: 'Ativo' })], [], fimDeJulho);
    expect(x.status).toBe('Regular');
  });
});
