const { differenceInCalendarDays, parseISO } = require('date-fns');

/**
 * Motor de cadência — ÚNICA fonte da regra de "cliente ativo" e da fila de
 * priorização por serviço (Monitoria/Price), compartilhada de verdade entre
 * frontend (Vite/React, `src/utils/cadenciaServico.ts` reexporta daqui) e
 * backend (Express/CommonJS, `server/dominio/cadenciaServico.cjs` reexporta
 * daqui) — pasta `shared/` fora de `src/` e `server/`, `require()`ável
 * direto pelo Node (sem build step) e importável do TS via um `.d.cts`
 * irmão (ver `cadenciaServico.d.cts`; `moduleResolution: "bundler"` do
 * `tsconfig.app.json` resolve isso, confirmado por teste antes desta
 * refatoração).
 *
 * Até 04/09/2026 este motor vivia DUPLICADO nos dois lados (arquivo
 * `.ts` de 395 linhas + porta `.cjs` de 412), com o comentário de topo do
 * lado do backend avisando "DUPLICAÇÃO DELIBERADA... se cadenciaServico.ts
 * mudar a fórmula, esta cópia PRECISA mudar junto". Na prática, 14 dos
 * últimos commits tocaram só a cópia do frontend e 2 só a do backend, e a
 * cobertura de teste também era cruzada (`buildFilaCadencia` só testado no
 * front, `isClienteAtivo` só no back) — nada detectaria uma divergência real
 * até alguém notar o agente de chat e a Visão Geral discordando do mesmo
 * número. Uma divergência REAL já existia: `buildUltimaInteracaoMap` do lado
 * do backend excluía reunião Cancelada/Reagendada da "última interação",
 * enquanto a versão do frontend (`src/utils/ultimaInteracao.ts`) contava de
 * propósito — "cancelar ou reagendar sempre envolveu falar com o cliente".
 * Esta versão única adota o comportamento do frontend (o documentado com a
 * razão de negócio); ver `atualizarAlertasSemAcompanhamento` no backend, que
 * herda a correção.
 *
 * Guarde a regra AQUI de propósito: qualquer TODO/próxima mudança de fórmula
 * de cadência entra neste arquivo, não numa cópia lateral.
 */

const STATUS_EM_ATENDIMENTO = /^(ativo|regular|gratuidade)?$/i;
/** Dias antes de vencer em que já sinalizamos "vencendo" (amarelo). */
const JANELA_VENCENDO = 5;
/** Deslocamento pra jogar itens "cobertos" (já com ação futura marcada) pro
 * fim da fila — não precisam de ação, então nunca competem por prioridade. */
const PESO_NUNCA = 100000;

/**
 * `Clientes.servicos`/`servicosIndependentes`/`EventoAgenda.servicos` podem
 * chegar DUPLAMENTE serializados no backend (achado real, não hipotético): o
 * frontend faz `JSON.stringify` antes de enviar (herdado da era
 * Excel/SheetJS), e o motor SQLite (`dbSqlite.cjs`) faz
 * `JSON.stringify`/`JSON.parse` automático em TODA coluna — o resultado é
 * uma string com o array já serializado dentro (`'["Monitoria"]'`), não o
 * array. No frontend o valor já chega desserializado (array de verdade) —
 * `Array.isArray` cobre os dois casos sem precisar de dois caminhos.
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

/** Cliente "ativo" na carteira: quem está com status "Ativo" OU "Gratuidade"
 * entra nas contas de cadência/Ações/Dashboard. Lista BRANCA (não lista negra
 * de palavras-chave) de propósito — status_cliente é configurável em
 * Configurações, então qualquer valor novo cadastrado ali (Suspenso,
 * Problemas Externos, ou o que vier depois) já fica fora por padrão, sem
 * precisar prever a palavra-chave. Já foi bug real: "Problemas Externos" não
 * batia com nenhuma palavra da lista negra antiga e continuava sendo
 * considerado ativo; e "Atendido pelo Marco" com estado="Ativo" entrava como
 * ativo normal só por checar estado, sem olhar status.
 * "Gratuidade" é caso especial: cliente inadimplente com gratuidade liberada
 * — continua sendo monitorado normalmente (não é como Suspenso).
 * Inclui "ativ" (prefixo) no fallback sem `estado` pro valor LEGADO "Ativo" —
 * `deserializeCliente` (src/api/client.ts) sempre preenche `estado` com um
 * fallback calculado a partir do `status` antigo quando a planilha não tem a
 * coluna `estado` ainda, então normalmente `estado` não chega vazio; sem
 * "ativ" no fallback, cliente legado (status="Ativo", nunca migrado pra
 * "Regular") seria excluído — quase zerou a carteira em produção uma vez. */
/**
 * `now` (opcional, default `new Date()`) SÓ decide a pausa temporária
 * (`pausadoAte`) — a regra de status/estado abaixo não depende de tempo.
 * NUNCA chame isto como `array.filter(isClienteAtivo)` direto: `Array#filter`
 * passa `(elemento, índice, array)`, e o índice cairia bem aqui como `now`
 * (um número, não uma Date) — sempre `array.filter((c) => isClienteAtivo(c))`
 * ou `(c) => isClienteAtivo(c, now)`.
 */
function isClienteAtivo(cliente, now = new Date()) {
  // Pausa temporária (item 5 do levantamento de gaps): independente de
  // status/estado, um cliente com `pausadoAte` no futuro conta como inativo
  // — sem precisar mudar `status` manualmente (que é "situação", um conceito
  // à parte de "está em pausa temporária"). Volta sozinho quando a data
  // passa, sem ação manual nenhuma.
  if (cliente.pausadoAte) {
    // `parseISO`, não `new Date(string)`: uma data pura ("2026-09-10") é lida
    // como meia-noite UTC pelo construtor nativo, escorregando um dia pra
    // trás em fuso negativo (Brasil) — mesma armadilha documentada no
    // CLAUDE.md pra `<input type="date">`. Comparação por DIA calendário
    // (não instante exato): "pausado até 10/09" inclui o dia 10 inteiro,
    // volta a ficar ativo só no dia 11 — mais intuitivo que expirar às
    // 00h00 do próprio dia escolhido.
    const pausadoAte = parseISO(cliente.pausadoAte);
    if (!isNaN(pausadoAte.getTime()) && differenceInCalendarDays(pausadoAte, now) >= 0) return false;
  }
  const status = (cliente.status || '').trim();
  if (cliente.estado) return /^ativo$/i.test(cliente.estado.trim()) && STATUS_EM_ATENDIMENTO.test(status);
  return /^(ativ|gratuidade)/i.test(status);
}

/**
 * Última interação por cliente ("quando falamos com o cliente por último") =
 * evento da agenda de QUALQUER tipo CONCLUÍDO, ou ação concluída.
 *
 * Cancelado e "Agendado" não contam (decisão de 25/09/2026, revertendo a regra
 * antiga de que cancelar envolvia falar com o cliente): na base real, 8 dos 38
 * atendimentos tinham como "último contato" uma reunião ou relatório que não
 * aconteceu, e saíam da lista de sem acompanhamento sem ninguém ter falado com eles.
 *
 * `isRelevant`: filtro opcional por clientId, calculado ANTES do push (evita
 * montar entradas de clientes fora do recorte que ninguém vai usar).
 */
function buildUltimaInteracaoMap(agenda, acoes, opts = {}) {
  const now = opts.now ?? new Date();
  const isRelevant = opts.isRelevant ?? (() => true);
  const m = new Map();
  const push = (cid, d) => {
    if (!isRelevant(cid) || isNaN(d.getTime()) || d > now) return;
    const cur = m.get(cid);
    if (!cur || d > cur) m.set(cid, d);
  };
  agenda.filter(ehConcluido).forEach((a) => push(a.clientId, parseISO(a.date)));
  acoes.filter((a) => a.status === 'concluido').forEach((a) => push(a.clientId, parseISO(a.dueAt || a.updatedAt || a.createdAt)));
  return m;
}

function temServico(c, re, flag) {
  return listaJSON(c.servicos).some((s) => re.test(s)) || Boolean(c[flag]);
}

/** true se o cliente marcou esse serviço como "independente" (faz sozinho,
 * não depende de reunião) — nesse caso o serviço não entra na fila de
 * cadência (não faz sentido cobrar reunião de quem não depende dela). */
function ehIndependente(c, re) {
  return listaJSON(c.servicosIndependentes).some((s) => re.test(s));
}

const naoCancelado = (a) => !/cancel|reagend/i.test(a.status || '');
/** Evento que de fato aconteceu. "Agendado"/"Pendente" no passado não conta. */
const ehConcluido = (a) => /conclu|realiz/i.test(a.status || '');

// Zera o relógio de MONITORIA: reunião ou relatório com Monitoria marcado.
// Evento sem serviço não conta: o serviço é obrigatório e o legado foi
// preenchido; presumir Monitoria escondia qual prazo o evento cumpria.
function ehToqueMonitoria(a) {
  if (!/reuni|relat/i.test(a.type || '')) return false;
  return listaJSON(a.servicos).some((x) => /monitor/i.test(x));
}

// Zera o relógio de PRICE (histórico): reunião OU relatório com serviço Price
// marcado, OU um evento tipo Precificação (precificação avulsa entregue fora
// de reunião — não depende de tag de serviço, o tipo já basta, igual Relatório).
function ehToquePrice(a) {
  if (/precific/i.test(a.type || '')) return true;
  if (!/reuni|relat/i.test(a.type || '')) return false;
  return listaJSON(a.servicos).some((x) => /(price|prec)/i.test(x));
}

/** Próxima data (futura, não cancelada) que bate no MESMO critério `ehToque`
 * usado pro histórico — ou seja, cobertura futura exige um evento do serviço
 * CERTO, igual já valia pro "último". Antes qualquer evento futuro (de
 * qualquer tipo/serviço) cobria TODOS os relógios do cliente — um cliente
 * nunca atendido em Price aparecia "em dia"/"coberto" só por ter uma reunião
 * de Monitoria marcada. Validado contra dados reais (ex.: Ramar Caxias·Price,
 * Comkit·Monitoria — nunca tratados, mas apareciam cobertos por outro serviço). */
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

/**
 * `toquesExtras`: datas extras de "toque" que não vêm de Agenda (hoje: Ações
 * concluídas do mesmo serviço — ex.: registrar uma Ação tipo Price como
 * Concluída, sem necessariamente criar uma Reunião/Relatório na Agenda).
 * Contam só pro histórico ("último"), nunca como cobertura futura — Ação é
 * registro do que já foi feito, não agendamento.
 */
function calcularRelogio(servico, eventos, ehToque, cadencia, now, desde, janelaVencendo = JANELA_VENCENDO, toquesExtras = []) {
  // "Último" = histórico real do serviço: só entrega CONCLUÍDA daquele serviço.
  // Reagendada conta na data nova (o evento é o mesmo, `datasAnteriores` guarda as antigas).
  let ultimo = null;
  for (const a of eventos) {
    if (!ehConcluido(a) || !ehToque(a)) continue;
    const d = parseISO(a.date);
    if (isNaN(d.getTime()) || d > now) continue;
    if (!ultimo || d > ultimo) ultimo = d;
  }
  for (const d of toquesExtras) {
    if (isNaN(d.getTime()) || d > now) continue;
    if (!ultimo || d > ultimo) ultimo = d;
  }
  const proximo = calcularProximoPorServico(eventos, ehToque, now);

  // Status "puro" pela cadência — ignora se já existe agendamento futuro.
  let statusReal, atrasoReal;
  if (!ultimo) {
    // Sem toque: o cadastro vale como ponto de partida (carência de um prazo).
    // Atendimento novo passa por em dia/vencendo e só vira "nunca" quando esse
    // primeiro prazo vence — antes nascia atrasado no dia do cadastro. O atraso
    // em dias reais desde o cadastro também mantém a ordem da fila na mesma
    // escala dos vencidos.
    // Sem data de cadastro (legado) não há carência a contar: é "nunca" já.
    const temCadastro = desde instanceof Date && !isNaN(desde.getTime());
    const referencia = temCadastro ? desde : now;
    atrasoReal = differenceInCalendarDays(now, referencia) - cadencia;
    statusReal = !temCadastro || atrasoReal > 0 ? 'nunca' : atrasoReal > -janelaVencendo ? 'vencendo' : 'em_dia';
  } else {
    atrasoReal = differenceInCalendarDays(now, ultimo) - cadencia;
    statusReal = atrasoReal > 0 ? 'vencido' : atrasoReal > -janelaVencendo ? 'vencendo' : 'em_dia';
  }

  // Status "operacional" — agendamento futuro cobre o relógio (usado pela
  // fila de Ações: já tem ação marcada, não precisa cobrar de novo).
  let status, atraso;
  if (proximo) {
    status = 'coberto';
    atraso = -PESO_NUNCA; // coberto nunca pede ação
  } else {
    status = statusReal;
    atraso = atrasoReal;
  }
  return { servico, cadencia, ultimo, proximo, atraso, status, statusReal, atrasoReal };
}

/** Contato (ou qualquer interação) mais recente que o último toque contado
 * pelos relógios de serviço — sinaliza "já houve ação", mesmo que ela não
 * conte pra cadência oficial de Monitoria/Price (ex.: um Contato leve não
 * reseta o relógio, mas ainda assim já foi feito). Usado pra empurrar o
 * cliente pro fim da própria seção de severidade na fila, e pra destacar
 * visualmente o card (CardCliente). */
function contatoRecenteNaoRefletido(relogios, ultimoContato) {
  if (!ultimoContato) return false;
  const ultimoToqueRelogio = relogios && relogios.length > 0
    ? Math.max(...relogios.map((r) => r.ultimo?.getTime() ?? 0))
    : 0;
  return ultimoContato.getTime() > ultimoToqueRelogio;
}

/** Relógio dentro do prazo ("vencendo" ainda está no prazo). Reunião futura
 * marcada não conta: `statusReal` ignora agendamento. */
const relogioNoPrazo = (r) => r.statusReal === 'em_dia' || r.statusReal === 'vencendo';
/** Atendimento em dia = TODOS os relógios dele no prazo. */
const atendimentoEmDia = (f) => f.relogios.length > 0 && f.relogios.every(relogioNoPrazo);
/** Entrega = Reunião, Relatório ou Precificação concluída — mesma definição em todo card. */
const ehEntrega = (a) => /reuni|relat|precific/i.test(a.type || '') && ehConcluido(a);

/** Relógios a menos de `janela` dias do prazo e sem reunião futura marcada
 * (card "Vencendo", agente e alertas). Um atendimento com 2 serviços vencendo
 * aparece 2x. Mais urgente primeiro. */
function itensVencendo(fila, janela = JANELA_VENCENDO) {
  const itens = [];
  for (const f of fila) {
    for (const r of f.relogios) {
      if (r.proximo || r.atrasoReal > 0 || r.atrasoReal <= -janela) continue;
      itens.push({ cliente: f.cliente, relogio: r, diasParaVencer: -r.atrasoReal });
    }
  }
  return itens.sort((a, b) => a.diasParaVencer - b.diasParaVencer || String(a.cliente.empresa).localeCompare(String(b.cliente.empresa)));
}

const RANK_SEVERIDADE = { vencido: 0, vencendo: 1, em_dia: 2 };
/** Sem dossiê (`undefined`) fica DEPOIS de "baixo" de propósito: "baixo" é um
 * julgamento explícito da IA (leu o histórico e concluiu que está tudo bem),
 * enquanto "sem dossiê" não afirma nada — não faz sentido dar o mesmo peso a
 * "confirmado tranquilo" e "não sabemos". */
const RANK_RISCO = { alto: 0, medio: 1, baixo: 2, undefined: 3 };

/** Classificação do cliente pelo pior relógio — fonte única usada tanto na fila
 * de Acompanhamento (Ações) quanto na escolha de material/mensagem por segmento
 * (antes eram dois cálculos de "saúde do cliente" divergentes, com limiares
 * diferentes). "vencido" cobre também "nunca atendido". */
function classificarCadencia(f) {
  if (f.relogios.some((r) => r.status === 'vencido' || r.status === 'nunca')) return 'vencido';
  if (f.relogios.some((r) => r.status === 'vencendo')) return 'vencendo';
  return 'em_dia';
}

/**
 * Fila de priorização por aderência à cadência de cada serviço. Clientes ativos
 * (fora os do Marco) recebem um "relógio" por serviço contratado (Monitoria/Price);
 * a prioridade é o serviço mais vencido. Ordena do mais urgente para o menos —
 * mas dentro da mesma severidade, quem já teve um contato recente não
 * refletido no relógio (ver `contatoRecenteNaoRefletido`) vai pro fim daquele
 * bloco: já foi tratado, mesmo que a cadência oficial continue vencida.
 *
 * `opts.servico`: restringe a fila a UM serviço — cada cliente entra só com o
 * relógio daquele serviço, e severidade/`precisaAcao`/score passam a olhar
 * apenas para ele. Sem isso, filtrar por "Monitoria" trazia clientes com a
 * Monitoria EM DIA só porque o Price estava vencido: o filtro da página
 * checava apenas se o cliente *possui* o serviço, não se aquele serviço
 * precisa de ação (bug real relatado).
 *
 * `opts.riscoPorCliente`: nível de risco do dossiê do monitorIA
 * (`AnalisesIA.nivelRisco`) por `clientId` — pedido do usuário pra a fila
 * "além das recomendações padrão, considerar a urgência dos dossiês". Entra
 * como DESEMPATE DENTRO do mesmo bloco de severidade (logo depois da
 * severidade, antes de quantidade de serviços ruins): risco alto nunca faz
 * um cliente "em dia" pular na frente de um "vencido" — a cadência (data)
 * continua mandando na severidade; o risco (julgamento da IA) só decide
 * quem vem primeiro DENTRO do mesmo bloco. Opcional: sem passar nada, a
 * ordenação continua idêntica a antes desta função existir.
 */
function buildFilaCadencia(clientes, agenda, acoes, cadencias, now = new Date(), opts = {}) {
  const monDias = Number(cadencias?.monitoria_dias) || 30;
  const priceDias = Number(cadencias?.price_dias) || 15;

  const porCliente = new Map();
  agenda.forEach((a) => {
    if (!porCliente.has(a.clientId)) porCliente.set(a.clientId, []);
    porCliente.get(a.clientId).push(a);
  });

  // Ação tipo 'price' concluída conta como toque de Price mesmo sem uma
  // Reunião/Relatório correspondente na Agenda — ex.: enviar uma precificação
  // registrado só como Ação.
  const acoesPricePorCliente = new Map();
  acoes.forEach((a) => {
    if (a.tipo !== 'price' || a.status !== 'concluido') return;
    const d = parseISO(a.dueAt || a.updatedAt || a.createdAt);
    if (!acoesPricePorCliente.has(a.clientId)) acoesPricePorCliente.set(a.clientId, []);
    acoesPricePorCliente.get(a.clientId).push(d);
  });

  // Ação tipo 'relatorio' concluída TAMBÉM conta como toque de Monitoria —
  // pedido explícito do usuário (caso real: cliente com relatório enviado 4
  // dias antes continuava "vencido" em Monitoria porque só reunião contava).
  // Mesmo tratamento de `acoesPricePorCliente`: só junta o histórico
  // ("último"), nunca cobre o futuro (ver `toquesExtras` em `calcularRelogio`).
  const acoesRelatorioPorCliente = new Map();
  acoes.forEach((a) => {
    if (a.tipo !== 'relatorio' || a.status !== 'concluido') return;
    const d = parseISO(a.dueAt || a.updatedAt || a.createdAt);
    if (!acoesRelatorioPorCliente.has(a.clientId)) acoesRelatorioPorCliente.set(a.clientId, []);
    acoesRelatorioPorCliente.get(a.clientId).push(d);
  });

  const out = [];
  for (const c of clientes) {
    if (!isClienteAtivo(c, now)) continue;
    const evs = porCliente.get(c.id) ?? [];
    // Sem `createdAt` vira Invalid Date de propósito: `calcularRelogio` trata como
    // "sem cadastro conhecido" (nunca atendido), em vez de dar carência a partir de hoje.
    const desde = c.createdAt ? parseISO(c.createdAt) : new Date(NaN);

    const todosRelogios = [];
    if (temServico(c, /monitor/i, 'monitoria') && !ehIndependente(c, /monitor/i)) {
      todosRelogios.push(calcularRelogio('Monitoria', evs, ehToqueMonitoria, monDias, now, desde, JANELA_VENCENDO, acoesRelatorioPorCliente.get(c.id) ?? []));
    }
    if (temServico(c, /(price|prec)/i, 'price') && !ehIndependente(c, /(price|prec)/i)) {
      todosRelogios.push(calcularRelogio('Price', evs, ehToquePrice, priceDias, now, desde, JANELA_VENCENDO, acoesPricePorCliente.get(c.id) ?? []));
    }
    // Recorte por serviço ANTES de derivar score/precisaAcao: tudo o que vem
    // depois (ordenação, agrupamento por severidade, contagem de "precisam de
    // ação", relógios exibidos no card) passa a falar só do serviço pedido.
    const relogios = opts.servico ? todosRelogios.filter((r) => r.servico === opts.servico) : todosRelogios;
    if (relogios.length === 0) continue; // sem serviço cadastrado (ou só independentes) → fora do modelo
    const score = Math.max(...relogios.map((r) => r.atraso));
    const precisaAcao = relogios.some((r) => r.status === 'vencido' || r.status === 'vencendo' || r.status === 'nunca');
    const nivelRisco = opts.riscoPorCliente?.get(c.id);
    out.push({ cliente: c, relogios, score, precisaAcao, nivelRisco });
  }

  const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now });
  // Quantos relógios do cliente pedem ação (vencido/vencendo/nunca) — atrasado
  // em 2 serviços é pior que atrasado em 1, mesmo que o pior atraso (score)
  // dos dois dê um número parecido ou até maior no de 1 só. Checado ANTES do
  // score: sem isso, um cliente com só 1 serviço ruim podia ficar na frente de
  // quem está ruim nos dois só por aquele 1 serviço estar mais atrasado.
  const qtdRuins = (f) => f.relogios.filter((r) => r.status === 'vencido' || r.status === 'vencendo' || r.status === 'nunca').length;
  return out.sort((a, b) => {
    const rankA = RANK_SEVERIDADE[classificarCadencia(a)];
    const rankB = RANK_SEVERIDADE[classificarCadencia(b)];
    if (rankA !== rankB) return rankA - rankB;
    const riscoA = RANK_RISCO[a.nivelRisco];
    const riscoB = RANK_RISCO[b.nivelRisco];
    if (riscoA !== riscoB) return riscoA - riscoB;
    const qtdA = qtdRuins(a);
    const qtdB = qtdRuins(b);
    if (qtdA !== qtdB) return qtdB - qtdA;
    const ultimoA = ultimaInteracaoMap.get(a.cliente.id) ?? null;
    const ultimoB = ultimaInteracaoMap.get(b.cliente.id) ?? null;
    const recA = contatoRecenteNaoRefletido(a.relogios, ultimoA);
    const recB = contatoRecenteNaoRefletido(b.relogios, ultimoB);
    if (recA !== recB) return recA ? 1 : -1;
    // Dentro do mesmo bloco "tem contato recente": compara a data mais recente
    // de cada cliente diretamente entre os dois — quem foi contatado há mais
    // tempo fica primeiro, quem acabou de ser contatado agora vai pro fim.
    // Sem contato recente: mantém o score de cadência (atraso).
    if (recA && recB) return (ultimoA?.getTime() ?? 0) - (ultimoB?.getTime() ?? 0);
    return b.score - a.score;
  });
}

/** Texto curto do relógio para exibir no card. */
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

// Atribuições INDIVIDUAIS de propósito, não um único `module.exports = {...}`
// — o analisador estático de export do Vite (aplicado a `.cjs` fora de
// node_modules, importado com `import { nome } from '...cjs'`) não detectava
// de forma confiável exports dentro de um objeto único, mesmo no formato
// shorthand padrão (bug real: `import { isClienteAtivo } from
// '.../cadenciaServico.cjs'` quebrava só em `npm run dev`, nunca em
// `npm run build` — o build usa Rollup, que analisa diferente). Cada
// `exports.x = x` é reconhecido individualmente, sem essa fragilidade.
exports.STATUS_EM_ATENDIMENTO = STATUS_EM_ATENDIMENTO;
exports.JANELA_VENCENDO = JANELA_VENCENDO;
exports.PESO_NUNCA = PESO_NUNCA;
exports.listaJSON = listaJSON;
exports.isClienteAtivo = isClienteAtivo;
exports.buildUltimaInteracaoMap = buildUltimaInteracaoMap;
exports.temServico = temServico;
exports.ehIndependente = ehIndependente;
exports.naoCancelado = naoCancelado;
exports.ehConcluido = ehConcluido;
exports.ehEntrega = ehEntrega;
exports.relogioNoPrazo = relogioNoPrazo;
exports.atendimentoEmDia = atendimentoEmDia;
exports.itensVencendo = itensVencendo;
exports.ehToqueMonitoria = ehToqueMonitoria;
exports.ehToquePrice = ehToquePrice;
exports.calcularProximoPorServico = calcularProximoPorServico;
exports.calcularRelogio = calcularRelogio;
exports.contatoRecenteNaoRefletido = contatoRecenteNaoRefletido;
exports.classificarCadencia = classificarCadencia;
exports.buildFilaCadencia = buildFilaCadencia;
exports.rotuloRelogio = rotuloRelogio;
