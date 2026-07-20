import type { FormEvent, ReactNode } from 'react';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  /** Handler do submit do form interno (o <form> em volta do body/footer é o próprio ModalShell). */
  onSubmit: (e: FormEvent) => void;
  /** Botões do rodapé (Cancelar/Salvar/Excluir etc.) — cada modal decide os seus. */
  footer: ReactNode;
  /** 'lg' = modal largo (usado pelo EventFormModal, que tem muitos campos). */
  size?: 'lg';
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
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${size === 'lg' ? ' modal-lg' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">{children}</div>
          <div className="modal-footer">{footer}</div>
        </form>
      </div>
    </div>
  );
}
