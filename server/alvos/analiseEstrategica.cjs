/**
 * Escopo ESTRATÉGICO dos Dados Alvos (item 5.3): as mesmas análises que o
 * relatório Excel gerado pelo analisador da 2D já produz — queda persistente
 * de produto, erosão de cliente contra o próprio pico, cliente que
 * praticamente parou de comprar, e poder de compra. As janelas e limiares
 * aqui NÃO são escolha nossa: foram medidos direto nos relatórios reais
 * (`Relatorio_MOTOBRAS_2026-08.xlsx`) pra este cálculo falar a mesma língua
 * do que o monitor já leva pra reunião.
 *
 * Regra que vale para TODAS as análises aqui: o período mais recente
 * (`opts.periodoParcial`) fica de fora — no relatório real ele é excluído por
 * estar "provavelmente incompleto" (visto no log de produção: "[Mensal]
 * Período mais recente (2026-08) excluído por padrão"). Sem `opts.periodoParcial`
 * explícito, usa o último período do agregado.
 */

const { serieMensal } = require('./movimento.cjs');

const arredondar = (v) => Math.round(v * 100) / 100;

/** Períodos "fechados" de uma série, na ordem em que já vêm (`serieMensal` ordena por período). */
function fecharSerie(serie, periodoParcial) {
  return serie.filter((p) => p.periodo !== periodoParcial);
}

function nomesDistintos(lista, campo, lojas) {
  return [...new Set(lista.filter((x) => lojas.includes(x.loja)).map((x) => x[campo]))];
}

/**
 * Produtos com queda de receita em 3+ períodos consecutivos que PERSISTE até
 * o período mais recente fechado — não um histórico antigo já recuperado
 * (medido: "Ordenado pelo maior impacto financeiro (Queda em R$)").
 */
function quedaPersistente(agregado, lojas, opts = {}) {
  const minPeriodos = opts.minPeriodos ?? 3;
  const minQueda = opts.minQueda ?? 5000;
  const periodoParcial = opts.periodoParcial ?? agregado.periodos?.[agregado.periodos.length - 1];

  const out = [];
  for (const produto of nomesDistintos(agregado.produtos || [], 'produto', lojas)) {
    const serie = fecharSerie(serieMensal(agregado.cruzamento, { lojas, produto }), periodoParcial);
    if (serie.length < minPeriodos + 1) continue; // precisa de 1 ponto de referência ANTES do streak

    // Streak = Nº de QUEDAS mês-a-mês consecutivas terminando no ÚLTIMO ponto
    // fechado — "3 períodos consecutivos" no relatório real conta transições
    // de queda, não meses no total. "Persiste até o mais recente" é isto: se
    // o último mês subiu, a contagem para em zero, mesmo que tenha caído antes.
    let streak = 0;
    for (let i = serie.length - 1; i > 0; i--) {
      if (serie[i].receita < serie[i - 1].receita) streak++;
      else break;
    }
    if (streak < minPeriodos) continue;

    // Ponto imediatamente ANTES da primeira queda do streak — o patamar de
    // onde a queda partiu ("Período Anterior à Queda" no relatório real).
    const antes = serie[serie.length - 1 - streak];
    const atual = serie[serie.length - 1];
    const quedaEmReais = antes.receita - atual.receita;
    if (quedaEmReais < minQueda) continue;

    out.push({
      produto,
      periodosConsecutivos: streak,
      periodoAnterior: antes.periodo,
      receitaPrecedente: arredondar(antes.receita),
      qtdPrecedente: antes.qtd,
      receitaAtual: arredondar(atual.receita),
      qtdAtual: atual.qtd,
      quedaEmReais: arredondar(quedaEmReais),
      percentualQueda: antes.receita ? quedaEmReais / antes.receita : null,
    });
  }
  return out.sort((a, b) => b.quedaEmReais - a.quedaEmReais);
}

/**
 * Clientes finais cuja receita total (todos os produtos) caiu 50%+ (ou
 * zerou) contra o PRÓPRIO PICO histórico, com queda mínima em R$ — quem já
 * voltou a comprar no ritmo de antes não aparece (pico == mês atual não conta).
 */
function erosaoClientes(agregado, lojas, opts = {}) {
  const minQueda = opts.minQueda ?? 5000;
  const minPercentual = opts.minPercentual ?? 0.5;
  const periodoParcial = opts.periodoParcial ?? agregado.periodos?.[agregado.periodos.length - 1];

  const out = [];
  for (const cliente of nomesDistintos(agregado.clientes || [], 'cliente', lojas)) {
    const serie = fecharSerie(serieMensal(agregado.cruzamento, { lojas, cliente }), periodoParcial);
    if (!serie.length) continue;
    const pico = serie.reduce((m, p) => (p.receita > m.receita ? p : m), serie[0]);
    const atual = serie[serie.length - 1];
    if (atual.periodo === pico.periodo) continue; // o pico É o mês atual — sem erosão a medir

    const quedaEmReais = pico.receita - atual.receita;
    if (quedaEmReais < minQueda) continue;
    const percentualQueda = pico.receita ? quedaEmReais / pico.receita : 0;
    if (percentualQueda < minPercentual && atual.receita > 0) continue; // caiu 50%+ OU zerou

    out.push({
      cliente,
      periodoPico: pico.periodo,
      receitaPico: arredondar(pico.receita),
      receitaAtual: arredondar(atual.receita),
      quedaEmReais: arredondar(quedaEmReais),
      percentualQueda,
      parouDeComprar: atual.receita === 0,
    });
  }
  return out.sort((a, b) => b.quedaEmReais - a.quedaEmReais);
}

/**
 * Clientes que já compraram alguma vez, mas praticamente pararam — receita do
 * mês mais recente FECHADO caiu 95%+ frente ao pico (sobrou no máximo 5%).
 * Sem piso em R$ de propósito (pega baixo volume também). Devolve a série
 * mensal completa — é a trajetória, não só pico x atual.
 */
function semVenda(agregado, lojas, opts = {}) {
  const minPercentual = opts.minPercentual ?? 0.95;
  const periodoParcial = opts.periodoParcial ?? agregado.periodos?.[agregado.periodos.length - 1];

  const out = [];
  for (const cliente of nomesDistintos(agregado.clientes || [], 'cliente', lojas)) {
    const serie = fecharSerie(serieMensal(agregado.cruzamento, { lojas, cliente }), periodoParcial);
    if (!serie.length) continue;
    const pico = serie.reduce((m, p) => (p.receita > m.receita ? p : m), serie[0]);
    if (pico.receita <= 0) continue; // nunca comprou nada — não é alguém que "parou"
    const atual = serie[serie.length - 1];
    const percentualQueda = (pico.receita - atual.receita) / pico.receita;
    if (percentualQueda < minPercentual) continue;

    out.push({
      cliente,
      periodoPico: pico.periodo,
      receitaPico: arredondar(pico.receita),
      receitaAtual: arredondar(atual.receita),
      percentualQueda,
      serieMensal: serie.map((p) => ({ periodo: p.periodo, receita: arredondar(p.receita) })),
    });
  }
  return out.sort((a, b) => b.receitaPico - a.receitaPico);
}

/**
 * Poder de compra: capacidade de cada cliente final no MELHOR momento — média
 * dos 3 meses-calendário de MAIOR receita (não a média corrida, pra não
 * diluir o efeito de um pico isolado). Compara com a média dos últimos 3
 * meses fechados; conta quantos desses 3 tiveram queda de 60%+ frente ao
 * potencial.
 */
function poderDeCompra(agregado, lojas, opts = {}) {
  const janelaTop = opts.janelaTop ?? 3;
  const janelaRecente = opts.janelaRecente ?? 3;
  const limiarMuitoAbaixo = opts.limiarMuitoAbaixo ?? 0.6;
  const periodoParcial = opts.periodoParcial ?? agregado.periodos?.[agregado.periodos.length - 1];

  const out = [];
  for (const cliente of nomesDistintos(agregado.clientes || [], 'cliente', lojas)) {
    const serie = fecharSerie(serieMensal(agregado.cruzamento, { lojas, cliente }), periodoParcial);
    if (serie.length < janelaTop) continue; // sem histórico suficiente pra falar de "3 melhores meses"

    const top = [...serie].sort((a, b) => b.receita - a.receita).slice(0, janelaTop);
    const potencial = top.reduce((s, p) => s + p.receita, 0) / top.length;
    const recentes = serie.slice(-janelaRecente);
    const receitaMediaRecente = recentes.reduce((s, p) => s + p.receita, 0) / recentes.length;
    const percentualVariacao = potencial ? (receitaMediaRecente - potencial) / potencial : null;
    const mesesMuitoAbaixoDoPotencial = potencial
      ? recentes.filter((p) => (potencial - p.receita) / potencial >= limiarMuitoAbaixo).length
      : 0;

    out.push({
      cliente,
      poderDeCompra: arredondar(potencial),
      receitaMediaRecente: arredondar(receitaMediaRecente),
      percentualVariacao,
      mesesMuitoAbaixoDoPotencial,
    });
  }
  return out.sort((a, b) => b.poderDeCompra - a.poderDeCompra);
}

module.exports = { quedaPersistente, erosaoClientes, semVenda, poderDeCompra };
