const { differenceInCalendarDays, parseISO } = require('date-fns');
const motor = require('../../shared/cadenciaServico.cjs');

/**
 * Consumidores backend-only do motor de cadência compartilhado
 * (`shared/cadenciaServico.cjs`) — cálculos que só existem aqui porque só a
 * ferramenta `buscar_fila_priorizacao`/alertas do agente (`server/ia/`)
 * precisa deles; o Dashboard do frontend tem seu próprio hook
 * (`src/hooks/useDashboardData.ts`) com os mesmos números calculados de
 * outro jeito (documentado caso a caso abaixo, "Mesmo cálculo do card X").
 *
 * Até 04/09/2026 este arquivo era uma PORTA duplicada de
 * `src/utils/cadenciaServico.ts` inteiro (motor + estes wrappers, 412
 * linhas) — motivo e histórico da unificação estão no comentário de topo de
 * `shared/cadenciaServico.cjs`.
 */

const {
  isClienteAtivo, buildUltimaInteracaoMap, buildFilaCadencia, classificarCadencia,
  contatoRecenteNaoRefletido, rotuloRelogio, listaJSON,
  atendimentoEmDia, relogioNoPrazo, itensVencendo, ehEntrega,
} = motor;

/**
 * Mesmo cálculo do card "Atendimentos no Ritmo" da Visão Geral. Em dia =
 * TODOS os relógios do atendimento no prazo (`atendimentoEmDia`); com
 * `servico`, só o relógio daquele serviço. Percentual é contagem pura (em dia
 * / total): contato recente é informação (`contatoRecente`), não meio ponto.
 */
function calcularAderencia(clientes, agenda, acoes, cadencias, now = new Date(), opts = {}) {
  const fila = buildFilaCadencia(clientes, agenda, acoes, cadencias, now);
  const relevantes = opts.servico ? fila.filter((f) => f.relogios.some((r) => r.servico === opts.servico)) : fila;
  const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now });

  function relogiosRelevantes(f) {
    return opts.servico ? f.relogios.filter((r) => r.servico === opts.servico) : f.relogios;
  }
  function classificar(f) {
    const rels = relogiosRelevantes(f);
    if (atendimentoEmDia({ relogios: rels })) return 'em_dia';
    if (rels.some((r) => r.status === 'coberto')) return 'agenda_marcada';
    const ultimoContato = ultimaInteracaoMap.get(f.cliente.id) ?? null;
    if (ultimoContato && contatoRecenteNaoRefletido(f.relogios, ultimoContato) && differenceInCalendarDays(now, ultimoContato) <= (Number(cadencias?.recontato_dias) || 5)) {
      return 'contato_recente';
    }
    return 'precisa_contato';
  }

  const total = relevantes.length;
  const emDia = relevantes.filter((f) => classificar(f) === 'em_dia');
  const agendaMarcada = relevantes.filter((f) => classificar(f) === 'agenda_marcada');
  const contatoRecente = relevantes.filter((f) => classificar(f) === 'contato_recente');
  const precisa = relevantes.filter((f) => classificar(f) === 'precisa_contato');
  const pct = total > 0 ? Math.round((emDia.length / total) * 100) : 0;

  return {
    total, pct,
    emDia: emDia.length, agendaMarcada: agendaMarcada.length, contatoRecente: contatoRecente.length, precisaContato: precisa.length,
    emDiaClientes: emDia.map((f) => f.cliente.empresa).sort(),
    precisaContatoClientes: precisa.map((f) => f.cliente.empresa).sort(),
  };
}

/**
 * Mesmo cálculo do card "Vencendo" (`itensVencendo` do motor): relógios de
 * Monitoria/Price a menos de `janelaVencendo` dias do prazo, sem reunião futura
 * marcada. Um atendimento com 2 serviços vencendo aparece 2x.
 */
function buscarVencendo(clientes, agenda, acoes, cadencias, now = new Date(), janelaVencendo = 5) {
  const fila = buildFilaCadencia(clientes, agenda, acoes, cadencias, now);
  const itens = itensVencendo(fila, janelaVencendo).map((i) => ({
    id: i.cliente.id, empresa: i.cliente.empresa, servico: i.relogio.servico, diasParaVencer: i.diasParaVencer,
  }));
  return { total: itens.length, itens };
}

/**
 * Porta do bloco "Cobertura da carteira" de `useDashboardData.ts` — %
 * de clientes ativos com ≥1 reunião/relatório/precificação CONCLUÍDO ou
 * REALIZADO nos ÚLTIMOS 2 MESES (mês corrente + anterior). Cliente cujos
 * serviços são todos "independentes" fica fora do denominador. Qualquer
 * mudança aqui precisa ser espelhada lá (e vice-versa).
 */
function buscarCobertura(clientes, agenda, now = new Date()) {
  const precisaDeContato = (c) => {
    const servicos = listaJSON(c.servicos);
    if (servicos.length === 0) return true;
    const independentes = listaJSON(c.servicosIndependentes);
    return servicos.some((s) => !independentes.includes(s));
  };
  const ativos = clientes.filter((c) => isClienteAtivo(c, now) && precisaDeContato(c));
  const ativosIds = new Set(ativos.map((c) => c.id));
  const doisMesesAtras = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inicioMesAtual = new Date(now.getFullYear(), now.getMonth(), 1);

  const atendidosIds = new Set(
    agenda
      .filter((a) => ativosIds.has(a.clientId) && ehEntrega(a))
      .filter((a) => { const d = parseISO(a.date); return !isNaN(d.getTime()) && d >= doisMesesAtras && d < new Date(inicioMesAtual.getFullYear(), inicioMesAtual.getMonth() + 1, 1); })
      .map((a) => a.clientId)
  );

  const cobertos = ativos.filter((c) => atendidosIds.has(c.id)).map((c) => c.empresa).sort();
  const semContato = ativos.filter((c) => !atendidosIds.has(c.id)).map((c) => c.empresa).sort();
  const total = ativos.length;
  return { total, cobertos: cobertos.length, semContato: semContato.length, pct: total > 0 ? Math.round((cobertos.length / total) * 100) : 0, semContatoClientes: semContato };
}

/**
 * Mesmo cálculo do card "Cobertura por Serviço": dos atendimentos que TÊM o
 * relógio do serviço (contratado e não independente), quantos estão no prazo
 * (`relogioNoPrazo`). Independente não entra na base: não tem prazo, e antes
 * aparecia como descoberto para sempre.
 */
function buscarCoberturaServicos(clientes, agenda, acoes, cadencias, now = new Date()) {
  const fila = buildFilaCadencia(clientes, agenda, acoes, cadencias, now);
  return ['Monitoria', 'Price'].map((servico) => {
    const comRelogio = fila
      .map((f) => ({ empresa: f.cliente.empresa, r: f.relogios.find((x) => x.servico === servico) }))
      .filter((x) => x.r);
    const atendidos = comRelogio.filter((x) => relogioNoPrazo(x.r)).length;
    return {
      servico,
      contrataram: comRelogio.length,
      atendidos,
      pct: comRelogio.length > 0 ? Math.round((atendidos / comRelogio.length) * 100) : 0,
      descobertosClientes: comRelogio.filter((x) => !relogioNoPrazo(x.r)).map((x) => x.empresa).sort(),
    };
  });
}

/**
 * Porta do bloco "Alertas de acompanhamento" — clientes ativos sem NENHUM
 * contato/reunião/ação há >= 30 dias (ou nunca), os 6 mais atrasados.
 */
function buscarAlertasSemAcompanhamento(clientes, agenda, acoes, now = new Date()) {
  const LIMIAR_DIAS = 30;
  const ativos = clientes.filter((c) => isClienteAtivo(c, now));
  const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now });

  return ativos
    .map((c) => {
      const uc = ultimaInteracaoMap.get(c.id) ?? null;
      const dias = uc ? differenceInCalendarDays(now, uc) : null;
      return { id: c.id, empresa: c.empresa, ultimoContato: uc ? uc.toISOString() : null, diasSemContato: dias };
    })
    .filter((e) => e.diasSemContato === null || e.diasSemContato >= LIMIAR_DIAS)
    .sort((a, b) => (b.diasSemContato ?? 99999) - (a.diasSemContato ?? 99999))
    .slice(0, 6);
}

module.exports = {
  // Reexportado do motor compartilhado — mesma interface pública de antes,
  // pra nenhum `require('../dominio/cadenciaServico.cjs')` existente precisar mudar.
  isClienteAtivo, buildUltimaInteracaoMap, buildFilaCadencia, classificarCadencia, contatoRecenteNaoRefletido,
  listaJSON, rotuloRelogio,
  // Específico do backend.
  calcularAderencia, buscarVencendo, buscarCobertura, buscarCoberturaServicos, buscarAlertasSemAcompanhamento,
};
