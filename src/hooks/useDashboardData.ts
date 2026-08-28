import { useMemo, useState } from 'react';
import {
  addDays, differenceInCalendarDays, eachMonthOfInterval, format, isSameMonth,
  max as maxDate, min as minDate, parseISO, startOfMonth, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCarteira } from '../context/CarteiraContext';
import { usePersistedState } from './usePersistedState';
import { isClienteAtivo } from '../utils/formatters';
import { buildUltimaInteracaoMap } from '../utils/ultimaInteracao';
import { buildFilaCadencia, buildVencendoDashboard, contatoRecenteNaoRefletido, type ServicoCad } from '../utils/cadenciaServico';
import { mesesComDados } from '../utils/periodo';
import type { Cliente, EventoAgenda } from '../types';

const FOLLOW_UP_THRESHOLD_DAYS = 30;

/**
 * Toda a camada de dados da Visão Geral (filtros + cálculos derivados) — a
 * página só monta a UI a partir do que este hook devolve. Separado do
 * DashboardPage.tsx pra não misturar "o que calcular" com "como desenhar".
 */
export function useDashboardData() {
  // `filtroMonitor` vem do Context — é o filtro GLOBAL ("quem sou eu"),
  // compartilhado com o header e com o monitorIA, não mais local desta tela.
  const { clientes, agenda, acoes, lembretes, cadencias, filtroMonitor, setFiltroMonitor, monitoresDisponiveis } = useCarteira();
  const [filtroTipo, setFiltroTipo] = usePersistedState<string>('filtro:dash:tipo', 'Todos');
  const [filtroTipoEvento, setFiltroTipoEvento] = usePersistedState<string>('filtro:dash:tipoEvento', 'Todos');
  const [filtroServicoAderencia, setFiltroServicoAderencia] = usePersistedState<ServicoCad | 'Todos'>('filtro:dash:servicoAderencia', 'Todos');
  const [filtroServicoVencendo, setFiltroServicoVencendo] = usePersistedState<ServicoCad | 'Todos'>('filtro:dash:servicoVencendo', 'Todos');

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const periodo = new Date(ano, mes, 1);
  const periodoAnterior = subMonths(periodo, 1);

  // Opções de filtro derivadas da base (não mostra opção que não existe nos dados).
  const tiposEventoDisponiveis = useMemo(
    () => ['Todos', ...[...new Set(agenda.map((a) => a.type).filter(Boolean))].sort()],
    [agenda]
  );

  // Toda a operação considera apenas clientes ATIVOS (exclui suspensos), com os
  // filtros globais de Monitor (carteira) e Tipo de evento aplicados em cascata.
  const ativos = useMemo(
    () => clientes.filter((c) => isClienteAtivo(c) && (filtroMonitor === 'Todos' || c.monitor === filtroMonitor)),
    [clientes, filtroMonitor]
  );
  const ativosIds = useMemo(() => new Set(ativos.map((c) => c.id)), [ativos]);
  const agendaAtiva = useMemo(
    () => agenda.filter((a) => ativosIds.has(a.clientId) && (filtroTipoEvento === 'Todos' || a.type === filtroTipoEvento)),
    [agenda, ativosIds, filtroTipoEvento]
  );
  // Variantes só com o filtro de Monitor (sem o de Tipo de evento) — pros
  // cards que precisam de todos os tipos de evento/ação de um monitor
  // (AtendimentoCard, RecuperadosCard), não só do subconjunto que
  // `agendaAtiva` respeita quando o filtro de Tipo de evento também está ativo.
  const agendaPorMonitor = useMemo(
    () => agenda.filter((a) => ativosIds.has(a.clientId)),
    [agenda, ativosIds]
  );
  const acoesPorMonitor = useMemo(
    () => acoes.filter((a) => ativosIds.has(a.clientId)),
    [acoes, ativosIds]
  );

  // Última interação por cliente ativo = reuniões passadas + AÇÕES concluídas.
  // É isto que "acompanhamento" considera — registrar uma ação (Contato/Relatório/
  // Price) conta como contato, não só reunião.
  const ultimaInteracao = useMemo(
    () => buildUltimaInteracaoMap(agendaAtiva, acoes, { now: hoje, isRelevant: (cid) => ativosIds.has(cid) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaAtiva, acoes, ativosIds]
  );

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>([hoje.getFullYear()]);
    agendaAtiva.forEach((a) => { const d = parseISO(a.date); if (!isNaN(d.getTime())) anos.add(d.getFullYear()); });
    return [...anos].sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaAtiva]);

  // Só os meses que existem no ano escolhido (+ o mês corrente): o filtro
  // listava os 12 sempre, e escolher um mês anterior ao início da base só
  // mostrava tela vazia.
  const mesesDisponiveis = useMemo(
    () => mesesComDados(agendaAtiva.map((a) => a.date), ano, hoje),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaAtiva, ano]
  );

  // Base de REUNIÕES (só tipo Reunião) de clientes ativos — usada tanto nos KPIs
  // de reunião quanto no gráfico "Reuniões por Mês", pra baterem entre si. NÃO
  // segue o filtro "Todos os tipos" do topo: os cards dizem "Reuniões", então
  // sempre contam só reunião (não contato/ligação/relatório).
  const reunioesAtivas = useMemo(
    () => agenda.filter((a) => ativosIds.has(a.clientId) && /reuni/i.test(a.type || '')),
    [agenda, ativosIds]
  );

  // CONCLUÍDAS = reuniões que aconteceram (status Concluído OU Realizado — os
  // dois significam "feito"). O dashboard conta SÓ concluídas; agendadas entram
  // como projeção à parte.
  const concluida = (a: EventoAgenda) => /conclu|realiz/i.test(a.status || '');
  // "Agendadas no mês" = toda reunião do mês que não foi cancelada/reagendada
  // (Agendado, Pendente, qualquer status novo que apareça — E também as já
  // Concluídas, a pedido: esse card mostra o total de reuniões do mês que
  // "aconteceram ou vão acontecer", não só a projeção do que falta). Antes
  // era só `/^agend/` (status literal "Agendado"), o que deixava de fora tanto
  // "Pendente" (status novo) quanto as já concluídas.
  const agendada = (a: EventoAgenda) => !/cancel|reagend/i.test(a.status || '');
  // Versão EXCLUSIVA (sem concluída) — usada só na projeção do gráfico, que
  // soma `concluídas + isso`. Usar `agendada` ali contaria a concluída 2x
  // (bug real: card certo em 28, gráfico mostrando 42 no mesmo mês).
  const planejadaNaoConcluida = (a: EventoAgenda) => agendada(a) && !concluida(a);

  // --- KPIs (escopo do período, base de ativos) ---
  const reunioesConcluidasMes = reunioesAtivas.filter((a) => concluida(a) && isSameMonth(parseISO(a.date), periodo)).length;
  // Comparação justa: se o período visto é o mês corrente (ainda em andamento),
  // o mês anterior só conta até o mesmo dia (ex.: hoje é 21/jul → conta jun até
  // o dia 21) — senão um mês completo vs um mês pela metade sempre "cairia".
  const diaCorte = isSameMonth(periodo, hoje) ? hoje.getDate() : new Date(ano, mes + 1, 0).getDate();
  const reunioesConcluidasMesAnterior = reunioesAtivas.filter((a) => {
    const d = parseISO(a.date);
    return concluida(a) && isSameMonth(d, periodoAnterior) && d.getDate() <= diaCorte;
  }).length;
  const variacao = reunioesConcluidasMesAnterior === 0
    ? (reunioesConcluidasMes > 0 ? 100 : 0)
    : Math.round(((reunioesConcluidasMes - reunioesConcluidasMesAnterior) / reunioesConcluidasMesAnterior) * 100);
  // Agendadas no mês = projeção (planejadas, ainda não concluídas).
  const reunioesAgendadasMes = reunioesAtivas.filter((a) => agendada(a) && isSameMonth(parseISO(a.date), periodo)).length;
  // Reagendamentos no período (sinal de instabilidade — cancelamento não conta).
  // Duas formas de "reagendar" no app, contadas as duas aqui: (1) status
  // "Reagendado" (desfecho final — o evento original morre, sai do calendário
  // por padrão) e (2) o contador `reagendamentos` (arrastar/mover a MESMA
  // reunião pra outro dia via drag-and-drop ou o botão de reagendar — o evento
  // continua vivo, só muda de data). Antes só contava a (1); como (2) é o jeito
  // mais comum de remarcar no dia a dia, o card ficava sempre zerado/errado.
  const reagendamentosMes = reunioesAtivas.filter((a) =>
    (/reagend/i.test(a.status || '') || (a.reagendamentos ?? 0) > 0) && isSameMonth(parseISO(a.date), periodo)
  ).length;

  // --- Linha: REUNIÕES CONCLUÍDAS por mês (bate com o card). A linha sólida é
  // o realizado; a projeção (concluídas + agendadas do mês) vira ponto pontilhado. ---
  const { linhaPorMes, linhaHighlight } = useMemo(() => {
    const datas = reunioesAtivas.map((a) => parseISO(a.date)).filter((d) => !isNaN(d.getTime()));
    if (datas.length === 0) return { linhaPorMes: [], linhaHighlight: -1 };
    const inicio = startOfMonth(minDate(datas));
    const fim = startOfMonth(maxDate([...datas, hoje, periodo]));
    let meses = eachMonthOfInterval({ start: inicio, end: fim });
    if (meses.length > 24) meses = meses.slice(meses.length - 24); // teto de segurança
    const pts = meses.map((m, i) => {
      const doMes = reunioesAtivas.filter((a) => isSameMonth(parseISO(a.date), m));
      const concl = doMes.filter(concluida).length;
      const proj = concl + doMes.filter(planejadaNaoConcluida).length; // realizado + planejado
      return {
        label: m.getMonth() === 0 || i === 0 ? format(m, 'MMM/yy', { locale: ptBR }).replace('.', '') : format(m, 'MMM', { locale: ptBR }).replace('.', ''),
        full: format(m, "MMMM 'de' yyyy", { locale: ptBR }),
        value: concl,
        projecao: proj,
      };
    });
    const hi = meses.findIndex((m) => isSameMonth(m, periodo));
    return { linhaPorMes: pts, linhaHighlight: hi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunioesAtivas, mes, ano]);

  // --- COBERTURA por serviço: dos clientes que CONTRATARAM cada serviço,
  // quantos foram atendidos nos últimos 30 dias.
  //
  // Antes era o inverso (dos atendidos, quantos tinham o serviço), o que dava
  // 97% em Monitoria e informava pouco: quase todo cliente da carteira tem
  // Monitoria, então o número fica alto por definição e não aponta ação. A
  // leitura de cobertura responde "quem contratou e não está sendo atendido" —
  // com os mesmos dados dava 90%, revelando 4 clientes descobertos.
  //
  // "Atendido" = cliente ativo com reunião ou relatório realizado nos últimos
  // 30 dias, com o serviço correspondente tratado no evento, E status Regular
  // ou Gratuidade. Ações genéricas, contatos e ligações não cobrem um serviço.
  const { servicosDist, totalAtendidos } = useMemo(() => {
    const JANELA = 30;
    const temProduto = (c: Cliente, re: RegExp, flag: keyof Cliente) =>
      (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[flag]);

    // Top clientes por SERVIÇO tratado. Precificação virou serviço numa reunião
    // (não é mais tipo de evento), então Price = reunião com serviço Precificação;
    // Monitoria = reunião sem Price (a reunião comum é de monitoria).
    const eventoRealizado = (a: EventoAgenda) =>
      /reuni|relat/i.test(a.type || '') && /conclu|realiz/i.test(a.status || '');
    const temServicoPrice = (a: EventoAgenda) => (a.servicos ?? []).some((s) => /(price|prec)/i.test(s));
    const temServicoMonitoria = (a: EventoAgenda) =>
      /monitor/i.test((a.servicos ?? []).join(' ')) ||
      (/reuni/i.test(a.type || '') && !temServicoPrice(a));
    const foiAtendido = (c: Cliente, pred: (a: EventoAgenda) => boolean) =>
      // `Ativo` é o status legado da base; equivale a Regular até o cliente
      // ser salvo novamente no novo modelo de Estado + Status.
      /^(regular|gratuidade|ativo)$/i.test((c.status || '').trim()) && agendaAtiva.some((a) => {
        if (a.clientId !== c.id || !eventoRealizado(a) || !pred(a)) return false;
        const d = parseISO(a.date);
        return !isNaN(d.getTime()) && differenceInCalendarDays(hoje, d) >= 0 && differenceInCalendarDays(hoje, d) <= JANELA;
      });
    const total = ativos.filter((c) => foiAtendido(c, () => true)).length;
    function topClientes(pred: (a: EventoAgenda) => boolean) {
      const contagem = new Map<string, number>();
      agendaAtiva.forEach((a) => {
        if (!eventoRealizado(a) || !pred(a)) return;
        const d = parseISO(a.date);
        const dias = differenceInCalendarDays(hoje, d);
        if (isNaN(d.getTime()) || dias < 0 || dias > JANELA) return;
        contagem.set(a.clientId, (contagem.get(a.clientId) ?? 0) + 1);
      });
      return [...contagem.entries()]
        .map(([clientId, n]) => ({ empresa: clientes.find((c) => c.id === clientId)?.empresa ?? '—', n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 5);
    }

    // `re`/`flag` casam com o CADASTRO do cliente (servicos/flag) para o %; `pred`
    // casa com o EVENTO da agenda (serviço tratado) para o ranking de top clientes.
    const defs: { label: string; re: RegExp; flag: keyof Cliente; color: string; pred: (a: EventoAgenda) => boolean }[] = [
      { label: 'Monitoria', re: /monitor/i, flag: 'monitoria', color: 'var(--accent)', pred: temServicoMonitoria },
      { label: 'Price', re: /(price|prec)/i, flag: 'price', color: 'var(--accent-tertiary)', pred: temServicoPrice },
    ];
    const dist = defs.map((d) => {
      // Base = quem CONTRATOU o serviço; numerador = os que foram atendidos.
      const contrataram = ativos.filter((c) => temProduto(c, d.re, d.flag));
      const cobertos = contrataram.filter((c) => foiAtendido(c, d.pred));
      const descobertos = contrataram
        .filter((c) => !foiAtendido(c, d.pred))
        .map((c) => ({ empresa: c.empresa, n: 0 }))
        .sort((a, b) => a.empresa.localeCompare(b.empresa));
      return {
        label: d.label,
        n: cobertos.length,
        base: contrataram.length,
        pct: contrataram.length > 0 ? Math.round((cobertos.length / contrataram.length) * 100) : 0,
        color: d.color,
        // Ranking por serviço tratado continua útil; os descobertos são o que
        // pede ação, então vêm primeiro na lista do card.
        top: topClientes(d.pred),
        descobertos: descobertos.length,
      };
    });
    return { servicosDist: dist, totalAtendidos: total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, ultimaInteracao, agendaAtiva, clientes]);

  // --- Cobertura da carteira no período: clientes ativos com >= 1 reunião ou
  // relatório nos ÚLTIMOS 2 MESES (mês selecionado + anterior, não só o
  // selecionado — janela mais realista de "foi atendido recentemente", senão
  // um cliente atendido no dia 1 do mês anterior aparecia "sem contato" logo
  // no início do mês seguinte). Só REUNIÃO/RELATÓRIO conta (Contato/Ligação
  // não é "atendimento" formal do mês) e cancelado/reagendado não conta (não
  // aconteceu). Como Aderência, NÃO segue o filtro "Tipo" do topo — senão
  // filtrar por Contato zeraria a cobertura sem sentido. ---
  const eventosCoberturaAtivos = useMemo(
    () => agenda.filter((a) => ativosIds.has(a.clientId) && /reuni|relat/i.test(a.type || '') && !/cancel|reagend/i.test(a.status || '')),
    [agenda, ativosIds]
  );
  const cobertura = useMemo(() => {
    const periodoAnteriorCobertura = subMonths(periodo, 1);
    const atendidosIds = new Set(
      eventosCoberturaAtivos
        .filter((a) => { const d = parseISO(a.date); return isSameMonth(d, periodo) || isSameMonth(d, periodoAnteriorCobertura); })
        .map((a) => a.clientId)
    );
    const cobertosC = ativos.filter((c) => atendidosIds.has(c.id)).map((c) => c.empresa).sort((a, b) => a.localeCompare(b));
    const semC = ativos.filter((c) => !atendidosIds.has(c.id)).map((c) => c.empresa).sort((a, b) => a.localeCompare(b));
    const total = ativos.length;
    const pct = total > 0 ? Math.round((cobertosC.length / total) * 100) : 0;
    return { cobertos: cobertosC.length, semContato: semC.length, total, pct, cobertosClientes: cobertosC, semContatoClientes: semC };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventosCoberturaAtivos, ativos, mes, ano]);

  // --- Aderência à cadência: % da carteira (ativos c/ serviço, fora Marco) em dia ---
  // Filtrável por serviço (Monitoria/Price) via filtroServicoAderencia. 3 baldes:
  // - em dia: depende da visão (ver `classificar` abaixo — "Todos" é permissivo,
  //   Monitoria/Price isolado é estrito).
  // - agenda marcada: não em dia, mas já existe agendamento futuro no calendário
  //   (status === 'coberto') — já está sendo tratado.
  // - precisa contato: nem em dia nem coberto.
  const aderencia = useMemo(() => {
    // `ativos` já respeita o filtro Monitor do topo (igual Cobertura/Serviços).
    // `agenda` fica sem filtrar por Tipo de propósito: a cadência de Monitoria/
    // Price tem semântica própria de tipo de evento (reunião/relatório) — filtrar
    // pelo "Tipo" do topo quebraria esse cálculo, não é um filtro que se aplique aqui.
    const fila = buildFilaCadencia(ativos, agenda, acoes, cadencias, hoje);
    const nomes = (arr: typeof fila) => arr.map((f) => f.cliente.empresa).sort((a, b) => a.localeCompare(b));
    // Contato/ligação sem resposta ainda não reflete no relógio do serviço
    // (só reunião/relatório zeram Monitoria/Price) — sem isso, quem acabou de
    // ser contatado (e está dentro do prazo de recontato) aparecia junto com
    // quem ninguém tratou ainda.
    const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now: hoje });

    const relevantes = filtroServicoAderencia === 'Todos'
      ? fila
      : fila.filter((f) => f.relogios.some((r) => r.servico === filtroServicoAderencia));

    // "Todos" (geral): olha todos os relógios contratados; filtrado por
    // serviço: olha só o relógio daquele serviço.
    function relogiosRelevantes(f: (typeof fila)[number]) {
      return filtroServicoAderencia === 'Todos'
        ? f.relogios
        : f.relogios.filter((r) => r.servico === filtroServicoAderencia);
    }
    function classificar(f: (typeof fila)[number]): 'em_dia' | 'agenda_marcada' | 'contato_recente' | 'precisa_contato' {
      const rels = relogiosRelevantes(f);
      // "Todos" (geral): PERMISSIVO — só precisa 1 serviço não estar mal das
      // pernas (em_dia OU vencendo, que é só o aviso prévio de 5 dias antes do
      // prazo, não atraso de verdade) pra considerar o cliente "em dia" no
      // resumo geral. Filtrado por serviço (Monitoria/Price): ESTRITO — o
      // botão por serviço existe justamente pra dar a visão detalhada de
      // verdade, sem essa folga; só statusReal em_dia conta.
      const emDia = filtroServicoAderencia === 'Todos'
        ? rels.some((r) => r.statusReal === 'em_dia' || r.statusReal === 'vencendo')
        : rels.some((r) => r.statusReal === 'em_dia');
      if (emDia) return 'em_dia';
      if (rels.some((r) => r.status === 'coberto')) return 'agenda_marcada';
      const ultimoContato = ultimaInteracaoMap.get(f.cliente.id) ?? null;
      if (
        ultimoContato
        && contatoRecenteNaoRefletido(f.relogios, ultimoContato)
        && differenceInCalendarDays(hoje, ultimoContato) <= cadencias.recontato_dias
      ) {
        return 'contato_recente';
      }
      return 'precisa_contato';
    }

    const total = relevantes.length;
    const emDiaClientes = nomes(relevantes.filter((f) => classificar(f) === 'em_dia'));
    const agendaMarcadaClientes = nomes(relevantes.filter((f) => classificar(f) === 'agenda_marcada'));
    const contatoRecenteClientes = nomes(relevantes.filter((f) => classificar(f) === 'contato_recente'));
    const precisaClientes = nomes(relevantes.filter((f) => classificar(f) === 'precisa_contato'));
    // Contato/ligação pesa menos que reunião/relatório (que já conta 100% em
    // "Em dia") na % central — peso configurável em Configurações, 0-100.
    const pesoContatoRecente = Math.min(100, Math.max(0, Number(cadencias.peso_contato_recente) || 0)) / 100;
    const pct = total > 0 ? Math.round(((emDiaClientes.length + contatoRecenteClientes.length * pesoContatoRecente) / total) * 100) : 0;
    return {
      total, pct,
      emDia: emDiaClientes.length, agendaMarcada: agendaMarcadaClientes.length,
      contatoRecente: contatoRecenteClientes.length, precisa: precisaClientes.length,
      emDiaClientes, agendaMarcadaClientes, contatoRecenteClientes, precisaClientes,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, agenda, acoes, cadencias, filtroServicoAderencia]);

  // --- Vencendo (próx. 5 dias, mesma janela do resto do app): só quem está
  // VENCENDO de verdade (Monitoria/Price/Relatório) — nada de "em dia" nem
  // "nunca agendado" aqui, isso já vive em "Carteira no Ritmo". Base em
  // itens/ações, não em clientes (um cliente com 2 serviços vencendo conta
  // 2x, um por linha). Cada item leva a data de vencimento e os dias restantes
  // — calculados a partir do `atraso` do relógio (negativo = ainda dentro do
  // prazo; `-atraso` = dias até vencer). Cálculo próprio (buildVencendoDashboard),
  // não usa buildFilaCadencia (esse card inclui Relatório pra todo cliente
  // ativo, o que mudaria a fila de Ações se fosse o mesmo cálculo).
  const vencendo = useMemo(() => {
    const fila = buildVencendoDashboard(ativos, agenda, cadencias, hoje, 5);

    // `nome`/`servico` separados (não uma string única "Cliente · Serviço") —
    // combinados, o truncamento por ellipsis cortava no meio do nome OU do
    // serviço dependendo de qual overflowasse primeiro (ex.: "Piloto - Filial
    // · Mo..."), o que não dava pra entender qual serviço estava vencendo nem
    // sempre mostrava o nome inteiro. Serviço é sempre curto — não precisa de
    // truncamento, então fica de fora da parte que trunca.
    type ItemVencendo = { nome: string; servico: string; data: Date; dias: number };
    const itens: ItemVencendo[] = [];
    for (const f of fila) {
      for (const r of f.relogios) {
        if (filtroServicoVencendo !== 'Todos' && r.servico !== filtroServicoVencendo) continue;
        if (r.status !== 'vencendo') continue;
        const dias = Math.max(0, -r.atraso);
        itens.push({ nome: f.cliente.empresa, servico: r.servico, data: addDays(hoje, dias), dias });
      }
    }
    itens.sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome)); // mais urgente primeiro
    return { total: itens.length, itens };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, agenda, cadencias, filtroServicoVencendo]);

  // --- Próximas agendas (forward-looking) ---
  const tiposDisponiveis = useMemo(() => ['Todos', ...new Set(agendaAtiva.map((a) => a.type).filter(Boolean))], [agendaAtiva]);
  // Chave de ordenação "yyyy-MM-dd HH:MM" (dia + hora), não `date.getTime()`
  // direto: o campo `time` (HH:MM) é separado de `date` e NÃO entra no
  // timestamp — dois eventos do mesmo dia empatavam em `date.getTime()` e
  // caíam na ordem de chegada da planilha, não na ordem real do dia (bug
  // real relatado: evento criado às 11h aparecia depois de outros do mesmo
  // dia sem horário mais cedo). Sem horário marcado, ordena como '00:00'
  // (início do dia) — mesmo critério já usado pro resto da Agenda.
  const chaveOrdem = (a: EventoAgenda) => `${format(parseISO(a.date), 'yyyy-MM-dd')} ${a.time || '00:00'}`;
  const proximos = useMemo(() =>
    agendaAtiva
      // Concluído/Realizado não é "próxima"; Cancelado/Reagendado não vai acontecer.
      .filter((a) => !/conclu|realiz|cancel|reagend/i.test(a.status || ''))
      .filter((a) => differenceInCalendarDays(parseISO(a.date), hoje) >= 0)
      .filter((a) => filtroTipo === 'Todos' || a.type === filtroTipo)
      .sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)))
      .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaAtiva, filtroTipo]);

  // --- Alertas de acompanhamento (reunião OU ação concluída) ---
  const alertas = ativos
    .map((cliente) => {
      const uc = ultimaInteracao.get(cliente.id);
      const dias = uc ? differenceInCalendarDays(hoje, uc) : null;
      return { cliente, uc, dias };
    })
    .filter((e) => e.dias === null || e.dias >= FOLLOW_UP_THRESHOLD_DAYS)
    .sort((a, b) => (b.dias ?? 99999) - (a.dias ?? 99999))
    .slice(0, 6);

  const alertasProgramados = lembretes
    .filter((r) => r.status === 'ativo')
    .sort((a, b) => parseISO(a.datetime).getTime() - parseISO(b.datetime).getTime())
    .slice(0, 6);

  return {
    // filtros
    filtroTipo, setFiltroTipo, filtroMonitor, setFiltroMonitor, filtroTipoEvento, setFiltroTipoEvento,
    filtroServicoAderencia, setFiltroServicoAderencia,
    mes, setMes, ano, setAno, periodo,
    monitoresDisponiveis, tiposEventoDisponiveis, anosDisponiveis, mesesDisponiveis,
    // base
    ativos, agendaPorMonitor, acoesPorMonitor,
    // KPIs
    reunioesConcluidasMes, variacao, diaCorte, reunioesAgendadasMes, reagendamentosMes,
    // gráfico
    linhaPorMes, linhaHighlight,
    // cards
    servicosDist, totalAtendidos, cobertura, aderencia,
    vencendo, filtroServicoVencendo, setFiltroServicoVencendo,
    tiposDisponiveis, proximos,
    alertas, alertasProgramados,
    followUpThresholdDays: FOLLOW_UP_THRESHOLD_DAYS,
  };
}
