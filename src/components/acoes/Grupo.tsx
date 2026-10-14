import type { ReactNode } from 'react';
import { Card } from '../../ui';
import type { Cliente } from '../../types';

export type TomSecao = 'perigo' | 'atencao' | 'ok' | 'aguardando' | 'neutro';

/** Cabeçalho das seções da fila de Ações: título, contador na cor do grupo e
 *  linha separando do grupo anterior. Um só componente pra todas as seções. */
export function CabecalhoSecao({ titulo, sub, qtd, tom = 'neutro', nivel = 1 }: {
  titulo: string; sub?: string; qtd: number; tom?: TomSecao; nivel?: 1 | 2;
}) {
  return (
    <div className={`secao-acao secao-acao-n${nivel}`} data-tom={tom}>
      <h3 className="secao-acao-titulo">{titulo}</h3>
      <span className="secao-acao-qtd">{qtd}</span>
      {sub && <span className="secao-acao-sub">{sub}</span>}
    </div>
  );
}

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
      <CabecalhoSecao titulo={titulo} sub={sub} qtd={lista.length} />
      {lista.length === 0 ? <Card flat><div className="empty-state">Nenhum cliente.</div></Card> : (
        <div className="acao-grid">{lista.map(renderCard)}</div>
      )}
    </div>
  );
}
