/**
 * Formata um item de "Registro da Monitoria" (`ProdutoSituacaoItem`) pra
 * texto — usado tanto no prompt da análise automática (`analiseCliente.cjs`)
 * quanto no da ata por IA (`geracaoAta.cjs`). Os dois são CJS server-side,
 * então compartilham isto direto (diferente do par ata.ts/ataTexto.cjs, que
 * duplica de propósito por causa da fronteira ESM/CJS — ver CLAUDE.md).
 *
 * `direcao` (aumento/queda/manteve) substituiu o texto livre de `situacao` —
 * registro ANTIGO (sem `direcao`) cai no fallback de `situacao`, pra não
 * perder histórico já salvo.
 */
function textoDirecaoOuLegado(item) {
  if (item.direcao === 'aumento') return `↑ aumento${item.observacao ? ` — ${item.observacao}` : ''}`;
  if (item.direcao === 'queda') return `↓ queda${item.observacao ? ` — ${item.observacao}` : ''}`;
  if (item.direcao === 'manteve') return `→ manteve${item.observacao ? ` — ${item.observacao}` : ''}`;
  return item.situacao || '';
}

module.exports = { textoDirecaoOuLegado };
