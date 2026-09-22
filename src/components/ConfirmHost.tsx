import { useEffect, useId, useRef, useState } from 'react';
import { subscribeConfirm, type ConfirmState } from '../utils/confirmDialog';
import { Button } from '../ui';

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const mensagemId = useId();

  useEffect(() => subscribeConfirm(setState), []);

  function responder(valor: boolean) {
    state!.resolve(valor);
    setState(null);
  }

  // Esc cancela (mesmo efeito do botão Cancelar), e foco volta pra quem abriu
  // o confirm quando ele fecha por qualquer caminho.
  useEffect(() => {
    if (!state) return;
    const elementoAnterior = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') responder(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      elementoAnterior?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state) return null;

  return (
    // z-index acima das modais (1000): o confirm pode ser disparado com uma modal
    // aberta (ex.: "agendar próximo" ao concluir) e precisa ficar por cima.
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => responder(false)}>
      <div
        ref={modalRef}
        className="modal"
        style={{ width: 'min(420px, 100%)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={mensagemId}
        tabIndex={-1}
      >
        <div className="modal-body" style={{ paddingTop: '1.5rem' }}>
          <p id={mensagemId} style={{ margin: 0, fontSize: '0.95rem' }}>{state.message}</p>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={() => responder(false)}>{state.cancelLabel ?? 'Cancelar'}</Button>
          <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => responder(true)}>
            {state.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
