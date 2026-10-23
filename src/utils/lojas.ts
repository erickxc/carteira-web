import { formatarCNPJ } from './cnpj';
import type { LojaCadastro } from '../types';

/** Loja em edição no cadastro: o CNPJ fica como o usuário digita (com ou sem
 *  máscara) e só vira dígitos ao salvar (`lojasParaSalvar`). */
export type LojaEmEdicao = LojaCadastro;

export const lojasParaEdicao = (lojas?: LojaCadastro[]): LojaEmEdicao[] =>
  (lojas ?? []).map((l) => ({ ...l, cnpj: l.cnpj ? formatarCNPJ(l.cnpj) : '' }));

export const lojasParaSalvar = (lojas: LojaEmEdicao[]): LojaCadastro[] =>
  lojas
    .map((l) => ({ nome: l.nome.trim(), cnpj: l.cnpj.replace(/\D/g, ''), endereco: l.endereco.trim() }))
    .filter((l) => l.nome || l.cnpj);

export const cnpjIncompleto = (cnpj: string) => {
  const d = cnpj.replace(/\D/g, '');
  return d.length > 0 && d.length !== 14;
};
