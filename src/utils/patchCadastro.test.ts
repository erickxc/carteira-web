import { describe, expect, it } from 'vitest';
import type { Cliente } from '../types';
import { patchCadastro } from './patchCadastro';

const loja = (nome: string) => ({ nome, cnpj: '11222333000181', endereco: 'Rua A' });
const original = {
  id: 'c1', empresa: 'Pecita', status: 'Regular', estado: 'Ativo',
  lojasCadastro: [loja('A'), loja('B')],
  relatorioCadencia: { numero: 1, unidade: 'mes' },
} as Cliente;

describe('patchCadastro', () => {
  it('nada mudou: patch vazio', () => {
    expect(patchCadastro(original, { ...original })).toEqual({});
  });

  it('mudou status: só o status', () => {
    expect(patchCadastro(original, { ...original, status: 'Suspenso' })).toEqual({ status: 'Suspenso' });
  });

  it('reordenou ou alterou lojas: leva a lista', () => {
    const invertidas = [loja('B'), loja('A')];
    expect(patchCadastro(original, { ...original, lojasCadastro: invertidas })).toEqual({ lojasCadastro: invertidas });
    const alterada = [loja('A'), { ...loja('B'), endereco: 'Rua C' }];
    expect(patchCadastro(original, { ...original, lojasCadastro: alterada })).toEqual({ lojasCadastro: alterada });
  });

  it('array de mesma forma (outra referência) não entra', () => {
    expect(patchCadastro(original, { ...original, lojasCadastro: [loja('A'), loja('B')] })).toEqual({});
  });

  it('desligar o relatório mantém a chave: é ela que o cliente da API traduz para null', () => {
    const patch = patchCadastro(original, { ...original, relatorioCadencia: undefined });
    expect('relatorioCadencia' in patch).toBe(true);
    expect(patch.relatorioCadencia).toBeUndefined();
  });

  it('campo novo no rascunho entra; ausente nos dois, não', () => {
    expect(patchCadastro(original, { ...original, endereco: 'Rua B' })).toEqual({ endereco: 'Rua B' });
    expect('endereco' in patchCadastro(original, { ...original, endereco: undefined })).toBe(false);
  });
});
