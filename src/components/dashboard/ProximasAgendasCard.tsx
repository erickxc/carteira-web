import { format, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { eventoStatusBadge } from '../../utils/badges';
import { corTipo, corTipoBg } from '../../utils/tipoCor';
import { Badge, Card, Chip } from '../../ui';
import type { EventoAgenda } from '../../types';

interface ProximasAgendasCardProps {
  tiposDisponiveis: string[];
  filtroTipo: string;
  onFiltroTipo: (t: string) => void;
  proximos: EventoAgenda[];
  /** Relatórios dos próximos 7 dias — resumidos numa linha, fora da lista. */
  relatoriosSemana: EventoAgenda[];
  onVerAgenda: () => void;
  onSelecionarEvento: (ev: EventoAgenda) => void;
}

/** "Próximas agendas" — as 5 próximas (menos relatório), filtráveis por tipo. Relatórios
 * da semana viram uma linha de resumo: são envio programado, não compromisso com o cliente. */
export function ProximasAgendasCard({ tiposDisponiveis, filtroTipo, onFiltroTipo, proximos, relatoriosSemana, onVerAgenda, onSelecionarEvento }: ProximasAgendasCardProps) {
  const clientesRelatorio = [...new Set(relatoriosSemana.map((r) => r.clientName))];
  return (
    <Card>
      <div className="section-header">
        <h3>Próximas agendas</h3>
        <span className="flex items-center gap-3">
          <span className="text-text-muted" style={{ fontSize: 12 }}>a partir de hoje</span>
          <button className="link-button" style={{ fontSize: 12 }} onClick={onVerAgenda}>ver agenda →</button>
        </span>
      </div>
      <div className="flex flex-wrap gap-[0.4rem] mb-4">
        {tiposDisponiveis.map((t) => {
          const ativo = filtroTipo === t;
          const cor = t === 'Todos' ? undefined : corTipo(t);
          return (
            <Chip
              key={t}
              active={ativo}
              style={ativo && cor ? { background: cor, borderColor: cor, color: '#0b0b0d' } : undefined}
              onClick={() => onFiltroTipo(t)}
            >
              {t}
            </Chip>
          );
        })}
      </div>
      {relatoriosSemana.length > 0 && (
        <p className="kpi-como-conta" style={{ margin: '0 0 0.75rem' }}>
          <strong>{relatoriosSemana.length} {relatoriosSemana.length === 1 ? 'relatório' : 'relatórios'}</strong> nos próximos 7 dias: {clientesRelatorio.join(', ')}
        </p>
      )}
      {proximos.length === 0 ? (
        <div className="empty-state">Nenhuma agenda futura{filtroTipo !== 'Todos' ? ` de ${filtroTipo}` : ''}.</div>
      ) : (
        <div className="agenda-preview">
          {proximos.map((ev) => {
            const d = parseISO(ev.date);
            const hoje = isToday(d);
            return (
              <button key={ev.id} className={`agenda-row${hoje ? ' is-today' : ''}`} onClick={() => onSelecionarEvento(ev)}>
                <span className={`date-badge${hoje ? ' is-today' : ''}`}>
                  <span className="date-badge-day">{format(d, 'dd')}</span>
                  <span className="date-badge-mon">{hoje ? 'hoje' : format(d, 'MMM', { locale: ptBR })}</span>
                </span>
                <span className="agenda-row-main">
                  <span className="agenda-row-title">{ev.subject || ev.clientName}</span>
                  <span className="agenda-row-sub">{ev.clientName}</span>
                </span>
                <span className="agenda-row-tags">
                  <Badge variant="plain" style={{ color: corTipo(ev.type), background: corTipoBg(ev.type) }}>{ev.type}</Badge>
                  <Badge variant={eventoStatusBadge(ev.status)}>{ev.status}</Badge>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
