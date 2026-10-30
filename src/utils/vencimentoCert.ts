import { differenceInCalendarDays, format, isValid, parse } from 'date-fns';

// O fiscal precisa de dois meses para renovar sem correria (spec: dados fiscais das lojas).
const DIAS_PERTO = 60;

/** Certificado digital da loja: o que a tela escreve e o nível que dá a cor ao texto. */
export function vencimentoCert(data: string | null | undefined, hoje: Date = new Date()): { texto: string; nivel: 'vencido' | 'perto' | 'ok' | 'sem' } {
  const dia = data ? parse(data, 'yyyy-MM-dd', hoje) : null;
  // Data que não se entende vira "sem": `format` lançaria e derrubaria a lista inteira.
  if (!dia || !isValid(dia)) return { texto: '—', nivel: 'sem' };
  const texto = format(dia, 'dd/MM/yyyy');
  const dias = differenceInCalendarDays(dia, hoje);
  if (dias < 0) return { texto: `${texto} vencido`, nivel: 'vencido' };
  return { texto, nivel: dias <= DIAS_PERTO ? 'perto' : 'ok' };
}
