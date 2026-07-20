import { differenceInCalendarDays, format, isToday, isTomorrow, parseISO } from 'date-fns';
import type { Lembrete } from '../../types';

function rotuloRelativo(iso: string): { texto: string; atrasado: boolean } {
  const d = parseISO(iso);
  const now = new Date();
  const dias = differenceInCalendarDays(d, now);
  if (dias < 0) return { texto: `atrasado · ${format(d, 'dd/MM')}`, atrasado: true };
  if (isToday(d)) return { texto: `hoje · ${format(d, 'HH:mm')}`, atrasado: false };
  if (isTomorrow(d)) return { texto: `amanhã · ${format(d, 'HH:mm')}`, atrasado: false };
  if (dias <= 7) return { texto: `em ${dias} dias`, atrasado: false };
  return { texto: format(d, 'dd/MM/yyyy'), atrasado: false };
}

interface AlertasProgramadosCardProps {
  alertasProgramados: Lembrete[];
  nomeCliente: (clientId: string) => string | undefined;
}

/** "Alertas Programados" — próximos lembretes ativos a disparar. */
export function AlertasProgramadosCard({ alertasProgramados, nomeCliente }: AlertasProgramadosCardProps) {
  return (
    <div className="glass-card">
      <div className="section-header">
        <h3>Alertas Programados</h3>
        <span className="text-muted" style={{ fontSize: 12 }}>próximos disparos</span>
      </div>
      {alertasProgramados.length === 0 ? (
        <div className="empty-state">Nenhum alerta programado.</div>
      ) : (
        <div className="agenda-preview">
          {alertasProgramados.map((r) => {
            const nome = r.clientId ? nomeCliente(r.clientId) : undefined;
            const rel = rotuloRelativo(r.datetime);
            const isRelatorio = /relat/i.test(r.type || '');
            return (
              <div key={r.id} className="agenda-row" style={{ cursor: 'default' }}>
                <span className="agenda-row-main">
                  <span className="agenda-row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.type && <span className={`badge ${isRelatorio ? 'badge-warning' : 'badge-accent'}`}>{r.type}</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  </span>
                  <span className="agenda-row-sub">{nome ?? 'geral'}</span>
                </span>
                <span className={`badge ${rel.atrasado ? 'badge-danger' : 'badge-muted'}`} style={{ flexShrink: 0 }}>{rel.texto}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
