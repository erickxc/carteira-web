import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
import { useIndicadorDeslizante } from '../hooks/useIndicadorDeslizante';

/**
 * Container `.tabs` com o fundo da aba ativa (`.tab.is-active`) deslizando entre
 * as abas, em vez de trocar seco. Os filhos continuam sendo `<button className="tab">`.
 */
export function Tabs({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const [ref, estilo] = useIndicadorDeslizante<HTMLDivElement>('.tab.is-active');
  return (
    <div ref={ref} className={clsx('tabs', className)} {...props}>
      {estilo && <span className="tabs-indicador" style={estilo} aria-hidden />}
      {children}
    </div>
  );
}
