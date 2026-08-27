const { differenceInCalendarDays, parseISO } = require('date-fns');

/**
 * Porta pro backend de `src/utils/cadenciaServico.ts` + `isClienteAtivo`
 * (`src/utils/formatters.ts`) + `buildUltimaInteracaoMap`
 * (`src/utils/ultimaInteracao.ts`) — só o necessário pra ferramenta
 * `buscar_fila_priorizacao` (`server/ia/tools.cjs`) responder "% em dia"
 * sem o agente inventar o número (era recusado antes por não existir
 * ferramenta nenhuma pra essa métrica).
 *
 * DUPLICAÇÃO DELIBERADA, não acidental: o app é Vite/React (frontend) +
 * Express/CommonJS (backend), sem um pacote compartilhado entre os dois hoje
 * — importar `.ts` de dentro de `.cjs` não é trivial nesse setup. Mesmo
 * padrão já usado em `server/routes/atualizacao.cjs` (`versaoMaiorQue`
 * duplicada de `launcher/atualizar.cjs`, comentário lá explica o motivo).
 *
 * Se `cadenciaServico.ts` mudar a fórmula de aderência, esta cópia PRECISA
 * mudar junto — senão o agente de chat e a Visão Geral divergem no mesmo
 * número, o que é pior do que o agente recusar a pergunta.
 */

const STATUS_EM_ATENDIMENTO = /^(ativo|regular|gratuidade)?$/i;
const JANELA_VENCENDO = 5;
const PESO_NUNCA = 100000;

/**
 * `Clientes.servicos`/`servicosIndependentes` chegam DUPLAMENTE serializados
 * em produção hoje (achado real, não hipotético): o frontend faz
 * `JSON.stringify` antes de enviar (herdado da era Excel/SheetJS), e o motor
 * SQLite (`dbSqlite.cjs`) faz `JSON.stringify`/`JSON.parse` automático em
 * TODA coluna — o resultado é uma string com o array já serializado dentro
 * (`'["Monitoria"]'`), não o array. O frontend disfarça isso silenciosamente
 * (`parseListaJSON` em `src/api/client.ts` reprocessa a string); esta cópia
 * do backend não tinha essa camada e quebrava com "some is not a function" na
 * maioria dos clientes reais. Mesmo remendo aqui — a causa raiz (dupla
 * serialização) é maior e fica pra outra hora, não pra esta função.
 */
function listaJSON(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isClienteAtivo(cliente) {
  const status = (cliente.status || '').trim();
  if (cliente.estado) return /^ativo$/i.test(cliente.estado.trim()) && STATUS_EM_ATENDIMENTO.test(status);
  return /^(ativ|gratuidade)/i.test(status);
}

function buildUltimaInteracaoMap(agenda, acoes, opts = {}) {
  const now = opts.now ?? new Date();
  const m = new Map();
  const push = (cid, d) => {
    if (isNaN(d.getTime()) || d > now) return;
    const cur = m.get(cid);
    if (!cur || d > cur) m.set(cid, d);
  };
  agenda.filter((a) => !/cancel|reagend/i.test(a.status || '')).forEach((a) => push(a.clientId, parseISO(a.date)));
  acoes.filter((a) => a.status === 'concluido').forEach((a) => push(a.clientId, parseISO(a.dueAt || a.updatedAt || a.createdAt)));
  return m;
}

function temServico(c, re, flag) {
  return listaJSON(c.servicos).some((s) => re.test(s)) || Boolean(c[flag]);
}
function ehIndependente(c, re) {
  return listaJSON(c.servicosIndependentes).some((s) => re.test(s));
}
const naoCancelado = (a) => !/cancel|reagend/i.test(a.status || '');
function ehToqueMonitoria(a) {
  if (!/reuni/i.test(a.type || '')) return false;
  const s = listaJSON(a.servicos);
  return s.length === 0 || s.some((x) => /monitor/i.test(x));
}
function ehToquePrice(a) {
  if (/precific/i.test(a.type || '')) return true;
  if (!/reuni|relat/i.test(a.type || '')) return false;
  return listaJSON(a.servicos).some((x) => /(price|prec)/i.test(x));
}

function calcularProximoPorServico(eventos, ehToque, now) {
  let proximo = null;
  for (const a of eventos) {
    if (!naoCancelado(a) || !ehToque(a)) continue;
    const d = parseISO(a.date);
    if (isNaN(d.getTime()) || d <= now) continue;
    if (!proximo || d < proximo) proximo = d;
  }
  return proximo;
}

function calcularRelogio(servico, eventos, ehToque, cadencia, now, desde, janelaVencendo = JANELA_VENCENDO, toquesExtras = []) {
  let ultimo = null;
  for (const a of eventos) {
    if (!naoCancelado(a) || !ehToque(a)) continue;
    const d = parseISO(a.date);
    if (isNaN(d.getTime()) || d > now) continue;
    if (!ultimo || d > ultimo) ultimo = d;
  }
  for (const d of toquesExtras) {
    if (isNaN(d.getTime()) || d > now) continue;
    if (!ultimo || d > ultimo) ultimo = d;
  }
  const proximo = calcularProximoPorServico(eventos, ehToque, now);

  let statusReal, atrasoReal;
  if (!ultimo) {
    statusReal = 'nunca';
    const referencia = !isNaN(desde.getTime()) ? desde : now;
    atrasoReal = differenceInCalendarDays(now, referencia) - cadencia;
  } else {
    atrasoReal = differenceInCalendarDays(now, ultimo) - cadencia;
    statusReal = atrasoReal > 0 ? 'vencido' : atrasoReal > -janelaVencendo ? 'vencendo' : 'em_dia';
  }

  let status, atraso;
  if (proximo) {
    status = 'coberto';
    atraso = -PESO_NUNCA;
  } else {
    status = statusReal;
    atraso = atrasoReal;
  }
  return { servico, cadencia, ultimo, proximo, atraso, status, statusReal, atrasoReal };
}

function contatoRecenteNaoRefletido(relogios, ultimoContato) {
  if (!ultimoContato) return false;
  const ultimoToqueRelogio = relogios && relogios.length > 0
    ? Math.max(...relogios.map((r) => r.ultimo?.getTime() ?? 0))
    : 0;
  return ultimoContato.getTime() > ultimoToqueRelogio;
}

const RANK_SEVERIDADE = { vencido: 0, vencendo: 1, em_dia: 2 };

function classificarCadencia(f) {
  if (f.relogios.some((r) => r.status === 'vencido' || r.status === 'nunca')) return 'vencido';
  if (f.relogios.some((r) => r.status === 'vencendo')) return 'vencendo';
  return 'em_dia';
}

function buildFilaCadencia(clientes, agenda, acoes, cadencias, now = new Date(), opts = {}) {
  const monDias = Number(cadencias?.monitoria_dias) || 30;
  const priceDias = Number(cadencias?.price_dias) || 30;

  const porCliente = new Map();
  agenda.forEach((a) => {
    if (!porCliente.has(a.clientId)) porCliente.set(a.clientId, []);
    porCliente.get(a.clientId).push(a);
  });

  const acoesPricePorCliente = new Map();
  acoes.forEach((a) => {
    if (a.tipo !== 'price' || a.status !== 'concluido') return;
    const d = parseISO(a.dueAt || a.updatedAt || a.createdAt);
    if (!acoesPricePorCliente.has(a.clientId)) acoesPricePorCliente.set(a.clientId, []);
    acoesPricePorCliente.get(a.clientId).push(d);
  });
  const acoesRelatorioPorCliente = new Map();
  acoes.forEach((a) => {
    if (a.tipo !== 'relatorio' || a.status !== 'concluido') return;
    const d = parseISO(a.dueAt || a.updatedAt || a.createdAt);
    if (!acoesRelatorioPorCliente.has(a.clientId)) acoesRelatorioPorCliente.set(a.clientId, []);
    acoesRelatorioPorCliente.get(a.clientId).push(d);
  });

  const out = [];
  for (const c of clientes) {
    if (!isClienteAtivo(c)) continue;
    const evs = porCliente.get(c.id) ?? [];
    const desde = c.createdAt ? parseISO(c.createdAt) : now;

    const todosRelogios = [];
    if (temServico(c, /monitor/i, 'monitoria') && !ehIndependente(c, /monitor/i)) {
      todosRelogios.push(calcularRelogio('Monitoria', evs, ehToqueMonitoria, monDias, now, desde, JANELA_VENCENDO, acoesRelatorioPorCliente.get(c.id) ?? []));
    }
    if (temServico(c, /(price|prec)/i, 'price') && !ehIndependente(c, /(price|prec)/i)) {
      todosRelogios.push(calcularRelogio('Price', evs, ehToquePrice, priceDias, now, desde, JANELA_VENCENDO, acoesPricePorCliente.get(c.id) ?? []));
    }
    const relogios = opts.servico ? todosRelogios.filter((r) => r.servico === opts.servico) : todosRelogios;
    if (relogios.length === 0) continue;
    const score = Math.max(...relogios.map((r) => r.atraso));
    const precisaAcao = relogios.some((r) => r.status === 'vencido' || r.status === 'vencendo' || r.status === 'nunca');
    out.push({ cliente: c, relogios, score, precisaAcao });
  }

  const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now });
  const qtdRuins = (f) => f.relogios.filter((r) => r.status === 'vencido' || r.status === 'vencendo' || r.status === 'nunca').length;
  return out.sort((a, b) => {
    const rankA = RANK_SEVERIDADE[classificarCadencia(a)];
    const rankB = RANK_SEVERIDADE[classificarCadencia(b)];
    if (rankA !== rankB) return rankA - rankB;
    const qtdA = qtdRuins(a);
    const qtdB = qtdRuins(b);
    if (qtdA !== qtdB) return qtdB - qtdA;
    const ultimoA = ultimaInteracaoMap.get(a.cliente.id) ?? null;
    const ultimoB = ultimaInteracaoMap.get(b.cliente.id) ?? null;
    const recA = contatoRecenteNaoRefletido(a.relogios, ultimoA);
    const recB = contatoRecenteNaoRefletido(b.relogios, ultimoB);
    if (recA !== recB) return recA ? 1 : -1;
    if (recA && recB) return (ultimoA?.getTime() ?? 0) - (ultimoB?.getTime() ?? 0);
    return b.score - a.score;
  });
}

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

/** Porta de `rotuloRelogio` (`cadenciaServico.ts`) — texto curto do relógio,
 *  usado como "motivo" nas sugestões de encaixe. */
function rotuloRelogio(r) {
  const curto = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  switch (r.status) {
    case 'coberto': return `${r.servico} coberta · ${r.proximo ? curto(r.proximo) : ''}`.trim();
    case 'nunca': return `${r.servico}: nunca atendido`;
    case 'vencido': return `${r.servico} vencida há ${r.atraso}d`;
    case 'vencendo': return `${r.servico} vence em ${Math.max(0, -r.atraso)}d`;
    default: return `${r.servico} em dia`;
  }
}

function relatorioCadenciaEmDias(rc, fallbackDias) {
  if (!rc || !rc.numero || !rc.unidade) return fallbackDias;
  const n = rc.numero;
  switch (rc.unidade) {
    case 'dia': return n;
    case 'semana': return n * 7;
    case 'mes': return n * 30;
    case 'trimestre': return n * 90;
    case 'semestre': return n * 180;
    case 'personalizado': return n * 7;
    default: return fallbackDias;
  }
}
function ehToqueRelatorio(a) { return /relat/i.test(a.type || ''); }

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
    if (!isClienteAtivo(c)) continue;
    const evs = porCliente.get(c.id) ?? [];
    const desde = c.createdAt ? parseISO(c.createdAt) : now;

    const relogios = [];
    if (temServico(c, /monitor/i, 'monitoria') && !ehIndependente(c, /monitor/i)) relogios.push(calcularRelogio('Monitoria', evs, ehToqueMonitoria, monDias, now, desde, janelaVencendo));
    if (temServico(c, /(price|prec)/i, 'price') && !ehIndependente(c, /(price|prec)/i)) relogios.push(calcularRelogio('Price', evs, ehToquePrice, priceDias, now, desde, janelaVencendo));
    relogios.push(calcularRelogio('Relatório', evs, ehToqueRelatorio, relatorioCadenciaEmDias(c.relatorioCadencia, relatorioDiasPadrao), now, desde, janelaVencendo));

    for (const r of relogios) {
      if (r.status !== 'vencendo') continue;
      itens.push({ empresa: c.empresa, servico: r.servico, diasParaVencer: Math.max(0, -r.atraso) });
    }
  }
  itens.sort((a, b) => a.diasParaVencer - b.diasParaVencer || a.empresa.localeCompare(b.empresa));
  return { total: itens.length, itens };
}

/**
 * Porta do bloco "Cobertura da carteira" de `useDashboardData.ts` — %
 * de clientes ativos com ≥1 reunião/relatório realizado nos ÚLTIMOS 2 MESES
 * (mês corrente + anterior). Cancelado/reagendado não conta.
 */
function buscarCobertura(clientes, agenda, now = new Date()) {
  const ativos = clientes.filter(isClienteAtivo);
  const ativosIds = new Set(ativos.map((c) => c.id));
  const doisMesesAtras = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inicioMesAtual = new Date(now.getFullYear(), now.getMonth(), 1);

  const atendidosIds = new Set(
    agenda
      .filter((a) => ativosIds.has(a.clientId) && /reuni|relat/i.test(a.type || '') && !/cancel|reagend/i.test(a.status || ''))
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
  const ativos = clientes.filter(isClienteAtivo);
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
  const ativos = clientes.filter(isClienteAtivo);
  const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now });

  return ativos
    .map((c) => {
      const uc = ultimaInteracaoMap.get(c.id) ?? null;
      const dias = uc ? differenceInCalendarDays(now, uc) : null;
      return { empresa: c.empresa, ultimoContato: uc ? uc.toISOString() : null, diasSemContato: dias };
    })
    .filter((e) => e.diasSemContato === null || e.diasSemContato >= LIMIAR_DIAS)
    .sort((a, b) => (b.diasSemContato ?? 99999) - (a.diasSemContato ?? 99999))
    .slice(0, 6);
}

module.exports = {
  isClienteAtivo, buildUltimaInteracaoMap, buildFilaCadencia, classificarCadencia, contatoRecenteNaoRefletido,
  calcularAderencia, listaJSON, buscarVencendo, buscarCobertura, buscarCoberturaServicos, buscarAlertasSemAcompanhamento,
  rotuloRelogio,
};
