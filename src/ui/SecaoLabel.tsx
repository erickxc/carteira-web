import type { ReactNode } from 'react';

/** Separador de seção dentro de um formulário longo (modal de Cliente, de
 *  Evento...) — agrupar campos por assunto é o que torna óbvio o que
 *  preencher onde, em vez de uma pilha plana de campos sem relação visível
 *  entre eles. */
export function SecaoLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[0.66rem] font-semibold uppercase tracking-[0.07em] text-text-muted mt-2 mb-2 after:content-[''] after:flex-1 after:h-px after:bg-hair">
      {children}
    </div>
  );
}
