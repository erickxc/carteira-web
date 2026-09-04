import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Textarea } from '../../ui';

interface CancelarEventoPopupProps {
  onFechar: () => void;
  /** Só marca o formulário como Cancelado + motivo — quem chamou decide
   *  quando salvar (usuário revisa e aperta Salvar depois). */
  onConfirmar: (motivo: string) => void;
  /** Marca Cancelado + motivo E salva na hora, fechando o Editar Evento. */
  onConfirmarESalvar: (motivo: string) => void;
}

/**
 * Popup dedicado pro cancelamento — antes o botão "Cancelar evento" só
 * empurrava o formulário pra modo cancelamento (campo Motivo aparecia lá
 * dentro, escondido no meio do form, sem deixar claro que era uma ação em
 * andamento) e mostrava um toast pedindo pra preencher e clicar em Salvar.
 * Reportado como confuso pelo usuário. Este popup concentra a decisão: ou
 * volta atrás, ou confirma só a marcação (revisa o resto do form antes de
 * salvar), ou confirma e salva na hora.
 */
export function CancelarEventoPopup({ onFechar, onConfirmar, onConfirmarESalvar }: CancelarEventoPopupProps) {
  const [motivo, setMotivo] = useState('');
  const valido = motivo.trim().length > 0;

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={onFechar}>
      <div className="modal" style={{ width: 'min(440px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-body" style={{ paddingTop: '1.5rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>
            Cancelar este evento? Ele fica no histórico marcado como Cancelado (não é apagado).
          </p>
          <Field label="Motivo do cancelamento *">
            <Textarea
              tone="modal"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Por que a reunião foi cancelada?"
              autoFocus
            />
          </Field>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
          <Button variant="secondary" disabled={!valido} onClick={() => onConfirmar(motivo.trim())}>
            Confirmar
          </Button>
          <Button variant="danger" disabled={!valido} onClick={() => onConfirmarESalvar(motivo.trim())}>
            Confirmar e Salvar
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
