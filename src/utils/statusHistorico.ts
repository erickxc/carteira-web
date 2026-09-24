import type { Cliente, StatusHistoricoItem } from '../types';

/**
 * A carteira como estava em `dataRef`: cada cliente com o status/estado/pausa
 * vigentes naquela data (última linha do log com `mudouEm <= dataRef`).
 * - Cliente com linhas, mas todas depois de `dataRef`: ainda não existia → fora.
 * - Cliente sem linha nenhuma (log ainda não o alcançou): fica como está hoje,
 *   melhor que sumir da conta.
 */
export function clientesEm(clientes: Cliente[], historico: StatusHistoricoItem[], dataRef: Date): Cliente[] {
  const limite = dataRef.getTime();
  const porCliente = new Map<string, StatusHistoricoItem[]>();
  for (const h of historico) {
    const lista = porCliente.get(h.clientId);
    if (lista) lista.push(h); else porCliente.set(h.clientId, [h]);
  }

  const resultado: Cliente[] = [];
  for (const c of clientes) {
    const linhas = porCliente.get(c.id);
    if (!linhas) { resultado.push(c); continue; }
    let vigente: StatusHistoricoItem | null = null;
    for (const h of linhas) {
      const t = new Date(h.mudouEm).getTime();
      if (t <= limite && (!vigente || t > new Date(vigente.mudouEm).getTime())) vigente = h;
    }
    if (vigente) resultado.push({ ...c, status: vigente.status, estado: vigente.estado as Cliente['estado'], pausadoAte: vigente.pausadoAte || undefined });
  }
  return resultado;
}
