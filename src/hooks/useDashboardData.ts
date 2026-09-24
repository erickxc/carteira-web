import { useMemo, useState } from 'react';
import { contarAtendidosNoMes } from '../utils/atendidosNoMes';
import { clientesEm } from '../utils/statusHistorico';
import {
  addDays, differenceInCalendarDays, eachMonthOfInterval, endOfMonth, format, isSameMonth,
  max as maxDate, min as minDate, parseISO, startOfMonth, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCarteira } from '../context/CarteiraContext';
import { usePersistedState } from './usePersistedState';
import { isClienteAtivo } from '../utils/formatters';
import { clienteStatusCor, riscoIACor } from '../utils/badges';
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
  const { clientes, agenda, acoes, lembretes, cadencias, analisesIA, statusHistorico, filtroMonitor, setFiltroMonitor, monitoresDisponiveis } = useCarteira();
  const [filtroTipo, setFiltroTipo] = usePersistedState<string>('filtro:dash:tipo', 'Todos');
  const [filtroTipoEvento, setFiltroTipoEvento] = usePersistedState<string>('filtro:dash:tipoEvento', 'Todos');
  const [filtroServicoAderencia, setFiltroServicoAderencia] = usePersistedState<ServicoCad | 'Todos'>('filtro:dash:servicoAderencia', 'Todos');
  const [filtroServicoVencendo, setFiltroServicoVencendo] = usePersistedState<ServicoCad | 'Todos'>('filtro:dash:servicoVencendo', 'Todos');
  // Só Monitoria/Price aqui (não Relatório): Relatório é TIPO de evento e já
  // entra na conta de atendimento — não é um serviço marcado no evento.
  const [filtroServicoTop10, setFiltroServicoTop10] = usePersistedState<'Todos' | 'Monitoria' | 'Price'>('filtro:dash:servicoTop10', 'Todos');

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const periodo = new Date(ano, mes, 1);
  const periodoAnterior = subMonths(periodo, 1);
  /**
   * Âncora de "agora" pros cálculos "tempo real" (aderência, vencendo,
   * cobertura por serviço, e os cards de Atendimento/Recuperados) — pedido do
   * usuário pra respeitarem o filtro de mês/ano do topo, não só o histórico
   * agregado. No mês corrente é o `hoje` de verdade (comportamento igual a
   * antes); num mês passado, vira o ÚLTIMO INSTANTE daquele mês, simulando
   * "como estava a carteira no fim daquele mês" — `calcularRelogio`,
   * `buildUltimaInteracaoMap` etc. já descartam eventos posteriores a `now`
   * (`d > now` → ignora), então passar uma âncora no passado já basta pra
   * excluir tudo que aconteceu depois, sem precisar filtrar `agenda`/`acoes`
   * à parte.
   */
  // useMemo (não const direta): sem isso, `dataReferencia` era um Date NOVO a
  // cada render — nunca igual por referência ao anterior mesmo no mesmo mês —
  // e qualquer useMemo que a listasse como dependência recomputava em TODO
  // render, não só quando mes/ano mudava (o React Compiler passou a acusar
  // isso como memoização quebrada). Referência estável por mes/ano resolve.
  // `periodo`/`hoje` são recomputados a cada render (não memoizados) só pra
  // virar Date "agora" — de propósito fora das deps: só ano/mes devem
  // re-disparar isto.
  const dataReferencia = useMemo(
    () => (isSameMonth(periodo, hoje) ? hoje : endOfMonth(periodo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ano, mes]
  );

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
  // Mesmo filtro de monitor que `ativos`, só invertido — existe pra "inativos"
  // não virar `clientes.length - ativos.length` (bug real: isso compara um
  // total SEM filtro de monitor contra um `ativos` COM filtro, inflando
  // "inativos" pelo tanto que pertence a outros monitores).
  const inativos = useMemo(
    () => clientes.filter((c) => !isClienteAtivo(c) && (filtroMonitor === 'Todos' || c.monitor === filtroMonitor)),
    [clientes, filtroMonitor]
  );
  const ativosIds = useMemo(() => new Set(ativos.map((c) => c.id)), [ativos]);
  // Cada loja é um "cliente" (registro) próprio na Carteira, mas várias lojas
  // do mesmo grupo (ex.: "Altese - Recreio + Barra" e "Altese - GM, Ford,
  // Fiat, VW") são, na prática, UM cliente da 2D com múltiplos atendimentos.
  // `ativos.length` conta atendimentos (uma linha por loja); isto conta
  // clientes distintos (uma vez por `grupo`, senão uma vez por cliente sem
  // grupo) — as duas métricas divergem e cada dashboard mostra a que faz
  // sentido pro seu propósito (Visão Geral = atendimentos; Dashboard da
  // Carteira = clientes).
  // Carteira ATIVA como estava no período escolhido: mês corrente = cadastro de hoje;
  // mês passado = situação vigente no fim daquele mês (log StatusHistorico), pra o
  // histórico não mudar quando alguém troca o status de um cliente depois. Só os
  // cards "Clientes ativos"/"Total de atendimentos" usam isto por enquanto.
  const ativosNoPeriodo = useMemo(() => {
    const base = isSameMonth(periodo, hoje) ? clientes : clientesEm(clientes, statusHistorico, dataReferencia);
    return base.filter((c) => isClienteAtivo(c, dataReferencia) && (filtroMonitor === 'Todos' || c.monitor === filtroMonitor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, statusHistorico, filtroMonitor, dataReferencia]);
  const totalClientesDistintos = useMemo(() => {
    const grupos = new Set<string>();
    let semGrupo = 0;
    for (const c of ativosNoPeriodo) {
      if (c.grupo) grupos.add(c.grupo);
      else semGrupo++;
    }
    return grupos.size + semGrupo;
  }, [ativosNoPeriodo]);
  const atendidosNoMes = useMemo(
    () => contarAtendidosNoMes(ativosNoPeriodo, agenda, dataReferencia, dataReferencia),
    [ativosNoPeriodo, agenda, dataReferencia]
  );
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
    () => buildUltimaInteracaoMap(agendaAtiva, acoes, { now: dataReferencia, isRelevant: (cid) => ativosIds.has(cid) }),
    [agendaAtiva, acoes, ativosIds, dataReferencia]
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

  // Base de REUNIÕES (só tipo Reunião) — usada tanto nos KPIs de reunião quanto
  // no gráfico "Reuniões por Mês", pra baterem entre si. NÃO segue o filtro
  // "Todos os tipos" do topo: os cards dizem "Reuniões", então sempre contam só
  // reunião (não contato/ligação/relatório).
  //
  // Filtra por Monitor pelo campo DO PRÓPRIO EVENTO (`monitores`), não por
  // `ativosIds` (clientes ativos HOJE): usar o status atual do cliente aqui
  // fazia o histórico ser recalculado toda vez que alguém mudava de status —
  // uma reunião de julho sumia do gráfico (inclusive de meses já fechados) se
  // o cliente ficasse inativo em setembro. O momento histórico da reunião não
  // deve depender do estado atual do cadastro — é fato passado, não se
  // recalcula (bug real, visto no gráfico "Reuniões por Mês" caindo pra meses
  // anteriores conforme clientes mudavam de status).
  const reunioesAtivas = useMemo(
    () => agenda.filter((a) =>
      /reuni/i.test(a.type || '') && (filtroMonitor === 'Todos' || (a.monitores ?? []).includes(filtroMonitor))
    ),
    [agenda, filtroMonitor]
  );

  // CONCLUÍDAS = reuniões que aconteceram (status Concluído OU Realizado — os
  // dois significam "feito"). O dashboard conta SÓ concluídas; agendadas entram
  // como projeção à parte.
  const concluida = (a: EventoAgenda) => /conclu|realiz/i.test(a.status || '');
  // Base de "planejada": reunião que não foi cancelada/reagendada-por-status
  // (Agendado, Pendente, qualquer status novo — e também as Concluídas, por isso
  // NÃO é usada sozinha em KPI: o card "Agendadas" exclui as concluídas).
  const agendada = (a: EventoAgenda) => !/cancel|reagend/i.test(a.status || '');
  // Versão EXCLUSIVA (sem concluída) — usada no card "Agendadas" (só o que ainda
  // vai acontecer) e na projeção do gráfico, que soma `concluídas + isso`. Usar
  // `agendada` ali contaria a concluída 2x (bug real: card certo em 28, gráfico
  // mostrando 42 no mesmo mês).
  const planejadaNaoConcluida = (a: EventoAgenda) => agendada(a) && !concluida(a);

  // --- Top 10 clientes por ATENDIMENTOS (reunião OU relatório) CONCLUÍDOS no
  // ANO selecionado (topo da tela) — substitui o mapa de abrangência nessa
  // fileira de gauges (pedido do usuário: mapa foi pro Dashboard da Carteira).
  // Ano, não mês/período — é um ranking anual, não segue o corte mensal do
  // resto do dashboard. Usa `agenda`/`ativosIds` direto (não `reunioesAtivas`,
  // que é só tipo Reunião e alimenta os KPIs/gráfico mensal — mudar o
  // significado dali quebraria esses outros cards).
  const top10AtendimentosAno = useMemo(() => {
    // Filtro por serviço tratado NO EVENTO (não no cadastro do cliente): a
    // pergunta aqui é "quantos atendimentos DE MONITORIA esse cliente teve",
    // não "esse cliente tem Monitoria contratada". Reunião sem serviço
    // marcado conta como Monitoria (a reunião comum é de monitoria — mesma
    // regra de `servicosDist`), senão o filtro zeraria com dado legado.
    const combinaServico = (a: EventoAgenda) => {
      if (filtroServicoTop10 === 'Todos') return true;
      const servicos = (a.servicos ?? []).join(' ');
      const ehPrice = /(price|prec)/i.test(servicos);
      if (filtroServicoTop10 === 'Price') return ehPrice;
      return /monitor/i.test(servicos) || (/reuni/i.test(a.type || '') && !ehPrice);
    };

    const contagem = new Map<string, number>();
    // Amplitude real dos atendimentos contados (nem todo ano tem atendimento
    // de jan a dez) — o card mostra esse intervalo, não só o ano inteiro, pra
    // não sugerir cobertura que a base não tem.
    let inicio: Date | null = null;
    let fim: Date | null = null;
    agenda.forEach((a) => {
      if (!ativosIds.has(a.clientId) || !/reuni|relat/i.test(a.type || '') || !concluida(a)) return;
      if (!combinaServico(a)) return;
      const d = parseISO(a.date);
      if (isNaN(d.getTime()) || d.getFullYear() !== ano) return;
      contagem.set(a.clientId, (contagem.get(a.clientId) ?? 0) + 1);
      if (!inicio || d < inicio) inicio = d;
      if (!fim || d > fim) fim = d;
    });
    const itens = [...contagem.entries()]
      .map(([clientId, n]) => ({ label: clientes.find((c) => c.id === clientId)?.empresa ?? '—', n }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
      .slice(0, 10);
    return { itens, inicio, fim };
  }, [agenda, ativosIds, ano, clientes, filtroServicoTop10]);

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
  const reunioesAgendadasMes = reunioesAtivas.filter((a) => planejadaNaoConcluida(a) && isSameMonth(parseISO(a.date), periodo)).length;
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
  // "Atendido" (cobertos/descobertos) = MESMO relógio de cadência que
  // alimenta "Carteira no Ritmo" (`buildFilaCadencia`), statusReal === 'em_dia'
  // pro serviço em questão — não uma segunda definição paralela. Antes esse
  // card exigia status Concluído/Realizado explícito na Agenda e só olhava
  // `agenda` (nunca `acoes`), enquanto a cadência considera uma reunião já
  // datada (mesmo "Agendado"/"Pendente", não cancelada) e também Ações
  // concluídas do mesmo serviço (ex.: um Relatório de Monitoria registrado só
  // na tela de Ações). Isso fazia os dois cards discordarem sobre quem está
  // "em dia": um cliente aparecia OK no Ritmo e "sem contato" aqui, achado
  // comparando os dois cards lado a lado com dado real (Ramar Caxias — toque
  // de Monitoria era um Relatório em Ações, invisível aqui; Cativo — reunião
  // de hoje ainda "Agendado", não confirmada).
  const { servicosDist, totalAtendidos } = useMemo(() => {
    const JANELA = 30;
    const temProduto = (c: Cliente, re: RegExp, flag: keyof Cliente) =>
      (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[flag]);

    const fila = buildFilaCadencia(ativos, agenda, acoes, cadencias, dataReferencia);
    const relogiosPorCliente = new Map(fila.map((f) => [f.cliente.id, f.relogios]));
    const emDia = (c: Cliente, servico: ServicoCad) =>
      (relogiosPorCliente.get(c.id) ?? []).some((r) => r.servico === servico && r.statusReal === 'em_dia');

    // Top clientes por SERVIÇO tratado — ranking de esforço (quantas entregas
    // no período), fica com sua própria definição mais estrita (evento
    // concluído na Agenda): é "quem mais recebeu", não "quem está em dia".
    const eventoRealizado = (a: EventoAgenda) =>
      /reuni|relat/i.test(a.type || '') && /conclu|realiz/i.test(a.status || '');
    const temServicoPrice = (a: EventoAgenda) => (a.servicos ?? []).some((s) => /(price|prec)/i.test(s));
    const temServicoMonitoria = (a: EventoAgenda) =>
      /monitor/i.test((a.servicos ?? []).join(' ')) ||
      (/reuni/i.test(a.type || '') && !temServicoPrice(a));
    function topClientes(pred: (a: EventoAgenda) => boolean) {
      const contagem = new Map<string, number>();
      agendaAtiva.forEach((a) => {
        if (!eventoRealizado(a) || !pred(a)) return;
        const d = parseISO(a.date);
        const dias = differenceInCalendarDays(dataReferencia, d);
        if (isNaN(d.getTime()) || dias < 0 || dias > JANELA) return;
        contagem.set(a.clientId, (contagem.get(a.clientId) ?? 0) + 1);
      });
      return [...contagem.entries()]
        .map(([clientId, n]) => ({ empresa: clientes.find((c) => c.id === clientId)?.empresa ?? '—', n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 5);
    }

    const defs: { label: string; re: RegExp; flag: keyof Cliente; color: string; servico: ServicoCad; pred: (a: EventoAgenda) => boolean }[] = [
      { label: 'Monitoria', re: /monitor/i, flag: 'monitoria', color: 'var(--accent)', servico: 'Monitoria', pred: temServicoMonitoria },
      { label: 'Price', re: /(price|prec)/i, flag: 'price', color: 'var(--accent-tertiary)', servico: 'Price', pred: temServicoPrice },
    ];
    const dist = defs.map((d) => {
      // Base = quem CONTRATOU o serviço; numerador = os que estão em dia.
      const contrataram = ativos.filter((c) => temProduto(c, d.re, d.flag));
      const cobertos = contrataram.filter((c) => emDia(c, d.servico));
      const descobertos = contrataram
        .filter((c) => !emDia(c, d.servico))
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
        // Nomes (não só contagem) — o card alterna entre ver quem ESTÁ coberto
        // e quem NÃO está (seletor cheio/vazio), então precisa das duas listas.
        cobertosClientes: cobertos.map((c) => c.empresa).sort((a, b) => a.localeCompare(b)),
        descobertosClientes: descobertos.map((c) => c.empresa),
      };
    });
    const total = ativos.filter((c) => (relogiosPorCliente.get(c.id) ?? []).some((r) => r.statusReal === 'em_dia')).length;
    return { servicosDist: dist, totalAtendidos: total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, agenda, acoes, cadencias, agendaAtiva, clientes, dataReferencia]);

  // --- Composição da carteira (Dashboard da Carteira) — recortes direto do
  // CADASTRO de cliente, sem depender de agenda/ações. Cada distribuição
  // devolve {label, n} ordenado por contagem desc, pra virar barra de %.
  const clientesPorMonitor = useMemo(() => {
    const contagem = new Map<string, number>();
    ativos.forEach((c) => {
      const key = c.monitor?.trim() || 'Sem monitor';
      contagem.set(key, (contagem.get(key) ?? 0) + 1);
    });
    return [...contagem.entries()]
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [ativos]);

  // "Saúde da carteira" — composição por STATUS, carteira INTEIRA (não só
  // `ativos`, que já filtra por status "em atendimento") — senão Suspenso/
  // Atendido pelo Marco/Problemas Externos nunca apareceriam aqui, justamente
  // os que essa distribuição existe pra mostrar. Cor = mesma classificação
  // semântica do badge (`clienteStatusCor`) — aqui é um fill sólido pra
  // barra empilhada de parte-do-todo, não o badge em si.
  const saudeCarteira = useMemo(() => {
    const contagem = new Map<string, number>();
    clientes.forEach((c) => {
      const key = c.status?.trim() || 'Regular';
      contagem.set(key, (contagem.get(key) ?? 0) + 1);
    });
    const total = clientes.length;
    return [...contagem.entries()]
      .map(([label, n]) => ({ label, n, pct: total > 0 ? Math.round((n / total) * 100) : 0, color: clienteStatusCor(label) }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [clientes]);

  // Profundidade de serviços contratados por cliente ATIVO — quantos têm 1,
  // 2 ou 3+ serviços (cross-sell). Categorias ORDENADAS (não nominais), por
  // isso a cor é uma rampa de um hue só (mais escuro = mais serviços), nunca
  // uma cor por categoria nominal.
  const profundidadeServicos = useMemo(() => {
    const baldes = [
      { label: '1 serviço', min: 1, max: 1, cor: 'color-mix(in srgb, var(--accent) 45%, var(--card-hover))' },
      { label: '2 serviços', min: 2, max: 2, cor: 'color-mix(in srgb, var(--accent) 70%, var(--card-hover))' },
      { label: '3+ serviços', min: 3, max: Infinity, cor: 'var(--accent)' },
    ];
    const semServico = ativos.filter((c) => (c.servicos ?? []).length === 0).length;
    const dist = baldes
      .map((b) => ({
        label: b.label,
        n: ativos.filter((c) => { const q = (c.servicos ?? []).length; return q >= b.min && q <= b.max; }).length,
        color: b.cor,
      }));
    if (semServico > 0) dist.unshift({ label: 'Nenhum serviço', n: semServico, color: 'var(--text-muted)' });
    const total = ativos.length;
    return dist
      .filter((d) => d.n > 0)
      .map((d) => ({ ...d, pct: total > 0 ? Math.round((d.n / total) * 100) : 0 }));
  }, [ativos]);

  // Distribuição de risco (baixo/médio/alto, `AnalisesIA.nivelRisco`) entre os
  // clientes ATIVOS — mede saúde do relacionamento, não volume de atendimento
  // (que é o que os outros cards do dashboard já cobrem). Ordem FIXA
  // baixo→alto (não por contagem): é uma escala ordinal, ordenar por volume
  // confundiria a leitura. "Sem análise" entra separado (mesmo padrão de
  // "Nenhum serviço" em profundidadeServicos) — cliente sem nenhuma análise
  // ainda não é "risco baixo", é dado ausente.
  const distribuicaoRisco = useMemo(() => {
    const analisePorCliente = new Map(analisesIA.map((a) => [a.clientId, a]));
    const niveis: { label: string; nivel: 'baixo' | 'medio' | 'alto' }[] = [
      { label: 'Risco baixo', nivel: 'baixo' },
      { label: 'Risco médio', nivel: 'medio' },
      { label: 'Risco alto', nivel: 'alto' },
    ];
    const semAnalise = ativos.filter((c) => !analisePorCliente.has(c.id)).length;
    const dist = niveis.map((n) => ({
      label: n.label,
      n: ativos.filter((c) => analisePorCliente.get(c.id)?.nivelRisco === n.nivel).length,
      color: riscoIACor(n.nivel),
    }));
    if (semAnalise > 0) dist.push({ label: 'Sem análise', n: semAnalise, color: 'var(--text-muted)' });
    const total = ativos.length;
    return dist
      .filter((d) => d.n > 0)
      .map((d) => ({ ...d, pct: total > 0 ? Math.round((d.n / total) * 100) : 0 }));
  }, [ativos, analisesIA]);

  const mediaServicosPorCliente = useMemo(() => {
    if (ativos.length === 0) return 0;
    const soma = ativos.reduce((s, c) => s + (c.servicos ?? []).length, 0);
    return soma / ativos.length;
  }, [ativos]);

  // Novos clientes cadastrados no MÊS CORRENTE (não segue o filtro mês/ano do
  // topo, que é sobre agenda — aqui é sempre "hoje", pra virar um KPI de
  // "carteira está crescendo agora", não histórico.
  const novosClientesMes = useMemo(
    () => clientes.filter((c) => { const d = parseISO(c.createdAt || ''); return !isNaN(d.getTime()) && isSameMonth(d, hoje); }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes]
  );

  // Linha de produto (Leve/Pesada/Geral — categoria `linha_cliente`).
  const clientesPorLinha = useMemo(() => {
    const contagem = new Map<string, number>();
    ativos.forEach((c) => {
      const key = c.linha?.trim() || 'Não informada';
      contagem.set(key, (contagem.get(key) ?? 0) + 1);
    });
    return [...contagem.entries()]
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [ativos]);

  const clientesPorSegmento = useMemo(() => {
    const contagem = new Map<string, number>();
    ativos.forEach((c) => {
      const key = c.local?.trim() || 'Não informado';
      contagem.set(key, (contagem.get(key) ?? 0) + 1);
    });
    return [...contagem.entries()]
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [ativos]);

  // --- Crescimento da carteira: total de clientes cadastrados (acumulado) mês
  // a mês, desde o primeiro `createdAt`. Cliente legado sem `createdAt`
  // válido não entra na série (não há como posicioná-lo no tempo), mas
  // continua contando nas demais distribuições acima.
  const crescimentoCarteira = useMemo(() => {
    const datas = clientes
      .map((c) => parseISO(c.createdAt || ''))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (datas.length === 0) return [];
    const inicio = startOfMonth(datas[0]);
    const fim = startOfMonth(maxDate([datas[datas.length - 1], hoje]));
    let meses = eachMonthOfInterval({ start: inicio, end: fim });
    if (meses.length > 24) meses = meses.slice(meses.length - 24); // mesmo teto de segurança da tendência de reuniões
    let acumulado = 0;
    let ponteiro = 0;
    return meses.map((m, i) => {
      const fimMes = endOfMonth(m);
      while (ponteiro < datas.length && datas[ponteiro] <= fimMes) { acumulado++; ponteiro++; }
      return {
        label: m.getMonth() === 0 || i === 0 ? format(m, 'MMM/yy', { locale: ptBR }).replace('.', '') : format(m, 'MMM', { locale: ptBR }).replace('.', ''),
        full: format(m, "MMMM 'de' yyyy", { locale: ptBR }),
        value: acumulado,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes]);

  // --- Cobertura da carteira no período: clientes ativos com >= 1 reunião,
  // relatório OU precificação nos ÚLTIMOS 2 MESES (mês selecionado + anterior,
  // não só o selecionado — janela mais realista de "foi atendido recentemente",
  // senão um cliente atendido no dia 1 do mês anterior aparecia "sem contato"
  // logo no início do mês seguinte). Precificação é TIPO de evento próprio
  // (não só serviço dentro de Reunião — ver `EventoAgenda.type`), por isso
  // entra no mesmo balde de "entrega" que Reunião/Relatório: só Contato/Ligação
  // fica de fora (não é "atendimento" formal do mês). Cancelado/reagendado não
  // conta (não aconteceu). Como Aderência, NÃO segue o filtro "Tipo" do topo —
  // senão filtrar por Contato zeraria a cobertura sem sentido. ---
  const eventosCoberturaAtivos = useMemo(
    () => agenda.filter((a) => ativosIds.has(a.clientId) && /reuni|relat|precific/i.test(a.type || '') && !/cancel|reagend/i.test(a.status || '')),
    [agenda, ativosIds]
  );
  const cobertura = useMemo(() => {
    const periodoAnteriorCobertura = subMonths(periodo, 1);
    const atendidosIds = new Set(
      eventosCoberturaAtivos
        .filter((a) => { const d = parseISO(a.date); return isSameMonth(d, periodo) || isSameMonth(d, periodoAnteriorCobertura); })
        .map((a) => a.clientId)
    );
    // Cliente cujos serviços CONTRATADOS são TODOS marcados como
    // "independente" (`servicosIndependentes` — "o cliente faz sozinho, não
    // depende de reunião/monitoria", mesmo campo que `cadenciaServico.ts` já
    // usa pra não gerar relógio de cadência) nunca vai ter reunião/relatório
    // por natureza — cobrar "contato" dele aqui puniria por desenho um cliente
    // que nunca deveria precisar de um. Fica fora do denominador (nem
    // "atendido" nem "sem contato"), igual à cadência já trata.
    const precisaDeContato = (c: Cliente) => {
      const servicos = c.servicos ?? [];
      if (servicos.length === 0) return true;
      const independentes = c.servicosIndependentes ?? [];
      return servicos.some((s) => !independentes.includes(s));
    };
    const relevantes = ativos.filter(precisaDeContato);
    const cobertosC = relevantes.filter((c) => atendidosIds.has(c.id)).map((c) => c.empresa).sort((a, b) => a.localeCompare(b));
    const semC = relevantes.filter((c) => !atendidosIds.has(c.id)).map((c) => c.empresa).sort((a, b) => a.localeCompare(b));
    const total = relevantes.length;
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
    const fila = buildFilaCadencia(ativos, agenda, acoes, cadencias, dataReferencia);
    const nomes = (arr: typeof fila) => arr.map((f) => f.cliente.empresa).sort((a, b) => a.localeCompare(b));
    // Contato/ligação sem resposta ainda não reflete no relógio do serviço
    // (só reunião/relatório zeram Monitoria/Price) — sem isso, quem acabou de
    // ser contatado (e está dentro do prazo de recontato) aparecia junto com
    // quem ninguém tratou ainda.
    const ultimaInteracaoMap = buildUltimaInteracaoMap(agenda, acoes, { now: dataReferencia });

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
        && differenceInCalendarDays(dataReferencia, ultimoContato) <= cadencias.recontato_dias
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
  }, [ativos, agenda, acoes, cadencias, filtroServicoAderencia, dataReferencia]);

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
    const fila = buildVencendoDashboard(ativos, agenda, cadencias, dataReferencia, 5);

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
        itens.push({ nome: f.cliente.empresa, servico: r.servico, data: addDays(dataReferencia, dias), dias });
      }
    }
    itens.sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome)); // mais urgente primeiro
    return { total: itens.length, itens };
  }, [ativos, agenda, cadencias, filtroServicoVencendo, dataReferencia]);

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
      const dias = uc ? differenceInCalendarDays(dataReferencia, uc) : null;
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
    mes, setMes, ano, setAno, periodo, dataReferencia,
    monitoresDisponiveis, tiposEventoDisponiveis, anosDisponiveis, mesesDisponiveis,
    // base
    ativos, inativos, ativosNoPeriodo, totalClientesDistintos, atendidosNoMes, agendaPorMonitor, acoesPorMonitor,
    // KPIs
    reunioesConcluidasMes, variacao, diaCorte, reunioesAgendadasMes, reagendamentosMes,
    // gráfico
    linhaPorMes, linhaHighlight,
    // cards
    servicosDist, totalAtendidos, cobertura, aderencia,
    clientesPorMonitor, clientesPorSegmento, clientesPorLinha, crescimentoCarteira,
    saudeCarteira, profundidadeServicos, distribuicaoRisco, mediaServicosPorCliente, novosClientesMes,
    top10AtendimentosAno, filtroServicoTop10, setFiltroServicoTop10,
    vencendo, filtroServicoVencendo, setFiltroServicoVencendo,
    tiposDisponiveis, proximos,
    alertas, alertasProgramados,
    followUpThresholdDays: FOLLOW_UP_THRESHOLD_DAYS,
  };
}
