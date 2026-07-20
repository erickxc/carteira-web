import { format, parseISO } from 'date-fns';
import type { EventoAgenda } from '../types';

/** Gera a ata da reunião automaticamente a partir de pré-análise + checklist. */
export function gerarAta(ev: Partial<EventoAgenda>): string {
  const linhas: string[] = [];
  const data = ev.date ? format(parseISO(ev.date), 'dd/MM/yyyy') : '';
  linhas.push(`Ata — ${ev.clientName ?? ''}${data ? ` — ${data}` : ''}${ev.time ? ` ${ev.time}` : ''}`.trim());
  if (ev.type) linhas.push(`Tipo: ${ev.type}`);

  const pa = ev.preAnalise;
  if (pa) {
    const ori = (pa.orientacoes ?? []).filter((o) => o.cliente || o.produto || o.orientacao);
    if (ori.length) {
      linhas.push('', 'Orientações:');
      ori.forEach((o) => linhas.push(`- ${[o.cliente, o.produto].filter(Boolean).join(' / ')}${o.orientacao ? `: ${o.orientacao}` : ''}`));
    }
    if (pa.clientesGeral?.trim()) linhas.push('', `Clientes em geral: ${pa.clientesGeral.trim()}`);
    if (pa.produtosGeral?.trim()) linhas.push('', `Produtos em geral: ${pa.produtosGeral.trim()}`);
  }

  const cl = ev.checklist ?? [];
  if (cl.length) {
    linhas.push('', 'Checklist:');
    cl.forEach((i) => linhas.push(`${i.done ? '[x]' : '[ ]'} ${i.text}`));
  }
  if (ev.description?.trim()) linhas.push('', ev.description.trim());
  return linhas.join('\n');
}
