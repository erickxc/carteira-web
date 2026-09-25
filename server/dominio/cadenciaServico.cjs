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
  temServico, ehIndependente, ehToqueMonitoria, ehToquePrice, calcularRelogio, relatorioCadenciaEmDias,
} = motor;

function ehToqueRelatorio(a) { return /relat/i.test(a.type || ''); }

/**
 * Mesmo cálculo do card "Aderência" da Visão Geral
 * (`src/hooks/useDashboardData.ts`, `aderencia` useMemo) — é o número que
 * responde literalmente "quantos % estão em dia". "Todos" (sem `servico`) é
 * PERMISSIVO: 1 serviço em_dia OU vencendo já conta como em dia no resumo
 * geral; filtrado por serviço é ESTRITO (só em_dia de verdade).
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
    const emDia = opts.servico
      ? rels.some((r) => r.statusReal === 'em_dia')
      : rels.some((r) => r.statusReal === 'em_dia' || r.statusReal === 'vencendo');
    if (emDia) return 'em_dia';
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
  const pesoContatoRecente = Math.min(100, Math.max(0, Number(cadencias?.peso_contato_recente) || 0)) / 100;
  const pct = total > 0 ? Math.round(((emDia.length + contatoRecente.length * pesoContatoRecente) / total) * 100) : 0;

  return {
    total, pct,
    emDia: emDia.length, agendaMarcada: agendaMarcada.length, contatoRecente: contatoRecente.length, precisaContato: precisa.length,
    emDiaClientes: emDia.map((f) => f.cliente.empresa).sort(),
    precisaContatoClientes: precisa.map((f) => f.cliente.empresa).sort(),
  };
}

/**
 * Porta de `buildVencendoDashboard` (`cadenciaServico.ts`) — cálculo PRÓPRIO
 * do card "Vencendo" (janela de 5 dias antes do vencimento), diferente de
 * `buildFilaCadencia`: aqui TODO cliente ativo ganha um relógio de Relatório
 * também, não só Monitoria/Price. Devolve 1 item por serviço vencendo (um
 * cliente com 2 serviços vencendo aparece 2x), mais urgente primeiro.
 */
function buscarVencendo(clientes, agenda, cadencias, now = new Date(), janelaVencendo = 5) {
  const monDias = Number(cadencias?.monitoria_dias) || 30;
  const priceDias = Number(cadencias?.price_dias) || 30;
  const relatorioDiasPadrao = Number(cadencias?.relatorio_dias) || 45;

  const porCliente = new Map();
  agenda.forEach((a) => {
    if (!porCliente.has(a.clientId)) porCliente.set(a.clientId, []);
    porCliente.get(a.clientId).push(a);
  });

  const itens = [];
  for (const c of clientes) {
    if (!isClienteAtivo(c, now)) continue;
    const evs = porCliente.get(c.id) ?? [];
    const desde = c.createdAt ? parseISO(c.createdAt) : now;

    const relogios = [];
    if (temServico(c, /monitor/i, 'monitoria') && !ehIndependente(c, /monitor/i)) relogios.push(calcularRelogio('Monitoria', evs, ehToqueMonitoria, monDias, now, desde, janelaVencendo));
    if (temServico(c, /(price|prec)/i, 'price') && !ehIndependente(c, /(price|prec)/i)) relogios.push(calcularRelogio('Price', evs, ehToquePrice, priceDias, now, desde, janelaVencendo));
    relogios.push(calcularRelogio('Relatório', evs, ehToqueRelatorio, relatorioCadenciaEmDias(c.relatorioCadencia, relatorioDiasPadrao), now, desde, janelaVencendo));

    for (const r of relogios) {
      if (r.status !== 'vencendo') continue;
      itens.push({ id: c.id, empresa: c.empresa, servico: r.servico, diasParaVencer: Math.max(0, -r.atraso) });
    }
  }
  itens.sort((a, b) => a.diasParaVencer - b.diasParaVencer || a.empresa.localeCompare(b.empresa));
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
      .filter((a) => ativosIds.has(a.clientId) && /reuni|relat|precific/i.test(a.type || '') && /conclu|realiz/i.test(a.status || ''))
      .filter((a) => { const d = parseISO(a.date); return !isNaN(d.getTime()) && d >= doisMesesAtras && d < new Date(inicioMesAtual.getFullYear(), inicioMesAtual.getMonth() + 1, 1); })
      .map((a) => a.clientId)
  );

  const cobertos = ativos.filter((c) => atendidosIds.has(c.id)).map((c) => c.empresa).sort();
  const semContato = ativos.filter((c) => !atendidosIds.has(c.id)).map((c) => c.empresa).sort();
  const total = ativos.length;
  return { total, cobertos: cobertos.length, semContato: semContato.length, pct: total > 0 ? Math.round((cobertos.length / total) * 100) : 0, semContatoClientes: semContato };
}

/**
 * Porta do card "Serviços" — dos clientes que CONTRATARAM cada serviço,
 * quantos foram atendidos (reunião/relatório concluído tratando aquele
 * serviço) nos últimos 30 dias. Responde "quem contratou e não está sendo
 * atendido", não "dos atendidos quantos tinham o serviço" (esse segundo jeito
 * de calcular dá um número sempre alto e não aponta ação).
 */
function buscarCoberturaServicos(clientes, agenda, now = new Date()) {
  const JANELA = 30;
  const ativos = clientes.filter((c) => isClienteAtivo(c, now));
  const eventoRealizado = (a) => /reuni|relat/i.test(a.type || '') && /conclu|realiz/i.test(a.status || '');
  const temServicoPrice = (a) => listaJSON(a.servicos).some((s) => /(price|prec)/i.test(s));
  const temServicoMonitoria = (a) => /monitor/i.test(listaJSON(a.servicos).join(' ')) || (/reuni/i.test(a.type || '') && !temServicoPrice(a));
  const foiAtendido = (c, pred) =>
    /^(regular|gratuidade|ativo)$/i.test((c.status || '').trim()) && agenda.some((a) => {
      if (a.clientId !== c.id || !eventoRealizado(a) || !pred(a)) return false;
      const d = parseISO(a.date);
      const dias = differenceInCalendarDays(now, d);
      return !isNaN(d.getTime()) && dias >= 0 && dias <= JANELA;
    });

  const defs = [
    { label: 'Monitoria', re: /monitor/i, flag: 'monitoria', pred: temServicoMonitoria },
    { label: 'Price', re: /(price|prec)/i, flag: 'price', pred: temServicoPrice },
  ];
  return defs.map((d) => {
    const contrataram = ativos.filter((c) => temServico(c, d.re, d.flag));
    const cobertos = contrataram.filter((c) => foiAtendido(c, d.pred));
    const descobertos = contrataram.filter((c) => !foiAtendido(c, d.pred)).map((c) => c.empresa).sort();
    return {
      servico: d.label,
      contrataram: contrataram.length,
      atendidos: cobertos.length,
      pct: contrataram.length > 0 ? Math.round((cobertos.length / contrataram.length) * 100) : 0,
      descobertosClientes: descobertos,
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
