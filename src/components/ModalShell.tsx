import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  /** Handler do submit do form interno (o <form> em volta do body/footer é o próprio ModalShell). */
  onSubmit: (e: FormEvent) => void;
  /** Botões do rodapé (Cancelar/Salvar/Excluir etc.) — cada modal decide os seus. */
  footer: ReactNode;
  /** 'lg' = modal largo (formulários com muitos campos, ex. EventFormModal).
   *  'xl' = modal extra largo (conteúdo visual, ex. mapa). */
  size?: 'lg' | 'xl';
  children: ReactNode;
}

/**
 * Casca comum a todos os modais de formulário (overlay + modal + header +
 * form + body scrollável + footer fixo) — antes duplicada em EventFormModal,
 * ClientFormModal, AcaoFormModal e ReminderFormModal. Cada modal só entra com
 * título, conteúdo do body e botões do footer; lógica/estado continuam no
 * componente de cada um.
 */
export function ModalShell({ title, onClose, onSubmit, footer, size, children }: ModalShellProps) {
  // Portal para o <body>: o modal é renderizado dentro das páginas, que ficam
  // sob `.page-transition` (tem transform/animação). Um ancestral com transform
  // faz `position: fixed` se ancorar NELE em vez da viewport — o modal saía da
  // tela e não redimensionava. No body, o fixed volta a valer pela viewport.
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${size ? ` modal-${size}` : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">{children}</div>
          <div className="modal-footer">{footer}</div>
        </form>
      </div>
    </div>,
    document.body
  );
}
