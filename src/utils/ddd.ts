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

export interface AbrangenciaDDD {
  /** Lojas (linhas de cliente) por UF — não é contagem de contato/telefone. */
  porUf: Record<string, string[]>;
  /** Lojas cujo grupo inteiro não tem nenhum contato com DDD reconhecível. */
  semContato: string[];
}

/**
 * Agrupa LOJAS (linhas de cliente) por UF a partir do DDD dos telefones de
 * contato. Conta é por loja, não por contato: num grupo segmentado (ex.
 * "Pecita" com 5 lojas), normalmente só 1 loja tem contato cadastrado — as
 * outras 4 são o mesmo grupo/região, então herdam o estado da que tem
 * telefone, em vez de cair em "sem contato" só por não terem o próprio
 * cadastro. Cliente sem grupo forma um grupo de 1 (ele mesmo). Se o grupo não
 * tiver NENHUM contato com DDD reconhecível em nenhuma loja, todas caem em
 * `semContato` — não é forçado um estado sem nenhuma evidência.
 */
export function agruparClientesPorUf(clientes: Cliente[]): AbrangenciaDDD {
  const porUf: Record<string, string[]> = {};
  const semContato: string[] = [];

  const grupos = new Map<string, Cliente[]>();
  for (const c of clientes) {
    const chave = c.grupo?.trim() || c.id;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(c);
  }

  for (const lojas of grupos.values()) {
    const ufs = new Set<string>();
    for (const c of lojas) {
      for (const ct of c.contatos ?? []) {
        const ddd = extrairDDD(ct?.telefone);
        if (ddd) ufs.add(DDD_PARA_UF[ddd]);
      }
    }
    if (ufs.size === 0) { lojas.forEach((c) => semContato.push(c.empresa)); continue; }
    lojas.forEach((c) => ufs.forEach((uf) => { (porUf[uf] ??= []).push(c.empresa); }));
  }

  Object.values(porUf).forEach((lista) => lista.sort((a, b) => a.localeCompare(b, 'pt-BR')));
  semContato.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { porUf, semContato };
}

/** Só a contagem por UF — usado pra colorir o mapa sem precisar da lista de nomes. */
export function contarClientesPorUf(clientes: Cliente[]): Record<string, number> {
  const { porUf } = agruparClientesPorUf(clientes);
  return Object.fromEntries(Object.entries(porUf).map(([uf, lista]) => [uf, lista.length]));
}
