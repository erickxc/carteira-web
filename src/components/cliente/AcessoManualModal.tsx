import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../ui';
import { copiarTexto } from '../../utils/entregarAcesso';

export interface AcessoManual {
  produto: string;
  login: string;
  senha: string;
  /** Presente só se o link ainda precisa ser aberto (pop-up bloqueado). */
  url?: string;
  copiou: boolean;
}

/**
 * Segundo passo quando o navegador recusou copiar a senha ou abrir o link: um
 * clique novo costuma resolver os dois. Mostrar a senha é só a pedido, porque a
 * tela pode estar compartilhada em reunião. A credencial vive só neste modal.
 */
export function AcessoManualModal({ acesso, onClose }: { acesso: AcessoManual; onClose: () => void }) {
  const [copiou, setCopiou] = useState(acesso.copiou);
  const [falhou, setFalhou] = useState(false);
  const [mostrar, setMostrar] = useState(false);

  async function copiar() {
    const ok = await copiarTexto(acesso.senha);
    setCopiou(ok);
    setFalhou(!ok);
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6 flex flex-col gap-3" style={{ fontSize: 13 }}>
          <strong>Acesso a {acesso.produto}</strong>
          {acesso.login && <span>Login: {acesso.login}</span>}
          <span className="text-text-muted">
            {copiou ? 'Senha copiada — cole no campo de senha.' : falhou ? 'O navegador não deixou copiar.' : 'A senha não foi copiada.'}
          </span>
          {mostrar && <code style={{ userSelect: 'all' }}>{acesso.senha}</code>}
          <div className="flex flex-wrap gap-2">
            {!copiou && <Button size="sm" onClick={copiar}>Copiar senha</Button>}
            {!copiou && !mostrar && <Button size="sm" variant="ghost" onClick={() => setMostrar(true)}>Mostrar senha</Button>}
            {acesso.url && (
              <Button size="sm" onClick={() => window.open(acesso.url, '_blank', 'noopener,noreferrer')}>Abrir {acesso.produto}</Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
