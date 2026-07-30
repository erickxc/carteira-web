import { useEffect, useState } from 'react';
import { subscribeConfirm, type ConfirmState } from '../utils/confirmDialog';
import { Button } from '../ui';

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => subscribeConfirm(setState), []);

  if (!state) return null;

  function responder(valor: boolean) {
    state!.resolve(valor);
    setState(null);
  }

  return (
    // z-index acima das modais (1000): o confirm pode ser disparado com uma modal
    // aberta (ex.: "agendar próximo" ao concluir) e precisa ficar por cima.
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => responder(false)}>
      <div className="modal" style={{ width: 'min(420px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-body" style={{ paddingTop: '1.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>{state.message}</p>
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
