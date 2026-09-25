import { useCallback, useMemo, useState } from 'react';
import { contarAtendidosNoMes } from '../utils/atendidosNoMes';
import { clientesEm } from '../utils/statusHistorico';
import { riscoEm } from '../utils/riscoEm';
import {
  addDays, differenceInCalendarDays, eachMonthOfInterval, endOfMonth, format, isSameMonth,
  max as maxDate, min as minDate, parseISO, startOfMonth, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCarteira } from '../context/CarteiraContext';
import { usePersistedState } from './usePersistedState';
import { isClienteAtivo } from '../utils/formatters';
import { clienteStatusCor, riscoIACor } from '../utils/badges';
import {
  buildFilaCadencia, ehEntrega, ehServicoDeReuniao, itensVencendo, type ServicoCad,
} from '../utils/cadenciaServico';
import { mesesComDados } from '../utils/periodo';
import { calcularIndicadoresPrazo, LIMIAR_SEM_ACOMPANHAMENTO_DIAS, recortarAte } from '../utils/indicadoresPrazo';
import type { AnaliseIA, Cliente, EventoAgenda } from '../types';

const FOLLOW_UP_THRESHOLD_DAYS = LIMIAR_SEM_ACOMPANHAMENTO_DIAS;

/** Média de serviços COM PRAZO (Monitoria e Price) por atendimento. */
function mediaServicosDe(lista: Cliente[]): number {
  if (lista.length === 0) return 0;
  return lista.reduce((s, c) => s + (c.servicos ?? []).filter(ehServicoDeReuniao).length, 0) / lista.length;
}

/** Clientes distintos: uma rede (`grupo`) conta uma vez; loja sem grupo conta sozinha. */
function contarClientesDistintos(lista: Cliente[]): number {
  const grupos = new Set<string>();
  let semGrupo = 0;
  for (const c of lista) {
    if (c.grupo) grupos.add(c.grupo);
    else semGrupo++;
  }
  return grupos.size + semGrupo;
}

/**
 * Toda a camada de dados da Visão Geral (filtros + cálculos derivados) — a
 * página só monta a UI a partir do que este hook devolve. Separado do
 * DashboardPage.tsx pra não misturar "o que calcular" com "como desenhar".
 */
export function useDashboardData(opts: { historicoAnalises?: AnaliseIA[] } = {}) {
  const { historicoAnalises } = opts;
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
  // Carteira ATIVA numa data: no mês corrente, o cadastro de hoje; em outra data,
  // a situação vigente naquele dia (log StatusHistorico) e só quem já existia.
  // Serve tanto ao mês escolhido no topo quanto à comparação com um mês antes.
  const ativosEm = useCallback((data: Date) => {
    const base = isSameMonth(data, new Date()) ? clientes : clientesEm(clientes, statusHistorico, data);
    return base.filter((c) =>
      (!c.createdAt || parseISO(c.createdAt) <= data) &&
      isClienteAtivo(c, data) &&
      (filtroMonitor === 'Todos' || c.monitor === filtroMonitor)
    );
  }, [clientes, statusHistorico, filtroMonitor]);
  /** Mesma data, um mês antes — referência de toda comparação da tela. */
  const referenciaAnterior = useMemo(() => subMonths(dataReferencia, 1), [dataReferencia]);
  const ativosNoPeriodo = useMemo(() => ativosEm(dataReferencia), [ativosEm, dataReferencia]);
  const ativosAnterior = useMemo(() => ativosEm(referenciaAnterior), [ativosEm, referenciaAnterior]);
  const totalClientesDistintos = useMemo(() => contarClientesDistintos(ativosNoPeriodo), [ativosNoPeriodo]);
  const totalClientesDistintosAnterior = useMemo(() => contarClientesDistintos(ativosAnterior), [ativosAnterior]);
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

  // Indicadores de prazo (Ritmo, Cobertura por Serviço, Cobertura, Sem
  // acompanhamento) — UMA função para o mês escolhido e para a mesma data um mês
  // antes, então valor e comparação nunca usam regras diferentes. O passado é
  // aproximado: tira o que foi criado depois, mas o status dos eventos é o de hoje.
  const prazo = useMemo(
    () => calcularIndicadoresPrazo({ ativos: ativosNoPeriodo, agenda, acoes, cadencias, now: dataReferencia, periodo, filtroServico: filtroServicoAderencia }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativosNoPeriodo, agenda, acoes, cadencias, dataReferencia, filtroServicoAderencia]
  );
  const prazoAnterior = useMemo(
    () => calcularIndicadoresPrazo({
      ativos: ativosAnterior, agenda: recortarAte(agenda, referenciaAnterior), acoes: recortarAte(acoes, referenciaAnterior),
      cadencias, now: referenciaAnterior, periodo: startOfMonth(referenciaAnterior), filtroServico: filtroServicoAderencia,
    }),
    [ativosAnterior, agenda, acoes, cadencias, referenciaAnterior, filtroServicoAderencia]
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
    // pergunta aqui é "quantas entregas DE MONITORIA esse atendimento teve".
    // Evento sem serviço não conta em nenhum dos dois (serviço é obrigatório).
    const combinaServico = (a: EventoAgenda) => {
      if (filtroServicoTop10 === 'Todos') return true;
      const servicos = (a.servicos ?? []).join(' ');
      if (filtroServicoTop10 === 'Price') return /(price|prec)/i.test(servicos) || /precific/i.test(a.type || '');
      return /monitor/i.test(servicos);
    };

    const contagem = new Map<string, number>();
    // Amplitude real dos atendimentos contados (nem todo ano tem atendimento
    // de jan a dez) — o card mostra esse intervalo, não só o ano inteiro, pra
    // não sugerir cobertura que a base não tem.
    let inicio: Date | null = null;
    let fim: Date | null = null;
    agenda.forEach((a) => {
      if (!ativosIds.has(a.clientId) || !ehEntrega(a)) return;
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
  const foiReagendada = (a: EventoAgenda) => /reagend/i.test(a.status || '') || (a.reagendamentos ?? 0) > 0;
  const reagendamentosMes = reunioesAtivas.filter((a) => foiReagendada(a) && isSameMonth(parseISO(a.date), periodo)).length;
  const reagendamentosMesAnterior = reunioesAtivas.filter((a) => {
    const d = parseISO(a.date);
    return foiReagendada(a) && isSameMonth(d, periodoAnterior) && d.getDate() <= diaCorte;
  }).length;

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

  // --- Cobertura por serviço: dos atendimentos que TÊM o relógio do serviço
  // (contratado e não independente), quantos estão no prazo. Vem de
  // `calcularIndicadoresPrazo` (mesma regra do Ritmo e do agente).
  const { servicosDist, totalAtendidos } = useMemo(() => {
    const rotulo: Record<ServicoCad, string> = { Monitoria: 'Monitoria', Price: 'Price' };
    const dist = prazo.porServico.map((atual) => {
      const antes = prazoAnterior.porServico.find((x) => x.servico === atual.servico)!;
      return {
        label: rotulo[atual.servico],
        n: atual.cobertos.length,
        base: atual.cobertos.length + atual.descobertos.length,
        anterior: { n: antes.cobertos.length, base: antes.cobertos.length + antes.descobertos.length },
        cobertosClientes: atual.cobertos,
        descobertosClientes: atual.descobertos,
      };
    });
    return { servicosDist: dist, totalAtendidos: prazo.totalEmDia };
  }, [prazo, prazoAnterior]);

  // --- Composição da carteira (Dashboard da Carteira) — recortes do CADASTRO,
  // sempre por ATENDIMENTO (loja) e com o filtro de monitor. Cada distribuição
  // devolve {label, n} ordenado por contagem desc, pra virar barra de %.
  const contarPor = (lista: Cliente[], chave: (c: Cliente) => string) => {
    const contagem = new Map<string, number>();
    lista.forEach((c) => { const k = chave(c); contagem.set(k, (contagem.get(k) ?? 0) + 1); });
    return [...contagem.entries()].map(([label, n]) => ({ label, n })).sort((x, y) => y.n - x.n || x.label.localeCompare(y.label));
  };
  const doMonitor = (c: Cliente) => filtroMonitor === 'Todos' || c.monitor === filtroMonitor;

  const clientesPorMonitor = useMemo(() => contarPor(ativos, (c) => c.monitor?.trim() || 'Sem monitor'),
     
    [ativos]);

  // "Fora da monitoria": os não ativos, quebrados pelo motivo. Status fora de
  // atendimento (Suspenso, Atendido pelo Marco, Problemas Externos...) é o motivo
  // mais informativo; depois pausa temporária; senão o próprio estado Inativo.
  const foraDaMonitoria = useMemo(() => contarPor(inativos, (c) => {
    const status = (c.status || '').trim();
    if (status && !/^(ativo|regular|gratuidade)$/i.test(status)) return status;
    if (c.pausadoAte && parseISO(c.pausadoAte) >= new Date()) return 'Pausado';
    return 'Estado inativo';
  }),
     
    [inativos]);

  // "Saúde da carteira" — composição por STATUS de todos os cadastros do monitor
  // (ativos e não ativos: é justamente para mostrar Suspenso/Marco/Problemas
  // Externos). Cor = mesma classificação semântica do badge (`clienteStatusCor`).
  const saudeCarteira = useMemo(() => {
    const doFiltro = clientes.filter(doMonitor);
    const total = doFiltro.length;
    return contarPor(doFiltro, (c) => c.status?.trim() || 'Regular')
      .map((x) => ({ ...x, pct: total > 0 ? Math.round((x.n / total) * 100) : 0, color: clienteStatusCor(x.label) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, filtroMonitor]);

  // Profundidade de serviços contratados por atendimento ativo (1, 2, 3+).
  // Categorias ORDENADAS: rampa de um hue só (mais escuro = mais serviços).
  const profundidadeServicos = useMemo(() => {
    const baldes = [
      { label: '1 serviço', min: 1, max: 1, cor: 'color-mix(in srgb, var(--accent) 45%, var(--card-hover))' },
      { label: '2 serviços', min: 2, max: 2, cor: 'color-mix(in srgb, var(--accent) 70%, var(--card-hover))' },
      { label: '3+ serviços', min: 3, max: Infinity, cor: 'var(--accent)' },
    ];
    const semServico = ativos.filter((c) => (c.servicos ?? []).length === 0).length;
    const dist = baldes.map((b) => ({
      label: b.label,
      n: ativos.filter((c) => { const q = (c.servicos ?? []).length; return q >= b.min && q <= b.max; }).length,
      color: b.cor,
    }));
    if (semServico > 0) dist.unshift({ label: 'Nenhum serviço', n: semServico, color: 'var(--text-muted)' });
    const total = ativos.length;
    return dist.filter((d) => d.n > 0).map((d) => ({ ...d, pct: total > 0 ? Math.round((d.n / total) * 100) : 0 }));
  }, [ativos]);

  // Distribuição de risco (`AnalisesIA.nivelRisco`) entre os atendimentos ativos,
  // em ordem FIXA baixo → alto (escala ordinal). "Sem análise" é dado ausente,
  // não risco baixo. A comparação usa o risco vigente um mês antes (`riscoEm`,
  // com o histórico que a própria tela busca); sem histórico, não compara.
  const distribuicaoRisco = useMemo(() => {
    const nivelAtual = new Map(analisesIA.map((a) => [a.clientId, a.nivelRisco]));
    const nivelAnterior = riscoEm(analisesIA, historicoAnalises ?? [], referenciaAnterior);
    const niveis: { label: string; nivel: 'baixo' | 'medio' | 'alto' }[] = [
      { label: 'Risco baixo', nivel: 'baixo' },
      { label: 'Risco médio', nivel: 'medio' },
      { label: 'Risco alto', nivel: 'alto' },
    ];
    const total = ativos.length;
    const dist: { label: string; n: number; anterior: number | null; color: string }[] = niveis.map((n) => ({
      label: n.label,
      n: ativos.filter((c) => nivelAtual.get(c.id) === n.nivel).length,
      anterior: historicoAnalises ? ativosAnterior.filter((c) => nivelAnterior.get(c.id) === n.nivel).length : null,
      color: riscoIACor(n.nivel),
    }));
    const semAnalise = ativos.filter((c) => !nivelAtual.has(c.id)).length;
    if (semAnalise > 0) dist.push({ label: 'Sem análise', n: semAnalise, anterior: null, color: 'var(--text-muted)' });
    return dist.filter((d) => d.n > 0).map((d) => ({ ...d, pct: total > 0 ? Math.round((d.n / total) * 100) : 0 }));
  }, [ativos, ativosAnterior, analisesIA, historicoAnalises, referenciaAnterior]);

  // Média de serviços COM PRAZO (Monitoria e Price) por atendimento ativo — os
  // outros serviços do cadastro são informacionais e inflavam o número.
  const mediaServicosPorCliente = useMemo(() => mediaServicosDe(ativos), [ativos]);
  const mediaServicosAnterior = useMemo(() => mediaServicosDe(ativosAnterior), [ativosAnterior]);

  // Novos atendimentos (cadastros) do monitor no MÊS CORRENTE; comparação com o
  // mês anterior até o mesmo dia.
  const novosNoMes = (mesRef: Date, ateDia: number) => clientes.filter((c) => {
    const d = parseISO(c.createdAt || '');
    return doMonitor(c) && !isNaN(d.getTime()) && isSameMonth(d, mesRef) && d.getDate() <= ateDia;
  }).length;
  const novosClientesMes = useMemo(() => novosNoMes(new Date(), 31),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, filtroMonitor]);
  const novosClientesMesAnterior = useMemo(() => novosNoMes(subMonths(new Date(), 1), new Date().getDate()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, filtroMonitor]);

  // Segmento e linha: "Não informado" sai das barras e vira pendência de cadastro.
  const clientesPorLinha = useMemo(() => contarPor(ativos.filter((c) => c.linha?.trim()), (c) => (c.linha ?? '').trim()),
     
    [ativos]);
  const semLinha = ativos.filter((c) => !c.linha?.trim()).length;
  const clientesPorSegmento = useMemo(() => contarPor(ativos.filter((c) => c.local?.trim()), (c) => (c.local ?? '').trim()),
     
    [ativos]);
  const semSegmento = ativos.filter((c) => !c.local?.trim()).length;

  // --- Crescimento da carteira: atendimentos ATIVOS no fim de cada mês (hoje, no
  // mês corrente), pela mesma regra de `ativosEm` — sobe e desce com entradas e
  // saídas. Meses que terminam antes do início do log de status são aproximação
  // (status atual projetado para trás), e o ponto diz isso no tooltip.
  const inicioHistorico = useMemo(() => {
    const datas = statusHistorico
      .map((h) => (h.gravadoEm ? parseISO(h.gravadoEm) : null))
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
    return datas.length ? minDate(datas) : null;
  }, [statusHistorico]);
  const crescimentoCarteira = useMemo(() => {
    const datas = clientes.map((c) => parseISO(c.createdAt || '')).filter((d) => !isNaN(d.getTime()));
    if (datas.length === 0) return [];
    const agora = new Date();
    let meses = eachMonthOfInterval({ start: startOfMonth(minDate(datas)), end: startOfMonth(agora) });
    if (meses.length > 24) meses = meses.slice(meses.length - 24); // mesmo teto da tendência de reuniões
    return meses.map((m, i) => {
      const ref = isSameMonth(m, agora) ? agora : endOfMonth(m);
      const aproximado = !inicioHistorico || ref < inicioHistorico;
      return {
        label: m.getMonth() === 0 || i === 0 ? format(m, 'MMM/yy', { locale: ptBR }).replace('.', '') : format(m, 'MMM', { locale: ptBR }).replace('.', ''),
        full: format(m, "MMMM 'de' yyyy", { locale: ptBR }) + (aproximado ? ' (aproximado)' : ''),
        value: ativosEm(ref).length,
      };
    });
  }, [clientes, ativosEm, inicioHistorico]);

  // --- Cobertura da carteira no período: clientes ativos com >= 1 reunião,
  // relatório OU precificação nos ÚLTIMOS 2 MESES (mês selecionado + anterior,
  // não só o selecionado — janela mais realista de "foi atendido recentemente",
  // senão um cliente atendido no dia 1 do mês anterior aparecia "sem contato"
  // logo no início do mês seguinte). Precificação é TIPO de evento próprio
  // (não só serviço dentro de Reunião — ver `EventoAgenda.type`), por isso
  // entra no mesmo balde de "entrega" que Reunião/Relatório: só Contato/Ligação
  // fica de fora (não é "atendimento" formal do mês). Só conta o que foi
  // concluído/realizado. Como Aderência, NÃO segue o filtro "Tipo" do topo —
  // senão filtrar por Contato zeraria a cobertura sem sentido. ---
  const cobertura = useMemo(() => {
    const { cobertos, semContato } = prazo.cobertura;
    const total = cobertos.length + semContato.length;
    const antes = prazoAnterior.cobertura;
    return {
      cobertos: cobertos.length, semContato: semContato.length, total,
      pct: total > 0 ? Math.round((cobertos.length / total) * 100) : 0,
      cobertosClientes: cobertos, semContatoClientes: semContato,
      anterior: { cobertos: antes.cobertos.length, total: antes.cobertos.length + antes.semContato.length },
    };
  }, [prazo, prazoAnterior]);

  // --- Atendimentos no Ritmo: dos atendimentos com relógio, quantos estão em dia.
  // Em dia = TODOS os relógios no prazo (`atendimentoEmDia`); filtrado por serviço,
  // só o relógio daquele serviço. Quem está fora do prazo cai em um de três
  // baldes informativos (não mudam o percentual):
  // - agenda marcada: já existe reunião futura do serviço;
  // - contato recente: falamos com o cliente dentro do prazo de recontato;
  // - precisa contato: nenhum dos dois.
  const aderencia = useMemo(() => {
    const r = prazo.ritmo;
    return {
      total: r.total,
      pct: r.total > 0 ? Math.round((r.emDia.length / r.total) * 100) : 0,
      emDia: r.emDia.length, agendaMarcada: r.agendaMarcada.length,
      contatoRecente: r.contatoRecente.length, precisa: r.precisa.length,
      emDiaClientes: r.emDia, agendaMarcadaClientes: r.agendaMarcada,
      contatoRecenteClientes: r.contatoRecente, precisaClientes: r.precisa,
      anterior: { emDia: prazoAnterior.ritmo.emDia.length, total: prazoAnterior.ritmo.total },
    };
  }, [prazo, prazoAnterior]);

  // --- Vencendo (próx. 5 dias): relógios de Monitoria/Price a menos de 5 dias do
  // prazo e sem reunião futura marcada (`itensVencendo`, a mesma função do agente
  // e dos alertas). Um atendimento com 2 serviços vencendo aparece 2x.
  // `nome`/`servico` separados: juntos, o truncamento cortava o nome OU o serviço.
  const vencendo = useMemo(() => {
    const fila = buildFilaCadencia(ativos, agenda, acoes, cadencias, dataReferencia);
    const itens = itensVencendo(fila, 5)
      // Filtro salvo antigo ('Relatório') vira 'Todos' — esse relógio não existe mais.
      .filter((i) => !['Monitoria', 'Price'].includes(filtroServicoVencendo) || i.relogio.servico === filtroServicoVencendo)
      .map((i) => ({ nome: i.cliente.empresa, servico: i.relogio.servico, data: addDays(dataReferencia, i.diasParaVencer), dias: i.diasParaVencer }));
    return { total: itens.length, itens };
  }, [ativos, agenda, acoes, cadencias, filtroServicoVencendo, dataReferencia]);

  // --- Próximas agendas (forward-looking) ---
  const tiposDisponiveis = useMemo(() => ['Todos', ...new Set(agendaPorMonitor.map((a) => a.type).filter((t) => t && !/relat/i.test(t)))], [agendaPorMonitor]);
  // Chave de ordenação "yyyy-MM-dd HH:MM" (dia + hora), não `date.getTime()`
  // direto: o campo `time` (HH:MM) é separado de `date` e NÃO entra no
  // timestamp — dois eventos do mesmo dia empatavam em `date.getTime()` e
  // caíam na ordem de chegada da planilha, não na ordem real do dia (bug
  // real relatado: evento criado às 11h aparecia depois de outros do mesmo
  // dia sem horário mais cedo). Sem horário marcado, ordena como '00:00'
  // (início do dia) — mesmo critério já usado pro resto da Agenda.
  const chaveOrdem = (a: EventoAgenda) => `${format(parseISO(a.date), 'yyyy-MM-dd')} ${a.time || '00:00'}`;
  // Um só filtro de tipo (o do card): usa `agendaPorMonitor`, não `agendaAtiva`
  // (que já vinha filtrada pelo Tipo do topo). Relatórios ficam fora da lista e
  // viram uma linha de resumo da semana: são envio programado, não compromisso
  // com o cliente, e os automáticos (dezenas por mês) tomavam as 5 posições.
  const aindaVai = (a: EventoAgenda) => !/conclu|realiz|cancel|reagend/i.test(a.status || '') && differenceInCalendarDays(parseISO(a.date), hoje) >= 0;
  const proximos = useMemo(() =>
    agendaPorMonitor
      .filter((a) => aindaVai(a) && !/relat/i.test(a.type || ''))
      .filter((a) => filtroTipo === 'Todos' || a.type === filtroTipo)
      .sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)))
      .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaPorMonitor, filtroTipo]);
  const relatoriosSemana = useMemo(() =>
    agendaPorMonitor
      .filter((a) => aindaVai(a) && /relat/i.test(a.type || '') && differenceInCalendarDays(parseISO(a.date), hoje) < 7)
      .sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaPorMonitor]);
  // Próximo compromisso (não relatório) de cada atendimento — cruza "sem
  // acompanhamento" com o que já está marcado, pra não cobrar quem já tem reunião.
  const proximaPorCliente = useMemo(() => {
    const m = new Map<string, EventoAgenda>();
    for (const a of agendaPorMonitor) {
      if (!aindaVai(a) || /relat/i.test(a.type || '')) continue;
      const atual = m.get(a.clientId);
      if (!atual || chaveOrdem(a) < chaveOrdem(atual)) m.set(a.clientId, a);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaPorMonitor]);

  // --- Alertas de acompanhamento (reunião OU ação concluída) ---
  const alertas = prazo.semAcompanhamento;
  const alertasAnterior = prazoAnterior.semAcompanhamento.length;

  // Lembretes do monitor do filtro global (pelo cliente do lembrete); sem cliente, sempre aparece.
  const alertasProgramados = lembretes
    .filter((r) => r.status === 'ativo' && (!r.clientId || ativosIds.has(r.clientId)))
    .sort((a, b) => parseISO(a.datetime).getTime() - parseISO(b.datetime).getTime())
    .slice(0, 6);

  return {
    // filtros
    filtroTipo, setFiltroTipo, filtroMonitor, setFiltroMonitor, filtroTipoEvento, setFiltroTipoEvento,
    filtroServicoAderencia, setFiltroServicoAderencia,
    mes, setMes, ano, setAno, periodo, dataReferencia,
    monitoresDisponiveis, tiposEventoDisponiveis, anosDisponiveis, mesesDisponiveis,
    // base
    ativos, inativos, ativosNoPeriodo, ativosAnterior, referenciaAnterior, totalClientesDistintos, totalClientesDistintosAnterior, atendidosNoMes, agendaPorMonitor, acoesPorMonitor,
    // KPIs
    reunioesConcluidasMes, reunioesConcluidasMesAnterior, variacao, diaCorte, reunioesAgendadasMes, reagendamentosMes, reagendamentosMesAnterior,
    // gráfico
    linhaPorMes, linhaHighlight,
    // cards
    servicosDist, totalAtendidos, cobertura, aderencia,
    clientesPorMonitor, clientesPorSegmento, clientesPorLinha, crescimentoCarteira,
    saudeCarteira, profundidadeServicos, distribuicaoRisco, mediaServicosPorCliente, mediaServicosAnterior, novosClientesMes, novosClientesMesAnterior,
    foraDaMonitoria, semLinha, semSegmento, inicioHistorico,
    top10AtendimentosAno, filtroServicoTop10, setFiltroServicoTop10,
    vencendo, filtroServicoVencendo, setFiltroServicoVencendo,
    tiposDisponiveis, proximos, relatoriosSemana, proximaPorCliente,
    alertas, alertasAnterior, alertasProgramados,
    followUpThresholdDays: FOLLOW_UP_THRESHOLD_DAYS,
  };
}
