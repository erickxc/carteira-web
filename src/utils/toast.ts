/**
 * Fila de toasts global (pub-sub simples, sem Context) — qualquer módulo pode
 * chamar toastError/toastSuccess/toastInfo sem precisar de acesso a hooks.
 * <ToastHost /> (montado uma vez em App.tsx) é quem renderiza a fila.
 */
export type ToastType = 'success' | 'error' | 'info';
export interface ToastMsg { id: string; type: ToastType; text: string }

type Listener = (msgs: ToastMsg[]) => void;
let queue: ToastMsg[] = [];
let listeners: Listener[] = [];

function emit() {
  listeners.forEach((l) => l(queue));
}

export function toast(type: ToastType, text: string, timeoutMs = 5000) {
  const id = crypto.randomUUID();
  queue = [...queue, { id, type, text }];
  emit();
  setTimeout(() => dismissToast(id), timeoutMs);
}

export function dismissToast(id: string) {
  queue = queue.filter((m) => m.id !== id);
  emit();
}

export function subscribeToast(listener: Listener): () => void {
  listeners.push(listener);
  listener(queue);
  return () => { listeners = listeners.filter((l) => l !== listener); };
}

export const toastError = (text: string) => toast('error', text);
export const toastSuccess = (text: string) => toast('success', text);
export const toastInfo = (text: string) => toast('info', text);
