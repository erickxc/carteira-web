import type { ReactNode } from 'react';
import type { Cliente } from '../../types';

interface GrupoProps {
  titulo: string;
  sub: string;
  lista: Cliente[];
  renderCard: (c: Cliente) => ReactNode;
}

/** Seção com título + contagem + grid de cards (ou empty-state) — usada por
 * todos os grupos de Acompanhamento. `renderCard` decide o que renderizar por
 * cliente, então este componente não precisa saber nada sobre CardCliente. */
export function Grupo({ titulo, sub, lista, renderCard }: GrupoProps) {
  return (
    <div className="section">
      <div className="section-header">
        <h3>{titulo} <span className="text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {sub}</span></h3>
        <span className="text-muted" style={{ fontSize: 12 }}>{lista.length}</span>
      </div>
      {lista.length === 0 ? <div className="glass-card glass-card-flat"><div className="empty-state">Nenhum cliente.</div></div> : (
        <div className="acao-grid">{lista.map(renderCard)}</div>
      )}
    </div>
  );
}
