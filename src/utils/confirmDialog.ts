/**
 * Confirmação assíncrona em modal próprio, no lugar do `confirm()` nativo do
 * navegador (que destoa do resto da UI e não pode ser estilizado). Uso:
 *   if (!(await confirmDialog('Excluir X?', { danger: true, confirmLabel: 'Excluir' }))) return;
 * <ConfirmHost /> (montado uma vez em App.tsx) é quem renderiza o modal.
 */
export interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  /** true = botão de confirmar em vermelho (ações destrutivas). */
  danger?: boolean;
}
export interface ConfirmState extends ConfirmOptions {
  message: string;
  resolve: (value: boolean) => void;
}

type Listener = (state: ConfirmState | null) => void;
let listener: Listener | null = null;

export function subscribeConfirm(l: Listener): () => void {
  listener = l;
  return () => { if (listener === l) listener = null; };
}

export function confirmDialog(message: string, opts?: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) { resolve(window.confirm(message)); return; } // fallback se o host não estiver montado
    listener({ message, resolve, ...opts });
  });
}
