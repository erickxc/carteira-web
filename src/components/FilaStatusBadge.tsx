import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { verificarStatusFila, type StatusFila } from '../api/client';

const INTERVALO_MS = 30_000;

/**
 * Indicador "N alterações aguardando sincronização" — só aparece de fato em
 * `APP_MODE=client` (as 3 máquinas remotas, ver plano de fila/controller);
 * em modo server o endpoint sempre devolve zerado, então o componente nunca
 * renderiza nada ali. Poll simples (mesmo padrão de `ReminderPopup`), não
 * usa o `CarteiraContext` porque é um dado de infraestrutura da fila, não do
 * domínio da carteira.
 */
export function FilaStatusBadge() {
  const [status, setStatus] = useState<StatusFila | null>(null);

  useEffect(() => {
    let ativo = true;
    const verificar = () => {
      verificarStatusFila()
        .then((s) => { if (ativo) setStatus(s); })
        .catch(() => { /* API fora do ar — sem indicador é melhor que travar a UI */ });
    };
    verificar();
    const id = setInterval(verificar, INTERVALO_MS);
    return () => { ativo = false; clearInterval(id); };
  }, []);

  if (!status || status.pendentes === 0) return null;

  const titulo = status.comErro > 0
    ? `${status.pendentes} alteração(ões) aguardando sincronização — ${status.comErro} com erro no momento${status.ultimoErro ? `: ${status.ultimoErro}` : ''}`
    : `${status.pendentes} alteração(ões) aguardando sincronização com o servidor principal`;

  return (
    <div
      className="sidebar-action flex items-center gap-[0.4rem] w-full rounded-sm px-[0.7rem] py-[0.5rem] text-[0.76rem] font-medium"
      style={{
        color: status.comErro > 0 ? 'var(--danger)' : 'var(--text-muted)',
        border: `1px solid ${status.comErro > 0 ? 'var(--danger)' : 'var(--border)'}`,
      }}
      title={titulo}
    >
      <CloudOff size={15} className="shrink-0" />
      <span className="sidebar-label">{status.pendentes} pendente(s){status.comErro > 0 ? ' · erro' : ''}</span>
    </div>
  );
}
