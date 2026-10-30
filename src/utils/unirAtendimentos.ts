/** Loja dos Dados Alvos como a tela de "Unir atendimentos" enxerga. */
export interface LojaDoAtendimento {
  loja: string;
  receita: number;
  /** Atendimento (clientId) que tem a loja hoje, ou null. */
  vinculado: string | null;
}

export interface MudancaPlanejada {
  loja: string;
  /** Atendimento que perde a loja (null = estava solta). */
  de: string | null;
  /** Atendimento que recebe a loja (null = fica solta). */
  para: string | null;
}

/** Lojas que hoje compõem o atendimento — ponto de partida das marcações. */
export function lojasDoAtendimento(lojas: LojaDoAtendimento[], clientId: string): Set<string> {
  return new Set(lojas.filter((l) => l.vinculado === clientId).map((l) => l.loja));
}

/**
 * Diferença entre o que está gravado e o que foi marcado na tela.
 * Marcar uma loja que está em OUTRO atendimento MOVE a loja (`de` = o outro):
 * uma loja só pertence a um atendimento — as vendas dela não podem ser
 * somadas em dois lugares.
 */
export function planejarMudancas(lojas: LojaDoAtendimento[], clientId: string, marcadas: Set<string>): MudancaPlanejada[] {
  const mudancas: MudancaPlanejada[] = [];
  for (const l of lojas) {
    const eraDele = l.vinculado === clientId;
    const vaiSer = marcadas.has(l.loja);
    if (!eraDele && vaiSer) mudancas.push({ loja: l.loja, de: l.vinculado, para: clientId });
    if (eraDele && !vaiSer) mudancas.push({ loja: l.loja, de: clientId, para: null });
  }
  return mudancas;
}
