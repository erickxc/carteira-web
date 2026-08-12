import { v4 as uuidv4 } from 'uuid';

/**
 * Fila de toasts global (pub-sub simples, sem Context) — qualquer módulo pode
 * chamar toastError/toastSuccess/toastInfo sem precisar de acesso a hooks.
 * <ToastHost /> (montado uma vez em App.tsx) é quem renderiza a fila.
 *
 * O id vem do `uuid` (dependência já usada em todo o projeto), NUNCA de
 * `crypto.randomUUID()`: essa API só existe em secure context (HTTPS ou
 * localhost) e o app é servido por HTTP na LAN, em http://Monitor-2D/ ou
 * http://KAROL-2D:8080. Ali `crypto.randomUUID` é undefined e a chamada lança
 * TypeError — o que derrubava QUALQUER toast em produção.
 *
 * Consequência real do bug (não era só o aviso que sumia): quem chamava
 * `toastSuccess(...)` antes de fechar um modal tinha a exceção estourada no
 * meio da função, então o `onClose()` seguinte nunca executava. O dado era
 * salvo, o modal ficava aberto e nenhuma mensagem aparecia — exatamente o que
 * acontecia ao registrar um contato do cliente. Também explicava por que erros
 * de validação pareciam "não fazer nada" quando acessado pela rede.
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
  const id = uuidv4();
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
