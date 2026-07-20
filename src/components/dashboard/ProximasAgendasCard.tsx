import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { eventoStatusBadge } from '../../utils/badges';
import { corTipo, corTipoBg } from '../../utils/tipoCor';
import type { EventoAgenda } from '../../types';

interface ProximasAgendasCardProps {
  tiposDisponiveis: string[];
  filtroTipo: string;
  onFiltroTipo: (t: string) => void;
  proximos: EventoAgenda[];
  onVerAgenda: () => void;
  onSelecionarEvento: (ev: EventoAgenda) => void;
}

/** "Próximas Agendas" — lista das próximas reuniões, filtrável por tipo. */
export function ProximasAgendasCard({ tiposDisponiveis, filtroTipo, onFiltroTipo, proximos, onVerAgenda, onSelecionarEvento }: ProximasAgendasCardProps) {
  return (
    <div className="glass-card">
      <div className="section-header">
        <h3>Próximas Agendas</h3>
        <button className="link-button" style={{ fontSize: 12 }} onClick={onVerAgenda}>ver agenda →</button>
      </div>
      <div className="chip-row">
        {tiposDisponiveis.map((t) => {
          const ativo = filtroTipo === t;
          const cor = t === 'Todos' ? undefined : corTipo(t);
          return (
            <button
              key={t}
              className={`chip${ativo ? ' is-active' : ''}`}
              style={ativo && cor ? { background: cor, borderColor: cor, color: '#0b0b0d' } : undefined}
              onClick={() => onFiltroTipo(t)}
            >
              {t}
            </button>
          );
        })}
      </div>
      {proximos.length === 0 ? (
        <div className="empty-state">Nenhuma agenda futura{filtroTipo !== 'Todos' ? ` de ${filtroTipo}` : ''}.</div>
      ) : (
        <div className="agenda-preview">
          {proximos.map((ev) => {
            const d = parseISO(ev.date);
            return (
              <button key={ev.id} className="agenda-row" onClick={() => onSelecionarEvento(ev)}>
                <span className="date-badge">
                  <span className="date-badge-day">{format(d, 'dd')}</span>
                  <span className="date-badge-mon">{format(d, 'MMM', { locale: ptBR })}</span>
                </span>
                <span className="agenda-row-main">
                  <span className="agenda-row-title">{ev.subject || ev.clientName}</span>
                  <span className="agenda-row-sub">{ev.clientName}</span>
                </span>
                <span className="agenda-row-tags">
                  <span className="badge" style={{ color: corTipo(ev.type), background: corTipoBg(ev.type) }}>{ev.type}</span>
                  <span className={`badge ${eventoStatusBadge(ev.status)}`}>{ev.status}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
