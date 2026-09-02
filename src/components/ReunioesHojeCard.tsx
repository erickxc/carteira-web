import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isToday, parseISO } from 'date-fns';
import { CalendarClock, User } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { isAtendidoMarco } from '../utils/badges';
import { calcularPosicaoPopover } from '../utils/popoverPosicao';

/**
 * Pílula "Reuniões de hoje" na barra superior (ao lado de "Base sincronizada"
 * e do seletor de tema — presente em toda tela, não só no Dashboard). Clique
 * abre a lista do dia inteiro, hora a hora, INCLUINDO clientes atendidos pelo
 * Marco — pedido explícito: esses clientes ficam fora do modelo de cadência
 * (não entram na fila de Ações), mas a reunião em si é real e deve aparecer
 * aqui igual a qualquer outra.
 */
export function ReunioesHojeCard() {
  const { agenda, clientes } = useCarteira();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Mesmo padrão de fechar (clique fora / Esc / reposicionar em resize-scroll)
  // já usado em src/components/Dropdown.tsx — não inventa um mecanismo novo.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    }
    function reposiciona() {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', reposiciona);
    window.addEventListener('scroll', reposiciona, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', reposiciona);
      window.removeEventListener('scroll', reposiciona, true);
    };
  }, [open]);

  const clientePorId = new Map(clientes.map((c) => [c.id, c]));
  const hoje = agenda
    .filter((ev) => /reuni/i.test(ev.type || ''))
    .filter((ev) => { const d = parseISO(ev.date); return !isNaN(d.getTime()) && isToday(d); })
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  /** Mesma classificação de sempre (ver `eventoStatusBadge`/`naoCancelado`):
   * concluída/realizada, cancelada, reagendada, ou agendada (neutro) — cor
   * indica de cara o que já aconteceu/não vai acontecer sem abrir o card. */
  function classeStatus(status: string): string {
    if (/conclu|realiz/i.test(status)) return 'is-concluida';
    if (/cancel/i.test(status)) return 'is-cancelada';
    if (/reagend/i.test(status)) return 'is-reagendada';
    return '';
  }

  function toggle() {
    if (open) { setOpen(false); return; }
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  }

  return (
    <>
      <button ref={triggerRef} className="base-sync" onClick={toggle} title="Reuniões de hoje" aria-expanded={open}>
        <CalendarClock size={17} className="shrink-0 text-accent" />
        <span className="base-sync-txt">
          {hoje.length === 0 ? 'Nenhuma reunião hoje' : `${hoje.length} ${hoje.length > 1 ? 'reuniões' : 'reunião'} hoje`}
        </span>
      </button>
      {open && rect && createPortal(
        <div
          ref={popRef}
          className="filter-pop reunioes-hoje-pop"
          style={{ position: 'fixed', ...calcularPosicaoPopover(rect, { largura: 320, alinhar: 'right' }), width: 320 }}
        >
          {hoje.length === 0 ? (
            <div className="empty-state" style={{ padding: '0.75rem' }}>Nenhuma reunião marcada pra hoje.</div>
          ) : (
            hoje.map((ev) => {
              const cliente = clientePorId.get(ev.clientId);
              const marco = isAtendidoMarco(cliente?.status);
              return (
                <div key={ev.id} className={`reuniao-hoje-item ${classeStatus(ev.status || '')}`}>
                  <span className="reuniao-hoje-hora">{ev.time || '—'}</span>
                  <span className="reuniao-hoje-info">
                    <span className="reuniao-hoje-nome">{ev.clientName}</span>
                    <span className="reuniao-hoje-sub">
                      {ev.subject || ev.type}
                      {ev.monitores.length > 0 && <span className="chip-monitor"> · <User size={10} /> {ev.monitores.join(', ')}</span>}
                    </span>
                  </span>
                  {marco && <span className="reuniao-hoje-marco">Marco</span>}
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}
    </>
  );
}
