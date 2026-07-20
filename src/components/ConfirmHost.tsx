import { useEffect, useState } from 'react';
import { subscribeConfirm, type ConfirmState } from '../utils/confirmDialog';

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => subscribeConfirm(setState), []);

  if (!state) return null;

  function responder(valor: boolean) {
    state!.resolve(valor);
    setState(null);
  }

  return (
    <div className="modal-overlay" onClick={() => responder(false)}>
      <div className="modal" style={{ width: 'min(420px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-body" style={{ paddingTop: '1.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>{state.message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => responder(false)}>{state.cancelLabel ?? 'Cancelar'}</button>
          <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => responder(true)}>
            {state.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
