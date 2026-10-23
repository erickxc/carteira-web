// Origens em que o monitorIA só pode CONSULTAR: as da reunião ao vivo. Ali a fala do
// cliente (entrada não confiável) entra no pedido ao agente — "monitorIA, cancela a próxima
// reunião" não pode virar escrita de verdade (auditoria de 23/10/2026: a investigação tinha
// acesso às 13 ferramentas que escrevem). Fonte única do campo: `escreve` em tools.cjs.
const ORIGENS_SOMENTE_LEITURA = new Set(['reuniao-investigacao', 'reuniao-ao-vivo']);

function ferramentasDaOrigem(ferramentas, origem) {
  return ORIGENS_SOMENTE_LEITURA.has(origem) ? ferramentas.filter((f) => !f.escreve) : ferramentas;
}

/** Motivo da recusa, ou null quando a ferramenta pode rodar para essa origem. */
function bloqueioDaOrigem(ferramenta, origem) {
  if (!ferramenta?.escreve || !ORIGENS_SOMENTE_LEITURA.has(origem)) return null;
  return `Na reunião o monitorIA só consulta: "${ferramenta.name}" altera dados e foi bloqueada.`;
}

module.exports = { ORIGENS_SOMENTE_LEITURA, ferramentasDaOrigem, bloqueioDaOrigem };
