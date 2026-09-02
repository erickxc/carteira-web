import { format, parseISO } from 'date-fns';
import { Bell as BellIcon, FileDown, Paperclip, PhoneCall, PhoneIncoming } from 'lucide-react';
import { urlAnexo } from '../../api/client';
import { eventoStatusBadge } from '../../utils/badges';
import { gerarAtaPdf } from '../../utils/ataPdf';
import { TIMELINE_FILTROS, type TimelineFiltro, type TimelineItem } from '../../utils/timelineCliente';
import { Badge, Button, Card } from '../../ui';
import { ORIGEM_LABEL, type Cliente, type EventoAgenda } from '../../types';

/** Só reuniões têm ata — os demais tipos (contato/ligação/relatório) não têm
 *  pauta/participantes/decisões pra exportar. */
const ehReuniao = (ev: EventoAgenda) => /reuni/i.test(ev.type || '');

/** Mesma regra usada em src/components/agenda/CardEvento.tsx: concluído/realizado
 * ou cancelado/reagendado são status finais — fora isso, o evento ainda está
 * em aberto ("agendado") e pode ser editado. */
const eventoAgendado = (ev: EventoAgenda) => !/conclu|realiz|cancel|reagend/i.test(ev.status || '');

interface TimelineCardProps {
  cliente: Cliente;
  timeline: TimelineItem[];
  filtro: TimelineFiltro;
  onFiltroChange: (f: TimelineFiltro) => void;
  onEditarEvento: (ev: EventoAgenda) => void;
}

/**
 * Cartão "Linha do tempo" da ficha do cliente — extraído de
 * ClienteDetailPage.tsx, mesmo comportamento (unifica eventos de agenda e
 * lembretes numa lista só, filtrável por tipo), agora com trilho vertical
 * (`.timeline-rail`) para parecer de fato uma linha do tempo, e um botão de
 * ata em PDF por reunião — reusa `gerarAtaPdf` (mesma função do botão dentro
 * do EventFormModal), sem abrir o modal de edição.
 */
export function TimelineCard({ cliente, timeline, filtro, onFiltroChange, onEditarEvento }: TimelineCardProps) {
  return (
    <Card flat>
      <div className="section-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3>Linha do tempo</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{timeline.length}</span>
      </div>
      <div className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TIMELINE_FILTROS.map((f) => (
          <button
            key={f.valor}
            className={`filtro-btn${filtro === f.valor ? ' is-active' : ''}`}
            onClick={() => onFiltroChange(f.valor)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {timeline.length === 0 ? (
        <div className="empty-state">Nada registrado para este cliente com esse filtro.</div>
      ) : (
        <div className="timeline-rail">
          {timeline.map((item) => {
            if (item.kind === 'lembrete') {
              const l = item.lembrete;
              return (
                <div key={`l-${item.id}`} className="timeline-rail-item">
                  <span className="timeline-rail-dot is-lembrete" />
                  <div className="history-item">
                    <div className="flex-between" style={{ marginBottom: 6 }}>
                      <strong style={{ fontSize: 14 }}>{l.title}</strong>
                      <Badge variant="accent">{format(item.quando, 'dd/MM/yyyy')}</Badge>
                    </div>
                    <div className="flex-row" style={{ marginBottom: l.description ? 6 : 0 }}>
                      <Badge variant="muted"><BellIcon size={10} /> Lembrete</Badge>
                      <Badge variant={l.status === 'concluido' ? 'success' : 'warning'}>
                        {l.status === 'concluido' ? 'Concluído' : 'Ativo'}
                      </Badge>
                    </div>
                    {l.description && <p className="text-text-muted" style={{ fontSize: 13, margin: 0 }}>{l.description}</p>}
                  </div>
                </div>
              );
            }

            const evento = item.evento;
            const editavel = eventoAgendado(evento);
            return (
              <div key={evento.id} className="timeline-rail-item">
                <span className="timeline-rail-dot" />
                <div
                  className={`history-item${editavel ? ' history-item-editavel' : ''}`}
                  role={editavel ? 'button' : undefined}
                  tabIndex={editavel ? 0 : undefined}
                  title={editavel ? 'Clique para editar este evento agendado' : undefined}
                  onClick={editavel ? () => onEditarEvento(evento) : undefined}
                  onKeyDown={editavel ? (e) => { if (e.key === 'Enter') onEditarEvento(evento); } : undefined}
                >
                  <div className="flex-between" style={{ marginBottom: 6, gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{evento.subject || evento.type}</strong>
                    <div className="flex-row" style={{ gap: 6, flexShrink: 0 }}>
                      <Badge variant="accent">{format(parseISO(evento.date), 'dd/MM/yyyy')}</Badge>
                      {ehReuniao(evento) && (
                        <Button
                          variant="secondary"
                          size="icon"
                          title="Baixar ata em PDF"
                          onClick={(e) => { e.stopPropagation(); gerarAtaPdf(evento, { cliente }); }}
                        >
                          <FileDown size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex-row" style={{ marginBottom: evento.description ? 6 : 0, flexWrap: 'wrap' }}>
                    <Badge variant="accent">{evento.type}</Badge>
                    <Badge variant={eventoStatusBadge(evento.status)}>{evento.status}</Badge>
                    {/* Só aparece onde faz sentido (Contato/Ligação) e onde foi
                        informado — eventos antigos não têm origem. */}
                    {evento.origem && (
                      <Badge variant={evento.origem === 'cliente' ? 'success' : 'muted'}>
                        {evento.origem === 'cliente' ? <PhoneIncoming size={10} /> : <PhoneCall size={10} />}
                        {ORIGEM_LABEL[evento.origem]}
                      </Badge>
                    )}
                  </div>
                  {evento.description && <p className="text-text-muted" style={{ fontSize: 13, margin: 0 }}>{evento.description}</p>}
                  {evento.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {evento.attachments.map((anexo) => (
                        <a key={anexo.id} className="attachment-chip" href={urlAnexo(anexo.filename)} target="_blank" rel="noreferrer">
                          <Paperclip size={12} /> {anexo.originalName}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
