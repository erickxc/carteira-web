import type { ReactNode } from 'react';

/** Separador de seção dentro de um formulário longo (modal de Cliente, de
 *  Evento...) — agrupar campos por assunto é o que torna óbvio o que
 *  preencher onde, em vez de uma pilha plana de campos sem relação visível
 *  entre eles. */
export function SecaoLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[0.66rem] font-bold uppercase tracking-[0.06em] text-text-muted mt-2 mb-2 pb-1 border-b border-border">
      {children}
    </div>
  );
}
