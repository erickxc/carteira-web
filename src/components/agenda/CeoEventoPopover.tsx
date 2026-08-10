import { createPortal } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin } from 'lucide-react';
import { Button } from '../../ui';
import type { EventoCeo } from '../../types';

interface CeoEventoPopoverProps {
  evento: EventoCeo;
  onClose: () => void;
}

/** Somente leitura: mostra o compromisso do Google Agenda do CEO sem nenhuma
 *  ação de editar/excluir/anexar — a fonte da verdade é o Google, não a
 *  Carteira. Mesmo padrão visual de overlay/modal do projeto (ModalShell),
 *  mas simplificado (sem form/footer) por não ter nada a salvar. */
export function CeoEventoPopover({ evento, onClose }: CeoEventoPopoverProps) {
  const inicio = parseISO(evento.start);
  const fim = evento.end ? parseISO(evento.end) : null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ceo-evento-popover" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="flex items-center gap-2">
            <span aria-hidden>📅</span> Agenda do CEO
          </h2>
        </div>
        <div className="modal-body">
          <strong style={{ fontSize: '1rem', display: 'block', marginBottom: 10 }}>{evento.title}</strong>
          <div className="flex items-center gap-2 text-text-secondary" style={{ marginBottom: 6, fontSize: '0.88rem' }}>
            <Calendar size={15} />
            {evento.allDay
              ? format(inicio, "d 'de' MMMM 'de' yyyy", { locale: ptBR })
              : `${format(inicio, "d 'de' MMMM 'de' yyyy", { locale: ptBR })} · ${format(inicio, 'HH:mm')}${fim ? ` – ${format(fim, 'HH:mm')}` : ''}`}
          </div>
          {evento.location && (
            <div className="flex items-center gap-2 text-text-secondary" style={{ fontSize: '0.88rem' }}>
              <MapPin size={15} /> {evento.location}
            </div>
          )}
          <p className="text-text-muted" style={{ fontSize: '0.76rem', marginTop: 14, marginBottom: 0 }}>
            Compromisso importado do Google Agenda do CEO — somente leitura, não editável pela Carteira.
          </p>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
