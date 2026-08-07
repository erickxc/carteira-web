import type { Cliente } from '../types';

/** DDD → UF (tabela ANATEL, fixa — não muda). */
export const DDD_PARA_UF: Record<string, string> = {
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ',
  '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC',
  '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF',
  '62': 'GO', '64': 'GO',
  '63': 'TO',
  '65': 'MT', '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA',
  '79': 'SE',
  '81': 'PE', '87': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE', '88': 'CE',
  '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA',
  '92': 'AM', '97': 'AM',
  '95': 'RR',
  '96': 'AP',
  '98': 'MA', '99': 'MA',
};

/** Extrai o DDD de um telefone cadastrado no padrão "DD 9NNNN-NNNN" (2 dígitos
 * no início, com ou sem espaço/parênteses depois). Retorna null se não achar
 * um DDD reconhecido — não adivinha. */
export function extrairDDD(telefone: string | undefined | null): string | null {
  if (!telefone) return null;
  const m = String(telefone).match(/^\s*\(?(\d{2})\)?/);
  if (!m) return null;
  return DDD_PARA_UF[m[1]] ? m[1] : null;
}

/**
 * Conta CLIENTES distintos por UF (não contatos/telefones) — um cliente com 2
 * contatos no mesmo estado conta 1 vez lá, e se tiver contatos em 2 estados
 * diferentes conta 1 vez em cada. Ignora clientes sem telefone com DDD
 * reconhecível — não força um estado.
 */
export function contarClientesPorUf(clientes: Cliente[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const c of clientes) {
    const ufs = new Set<string>();
    for (const ct of c.contatos ?? []) {
      const ddd = extrairDDD(ct?.telefone);
      if (ddd) ufs.add(DDD_PARA_UF[ddd]);
    }
    ufs.forEach((uf) => { contagem[uf] = (contagem[uf] ?? 0) + 1; });
  }
  return contagem;
}
