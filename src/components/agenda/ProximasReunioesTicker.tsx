import { useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, User } from 'lucide-react';
import { corTipo } from '../../utils/tipoCor';
import { Card } from '../../ui';
import type { EventoAgenda } from '../../types';

interface ProximasReunioesTickerProps {
  proximos: EventoAgenda[];
  conflitos: Set<string>;
  onSelecionar: (ev: EventoAgenda) => void;
}

const PX_POR_SEGUNDO_TICKER = 55;

/**
 * Faixa "Próximas reuniões" — extraído de AgendaPage.tsx (mesmo comportamento):
 * ticker sempre anima (rola continuamente, mesmo quando a lista cabe inteira
 * na largura visível — sinaliza que a tela está "viva"). A duração é
 * calculada pela largura real do conteúdo (px), não pela quantidade de itens
 * — velocidade de leitura constante (px/s) mesmo com poucos ou muitos itens.
 */
export function ProximasReunioesTicker({ proximos, conflitos, onSelecionar }: ProximasReunioesTickerProps) {
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerTrackRef = useRef<HTMLDivElement>(null);
  const [duracaoTicker, setDuracaoTicker] = useState(35);

  useEffect(() => {
    function medir() {
      const container = tickerRef.current;
      const track = tickerTrackRef.current;
      if (!container || !track) return;
      // O track sempre contém a lista duplicada (loop sem emenda) — a largura
      // de uma cópia é metade do scrollWidth total.
      const largura = track.scrollWidth / 2;
      setDuracaoTicker(Math.max(18, largura / PX_POR_SEGUNDO_TICKER));
    }
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [proximos]);

  return (
    <div className="section agenda-noprint" style={{ marginTop: '1rem' }}>
      <div className="section-header"><h3>Próximas reuniões</h3><span className="text-text-muted" style={{ fontSize: 12 }}>{proximos.length}</span></div>
      {proximos.length === 0 ? (
        <Card flat><div className="empty-state">Nenhuma reunião futura.</div></Card>
      ) : (
        <div className="agenda-ticker" ref={tickerRef}>
          {/* lista sempre duplicada (loop sem emenda), mas só anima quando não cabe na largura visível */}
          <div
            className="agenda-ticker-track"
            ref={tickerTrackRef}
            style={{ animationDuration: `${duracaoTicker}s` }}
          >
            {[...proximos, ...proximos].map((ev, i) => {
              const d = parseISO(ev.date);
              return (
                <button
                  key={`${ev.id}-${i}`}
                  className="agenda-ticker-item"
                  onClick={() => onSelecionar(ev)}
                  aria-hidden={i >= proximos.length}
                  tabIndex={i >= proximos.length ? -1 : 0}
                >
                  <span className="agenda-ticker-dot" style={{ background: corTipo(ev.type) }} />
                  <span className="agenda-ticker-date">{format(d, 'dd/MM')}</span>
                  <strong className="agenda-ticker-name">{ev.clientName}</strong>
                  <span className="agenda-ticker-meta">
                    {ev.time ? `${ev.time}` : ''}{ev.subject || ev.type ? `${ev.time ? ' · ' : ''}${ev.subject || ev.type}` : ''}
                    {ev.monitores.length > 0 && <span className="chip-monitor"> · <User size={10} /> {ev.monitores.join(', ')}</span>}
                  </span>
                  {conflitos.has(ev.id) && <AlertTriangle size={12} className="text-[color:var(--danger)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
