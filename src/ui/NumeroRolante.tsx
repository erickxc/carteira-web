import { useEffect, useState } from 'react';

const DIGITOS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Número de KPI que rola dígito a dígito até o valor, como cotação (revisão
 * 1.6, mistura A+B). Rola ao montar e a cada mudança de valor (troca de mês,
 * filtro de monitor).
 *
 * Layout: o texto real fica no fluxo, invisível — é ele que define largura e
 * linha de base, então o "de 38" ao lado não sai do lugar. As colunas de
 * dígitos ficam por cima, em posição absoluta. Leitor de tela lê o valor
 * final (`sr-only`), nunca a coluna 0–9. Movimento reduzido: o CSS zera a
 * transição e o número aparece direto.
 */
export function NumeroRolante({ valor }: { valor: number | string }) {
  const texto = String(valor);
  // Reinicia a rolagem quando o valor muda: começa em 0 e vai ao destino no
  // frame seguinte (sem o frame em 0 a transição não teria de onde partir).
  const [rolado, setRolado] = useState<string | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRolado(texto));
    return () => cancelAnimationFrame(id);
  }, [texto]);
  // Movimento reduzido: vai direto ao valor, sem o frame em 0 (piscaria).
  const reduzido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const destino = reduzido || rolado === texto;

  return (
    <span className="num-rolante">
      <span className="sr-only">{texto}</span>
      <span className="invisible" aria-hidden>{texto}</span>
      <span className="num-rolante-faixa" aria-hidden>
        {texto.split('').map((c, i) =>
          /\d/.test(c) ? (
            <span key={i} className="num-rolante-dig">
              <span style={{ transform: `translateY(-${(destino ? Number(c) : 0) * 1.1}em)`, transitionDelay: `${i * 45}ms` }}>
                {DIGITOS.map((d) => <i key={d}>{d}</i>)}
              </span>
            </span>
          ) : (
            <span key={i}>{c}</span>
          )
        )}
      </span>
    </span>
  );
}
