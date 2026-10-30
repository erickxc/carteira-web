import type { AlertaIA } from '../api/client';
import type { Equipe } from '../equipe/sessao';

/** Filtro de monitor (cada um vê os seus) + certificado, que é assunto do Fiscal. */
export function alertasVisiveis<T extends Pick<AlertaIA, 'tipo' | 'monitor'>>(alertas: T[], filtroMonitor: string, sessao: Equipe | null): T[] {
  const verCertificado = sessao === 'fiscal' || sessao === 'admin';
  return alertas
    .filter((a) => filtroMonitor === 'Todos' || a.monitor === filtroMonitor)
    .filter((a) => a.tipo !== 'certificado' || verCertificado);
}
