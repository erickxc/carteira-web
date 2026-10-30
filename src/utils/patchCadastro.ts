import type { Cliente } from '../types';

/**
 * Só as chaves cujo valor mudou entre o cliente aberto e o rascunho. Compara por
 * JSON para valer em lista e objeto. Chave que virou `undefined` entra no patch
 * de propósito: desligar o relatório automático é `relatorioCadencia` presente e
 * vazio (`api.atualizarCliente` testa a presença da chave).
 */
export function patchCadastro(original: Cliente, rascunho: Cliente): Partial<Cliente> {
  const antes = original as unknown as Record<string, unknown>;
  const depois = rascunho as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const chave of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    if (JSON.stringify(antes[chave]) !== JSON.stringify(depois[chave])) patch[chave] = depois[chave];
  }
  return patch as Partial<Cliente>;
}
