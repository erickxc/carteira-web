import { describe, expect, it } from 'vitest';
import { resolverNomesClientes } from './agendaNomes';
import type { Cliente, EventoAgenda } from '../types';

function cliente(id: string, empresa: string): Cliente {
  return {
    id, empresa, monitor: '', servicos: [], observacao: '',
    estado: 'Ativo', status: 'Regular', createdAt: '2026-01-01T00:00:00.000Z',
  } as Cliente;
}

function evento(overrides: Partial<EventoAgenda> = {}): EventoAgenda {
  return {
    id: 'e1', clientId: 'c1', clientName: 'Nome Antigo', date: '2026-08-20T00:00:00.000Z',
    type: 'Reunião', subject: '', description: '', servicos: [], attachments: [],
    status: 'Agendado', monitores: [], createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolverNomesClientes', () => {
  it('substitui o nome desatualizado pelo nome atual do cliente', () => {
    // Caso real: cliente renomeado de "Altese" para "Altese - Recreio + Barra".
    const clientes = [cliente('c1', 'Altese - Recreio + Barra')];
    const [ev] = resolverNomesClientes([evento({ clientName: 'Altese' })], clientes);
    expect(ev.clientName).toBe('Altese - Recreio + Barra');
  });

  it('mantém o nome gravado quando o evento não tem cliente (Evento Avulso)', () => {
    const [ev] = resolverNomesClientes([evento({ clientId: '', clientName: 'Evento Avulso' })], []);
    expect(ev.clientName).toBe('Evento Avulso');
  });

  it('mantém o nome gravado quando o cliente não existe mais', () => {
    const [ev] = resolverNomesClientes([evento({ clientId: 'removido', clientName: 'Cliente Antigo' })], []);
    expect(ev.clientName).toBe('Cliente Antigo');
  });

  it('devolve o MESMO objeto quando o nome já está correto (não invalida memo)', () => {
    const clientes = [cliente('c1', 'Empresa X')];
    const original = evento({ clientName: 'Empresa X' });
    const [ev] = resolverNomesClientes([original], clientes);
    expect(ev).toBe(original);
  });

  it('não muta o evento original ao corrigir', () => {
    const clientes = [cliente('c1', 'Novo Nome')];
    const original = evento({ clientName: 'Velho Nome' });
    resolverNomesClientes([original], clientes);
    expect(original.clientName).toBe('Velho Nome');
  });

  it('resolve cada evento pelo seu próprio cliente', () => {
    const clientes = [cliente('c1', 'Altese - Recreio + Barra'), cliente('c2', 'Altese - GM, Ford, Fiat, VW')];
    const nomes = resolverNomesClientes(
      [evento({ id: 'a', clientId: 'c1', clientName: 'Altese' }), evento({ id: 'b', clientId: 'c2', clientName: 'Altese' })],
      clientes
    ).map((e) => e.clientName);
    expect(nomes).toEqual(['Altese - Recreio + Barra', 'Altese - GM, Ford, Fiat, VW']);
  });
});
