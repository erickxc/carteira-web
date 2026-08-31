/**
 * Movimento de receita e quantidade de uma entidade (produto ou cliente final)
 * DEPOIS da reunião que a colocou em pauta.
 *
 * É o cálculo do bloco "retorno do combinado": não interessa quanto o produto
 * vendeu, interessa se mudou desde que alguém decidiu mexer nele.
 *
 * Duas decisões que mudam o resultado, e as duas são do usuário:
 *
 * 1. **O mês corrente (parcial) ENTRA nos números** — ele quer medir como o mês
 *    atual está indo. Mas fica marcado (`parcial`), e existe uma regra explícita
 *    aqui: quando não há nenhum mês FECHADO depois da reunião, o veredicto é
 *    `indicativo_parcial`, nunca "não movimentou" nem "piorou". Um mês
 *    incompleto sempre parece queda; deixar isso virar conclusão colocaria o
 *    dossiê afirmando perda inexistente na frente do cliente.
 * 2. **Receita e quantidade são medidas separadas.** Quantidade cair mantendo
 *    receita é preço, não perda de cliente — diagnósticos diferentes, e juntar
 *    num índice só apagaria justamente a distinção que interessa.
 *
 * O mês da própria reunião é excluído das duas pontas: metade dele é anterior à
 * decisão, então não serve nem como base nem como resultado.
 */

// ±5% é ruído de mês. Abaixo disso a resposta honesta é "não mudou".
const LIMIAR_VARIACAO = 0.05;
// Base de comparação: até 3 meses fechados antes da reunião. Três é o que o
// analisador da 2D usa como janela recente, e absorve sazonalidade de um mês
// atípico sem diluir o efeito da decisão.
const MESES_BASE = 3;

const periodoDe = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`;

/** 'YYYY-MM-DD' (ou Date) -> 'YYYY-MM'. */
function periodoDaData(data) {
  const texto = String(data ?? '');
  const casa = texto.match(/^(\d{4})-(\d{2})/);
  if (casa) return `${casa[1]}-${casa[2]}`;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : periodoDe(d.getFullYear(), d.getMonth() + 1);
}

/**
 * Série mensal de uma entidade, a partir do `cruzamento` do agregado.
 * `filtro`: `{ lojas?: string[], produto?: string, cliente?: string }`.
 */
function serieMensal(cruzamento, filtro = {}) {
  const lojas = filtro.lojas ? new Set(filtro.lojas) : null;
  const porPeriodo = new Map();

  for (const linha of cruzamento || []) {
    if (lojas && !lojas.has(linha.loja)) continue;
    if (filtro.produto && linha.produto !== filtro.produto) continue;
    if (filtro.cliente && linha.cliente !== filtro.cliente) continue;
    // Mês 0 = mês ausente/ilegível na origem. Não tem lugar numa série temporal:
    // não dá para saber se é antes ou depois da reunião.
    if (!linha.mes) continue;

    const p = periodoDe(linha.ano, linha.mes);
    const atual = porPeriodo.get(p) || { periodo: p, receita: 0, qtd: 0 };
    atual.receita += linha.receita || 0;
    atual.qtd += linha.qtd || 0;
    porPeriodo.set(p, atual);
  }

  return [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

const media = (valores) => (valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0);
const arredondar = (v) => Math.round(v * 100) / 100;

/**
 * Variação relativa. `null` quando a base é zero — não existe "x% acima de
 * zero", e devolver Infinity faria a tela imprimir "∞%". Quem consome usa o
 * valor absoluto nesse caso.
 */
function variacao(antes, depois) {
  if (!antes) return null;
  return (depois - antes) / antes;
}

/**
 * @param serie          saída de `serieMensal`
 * @param combinadoEm    data da reunião que pautou a entidade
 * @param opts.periodoParcial período que ainda está em curso (default: o último
 *        da série — é o que o arquivo tem de mais recente)
 */
function movimentoDesde(serie, combinadoEm, opts = {}) {
  const alvo = periodoDaData(combinadoEm);
  if (!alvo || !serie?.length) {
    return { veredicto: 'sem_dados', motivo: 'sem série ou sem data de referência' };
  }

  const parcial = opts.periodoParcial ?? serie[serie.length - 1].periodo;
  const antes = serie.filter((p) => p.periodo < alvo).slice(-MESES_BASE);
  const depois = serie.filter((p) => p.periodo > alvo);
  const depoisFechados = depois.filter((p) => p.periodo !== parcial);

  if (!antes.length) {
    return {
      veredicto: 'sem_base',
      motivo: 'não há mês anterior à reunião para comparar',
      periodoReferencia: alvo,
      depois: depois.map((p) => p.periodo),
    };
  }
  if (!depois.length) {
    return {
      veredicto: 'sem_dados',
      motivo: 'nenhum mês depois da reunião',
      periodoReferencia: alvo,
    };
  }

  const base = { receita: media(antes.map((p) => p.receita)), qtd: media(antes.map((p) => p.qtd)) };
  const atual = { receita: media(depois.map((p) => p.receita)), qtd: media(depois.map((p) => p.qtd)) };
  const varReceita = variacao(base.receita, atual.receita);
  const varQtd = variacao(base.qtd, atual.qtd);

  // Sem mês fechado depois, o único dado disponível é um mês incompleto: vira
  // indicativo, jamais conclusão. Ver decisão 1 no topo.
  const soParcial = depoisFechados.length === 0;
  let veredicto;
  if (soParcial) veredicto = 'indicativo_parcial';
  else if (varReceita === null) veredicto = atual.receita > 0 ? 'movimentou' : 'nao_movimentou';
  else if (varReceita >= LIMIAR_VARIACAO) veredicto = 'movimentou';
  else if (varReceita <= -LIMIAR_VARIACAO) veredicto = 'piorou';
  else veredicto = 'nao_movimentou';

  return {
    veredicto,
    periodoReferencia: alvo,
    mesesBase: antes.map((p) => p.periodo),
    mesesDepois: depois.map((p) => p.periodo),
    mesesDepoisFechados: depoisFechados.length,
    incluiMesParcial: depois.some((p) => p.periodo === parcial),
    periodoParcial: parcial,
    receita: { base: arredondar(base.receita), atual: arredondar(atual.receita), variacao: varReceita },
    qtd: { base: arredondar(base.qtd), atual: arredondar(atual.qtd), variacao: varQtd },
    // Receita e quantidade em direções opostas é o sinal de preço, e é o que
    // sustenta a frase "reduziram a margem e o volume não veio".
    divergeReceitaQtd: varReceita !== null && varQtd !== null
      && Math.sign(varReceita) !== Math.sign(varQtd)
      && (Math.abs(varReceita) >= LIMIAR_VARIACAO || Math.abs(varQtd) >= LIMIAR_VARIACAO),
  };
}

module.exports = {
  LIMIAR_VARIACAO,
  MESES_BASE,
  periodoDaData,
  serieMensal,
  movimentoDesde,
  variacao,
};
