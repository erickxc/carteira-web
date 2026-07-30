/** 0=domingo..6=sábado (mesma convenção de date-fns `getDay`). Compartilhado
 * entre o bloco de Recorrência do EventFormModal e a cadência de relatório
 * do ClientFormModal. */
export const DIAS_SEMANA: { v: number; label: string }[] = [
  { v: 1, label: 'Segunda' }, { v: 2, label: 'Terça' }, { v: 3, label: 'Quarta' },
  { v: 4, label: 'Quinta' }, { v: 5, label: 'Sexta' }, { v: 6, label: 'Sábado' }, { v: 0, label: 'Domingo' },
];
