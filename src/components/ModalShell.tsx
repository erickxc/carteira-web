import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFecharAnimado } from '../hooks/useFecharAnimado';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  /** Handler do submit do form interno (o <form> em volta do body/footer é o próprio ModalShell). */
  onSubmit: (e: FormEvent) => void;
  /** Botões do rodapé (Cancelar/Salvar/Excluir etc.) — cada modal decide os seus. */
  footer: ReactNode;
  /** 'lg' = modal largo (formulários com muitos campos, ex. EventFormModal).
   *  'xl' = modal extra largo (conteúdo visual, ex. mapa, ou layout de 2 colunas). */
  size?: 'lg' | 'xl';
  /** Substitui o `<h2>{title}</h2>` padrão por conteúdo próprio (ex.: título
   *  editável inline) — `title` continua sendo usado como texto acessível. */
  titleNode?: ReactNode;
  /** Cor de fundo do cabeçalho (ex.: cor da Frente/prioridade da tarefa) —
   *  ausente = fundo padrão do tema. */
  headerBackground?: string;
  /** Cor do texto/ícones do cabeçalho — só relevante junto de `headerBackground`. */
  headerForeground?: string;
  children: ReactNode;
}

/**
 * Casca comum a todos os modais de formulário (overlay + modal + header +
 * form + body scrollável + footer fixo) — antes duplicada em EventFormModal,
 * ClientFormModal, AcaoFormModal e ReminderFormModal. Cada modal só entra com
 * título, conteúdo do body e botões do footer; lógica/estado continuam no
 * componente de cada um.
 */
export function ModalShell({ title, onClose, onSubmit, footer, size, titleNode, headerBackground, headerForeground, children }: ModalShellProps) {
  const { fechando, fechar } = useFecharAnimado(onClose);

  // Portal para o <body>: o modal é renderizado dentro das páginas, que ficam
  // sob `.page-transition` (tem transform/animação). Um ancestral com transform
  // faz `position: fixed` se ancorar NELE em vez da viewport — o modal saía da
  // tela e não redimensionava. No body, o fixed volta a valer pela viewport.
  return createPortal(
    <div className={`modal-overlay${fechando ? ' is-closing' : ''}`} onClick={fechar}>
      <div className={`modal${size ? ` modal-${size}` : ''}`} onClick={(e) => e.stopPropagation()}>
        <div
          className="modal-header"
          style={headerBackground ? { background: headerBackground, color: headerForeground, borderBottomColor: 'transparent' } : undefined}
          title={titleNode ? title : undefined}
        >
          {titleNode ?? <h2>{title}</h2>}
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
