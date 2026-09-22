import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Textarea } from '../../ui';

interface CancelarEventoPopupProps {
  onFechar: () => void;
  /** Só marca o formulário como Cancelado + motivo — quem chamou decide
   *  quando salvar (usuário revisa e aperta Salvar depois). */
  onConfirmar: (motivo: string, registrarContato: boolean) => void;
  /** Marca Cancelado + motivo E salva na hora, fechando o Editar Evento. */
  onConfirmarESalvar: (motivo: string, registrarContato: boolean) => void;
  /** Reunião ainda "Pendente" (nunca confirmada) — nesse caso o motivo é
   *  opcional (não tem o que explicar de uma reunião que nunca foi combinada
   *  de verdade) e aparece a opção de registrar contato, ver `permitirRegistrarContato`. */
  motivoObrigatorio?: boolean;
  /** Mostra o checkbox "cliente foi contatado" — só faz sentido junto de
   *  `motivoObrigatorio={false}` (cancelamento de reunião Pendente). */
  permitirRegistrarContato?: boolean;
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
export function CancelarEventoPopup({
  onFechar, onConfirmar, onConfirmarESalvar, motivoObrigatorio = true, permitirRegistrarContato = false,
}: CancelarEventoPopupProps) {
  const [motivo, setMotivo] = useState('');
  const [registrarContato, setRegistrarContato] = useState(false);
  const valido = !motivoObrigatorio || motivo.trim().length > 0;
  const modalRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();

  // Esc fecha (mesmo efeito do botão Cancelar), e foco volta pra quem abriu.
  useEffect(() => {
    const elementoAnterior = document.activeElement as HTMLElement | null;
    // Textarea tem `autoFocus` — só assume o foco se nada dentro pegou sozinho.
    if (!modalRef.current?.contains(document.activeElement)) modalRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      elementoAnterior?.focus();
    };
  }, [onFechar]);

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={onFechar}>
      <div
        ref={modalRef}
        className="modal"
        style={{ width: 'min(440px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
      >
        <div className="modal-body" style={{ paddingTop: '1.5rem' }}>
          <p id={tituloId} style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>
            Cancelar este evento? Ele fica no histórico marcado como Cancelado (não é apagado).
          </p>
          <Field label={`Motivo do cancelamento${motivoObrigatorio ? ' *' : ' (opcional)'}`}>
            <Textarea
              tone="modal"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder={motivoObrigatorio
                ? 'Por que a reunião foi cancelada?'
                : 'Reunião ainda pendente — motivo é opcional aqui.'}
              autoFocus
            />
          </Field>
          {permitirRegistrarContato && (
            <label className="flex items-center gap-2" style={{ marginTop: '0.75rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={registrarContato} onChange={(e) => setRegistrarContato(e.target.checked)} />
              Cliente foi contatado (registra um Contato concluído hoje)
            </label>
          )}
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
          <Button variant="secondary" disabled={!valido} onClick={() => onConfirmar(motivo.trim(), registrarContato)}>
            Confirmar
          </Button>
          <Button variant="danger" disabled={!valido} onClick={() => onConfirmarESalvar(motivo.trim(), registrarContato)}>
            Confirmar e Salvar
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
