export interface PosicaoPopover {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight?: number;
}

/**
 * Posição "inteligente" de um popover ancorado (fixed) num elemento —
 * flip vertical (abre pra cima quando não há espaço embaixo) + clamp
 * horizontal (nunca deixa o popover sair pela borda direita/esquerda da
 * tela). Antes cada popover (Dropdown, ClienteCombobox, AutocompleteInput,
 * AcessosExternosButton, ReagendarButton, ReunioesHojeCard, e as células da
 * tabela de clientes) reimplementava sua própria versão fixa em
 * `top: rect.bottom + 4`, sempre pra baixo — cortava toda vez que o gatilho
 * estava perto do fim da tela (linha de baixo da tabela, filtro no rodapé
 * da página etc.), bug relatado repetidas vezes. Uma função só, usada em
 * todo lugar que abre popover via `getBoundingClientRect`.
 *
 * `largura`/`alturaEstimativa` são só heurística pra decidir o lado — o
 * `maxHeight` devolvido é o valor real (espaço disponível no lado escolhido,
 * com margem), pra quem for renderizar aplicar `overflowY: 'auto'` e nunca
 * estourar a tela mesmo que o conteúdo real seja maior que a estimativa.
 */
export function calcularPosicaoPopover(
  rect: DOMRect,
  opts: { largura?: number; alturaEstimativa?: number; alinhar?: 'left' | 'right' } = {}
): PosicaoPopover {
  const MARGEM = 8;
  const alturaEstimativa = opts.alturaEstimativa ?? 260;
  const espacoAbaixo = window.innerHeight - rect.bottom;
  const espacoAcima = rect.top;
  const abreAbaixo = espacoAbaixo >= alturaEstimativa || espacoAbaixo >= espacoAcima;

  const pos: PosicaoPopover = abreAbaixo
    ? { top: rect.bottom + 4, maxHeight: Math.max(120, espacoAbaixo - MARGEM * 2) }
    : { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.max(120, espacoAcima - MARGEM * 2) };

  if (opts.alinhar === 'right') {
    pos.right = Math.max(MARGEM, window.innerWidth - rect.right);
  } else {
    const largura = opts.largura ?? rect.width;
    let left = rect.left;
    if (left + largura > window.innerWidth - MARGEM) left = Math.max(MARGEM, window.innerWidth - largura - MARGEM);
    pos.left = left;
  }
  return pos;
}
