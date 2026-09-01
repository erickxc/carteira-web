/**
 * Escopo GERAL dos Dados Alvos (item 5.2 do pedido original): receita e
 * quantidade por mês/ano, e quantos clientes finais distintos compraram em
 * cada período — sem recorte de reunião, sem interpretação de "combinado x
 * resultado" (isso é o escopo reunião, `acompanhamento.cjs`). É o retrato cru
 * da carteira desse cliente ao longo do tempo.
 *
 * Fonte é sempre `cruzamento` do agregado (`leitor.agregar`) — nunca refaz
 * conta a partir da lista de vendas, que já foi jogada fora nesse ponto (ver
 * fato 2 em leitor.cjs: cada linha é uma venda, cruzamento já é a soma por
 * loja+cliente+produto+ano+mês).
 */

const arredondar = (v) => Math.round(v * 100) / 100;

/**
 * Mês 0 (ausente/ilegível na origem) fica de fora de uma série por período —
 * não dá pra posicionar no tempo, e um "período 2026-00" só confundiria quem
 * olha a lista. A receita dele ainda existiria no agregado geral da loja,
 * só não entra numa série mensal.
 */
function porPeriodo(cruzamento, lojas) {
  const doCliente = lojas ? cruzamento.filter((l) => lojas.includes(l.loja)) : cruzamento;
  const mapa = new Map();
  for (const l of doCliente) {
    if (!l.mes) continue;
    const periodo = `${l.ano}-${String(l.mes).padStart(2, '0')}`;
    if (!mapa.has(periodo)) mapa.set(periodo, { periodo, receita: 0, qtd: 0, clientesFinais: new Set() });
    const alvo = mapa.get(periodo);
    alvo.receita += l.receita;
    alvo.qtd += l.qtd;
    alvo.clientesFinais.add(l.cliente);
  }
  return [...mapa.values()]
    .map((p) => ({ periodo: p.periodo, receita: arredondar(p.receita), qtd: p.qtd, totalClientes: p.clientesFinais.size }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/**
 * Resumo geral de um cliente da carteira: série por período + totais.
 * `lojas` restringe ao recorte daquele cliente dentro de um agregado que pode
 * cobrir mais de uma loja (mesmo padrão de `listasDoCliente`).
 */
function resumoGeral(agregado, lojas) {
  const serie = porPeriodo(agregado.cruzamento || [], lojas);
  const totalReceita = arredondar(serie.reduce((s, p) => s + p.receita, 0));
  const totalQtd = serie.reduce((s, p) => s + p.qtd, 0);
  const clientesUnicos = new Set(
    (lojas ? agregado.cruzamento.filter((l) => lojas.includes(l.loja)) : agregado.cruzamento || [])
      .filter((l) => l.mes)
      .map((l) => l.cliente),
  );
  return {
    serie,
    totalReceita,
    totalQtd,
    totalClientesDistintos: clientesUnicos.size,
    primeiroPeriodo: serie[0]?.periodo ?? null,
    ultimoPeriodo: serie[serie.length - 1]?.periodo ?? null,
  };
}

module.exports = { porPeriodo, resumoGeral };
