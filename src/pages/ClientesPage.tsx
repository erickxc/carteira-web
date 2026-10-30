import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import * as XLSX from 'xlsx';
import { Link, useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, ChevronUp, Combine, FileUp, LayoutDashboard, Plus, Search, TriangleAlert, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useSearchFilter } from '../hooks/useSearchFilter';
import { usePersistedState } from '../hooks/usePersistedState';
import { toastError, toastSuccess } from '../utils/toast';
import { buildFilaCadencia, comPrecificacaoDoGrupo, ehSolicitacao } from '../utils/cadenciaServico';
import { prazosDoCliente, type ResumoFicha } from '../utils/resumoFicha';
import { passaFiltroProduto, servicosDaImportacao } from '../utils/produtosTela';
import { FASES, renomearProduto } from 'carteira-shared/produtos.cjs';
import { ClientFormModal } from '../components/ClientFormModal';
import PainelCadastroAlvos from '../components/alvos/PainelCadastroAlvos';
import { UnirAtendimentosModal } from '../components/alvos/UnirAtendimentosModal';
import { ValorCert } from '../components/cliente/LojasFicha';
import { ValorPrazo } from '../components/cliente/PainelFicha';
import { buscarRetratoDw } from '../api/client';
import { lerSessao } from '../equipe/sessao';
import { certMaisProximo, fiscalDaLoja, type RetratoDw } from '../utils/produtosNoDw';
import { MenuMais } from '../components/MenuMais';
import { agruparPorGrupo, contarLojasFisicas, type LinhaTabela } from '../utils/gruposLojas';
import { Dropdown } from '../components/Dropdown';
import { Button, Card, Td, Th } from '../ui';
import { CLIENTE_ESTADO_OPCOES, CLIENTE_STATUS_OPCOES, TIPO_ANALISE_LABEL, type AnaliseIA, type Cliente, type EventoAgenda, type NovoCliente } from '../types';
import { formatarCNPJ } from '../utils/cnpj';

type SortCol = 'urgencia' | 'empresa' | 'monitor' | 'plataforma' | 'price' | 'ultimoContato' | 'proximo' | 'risco';

/** Começam do maior para o menor: o primeiro clique traz o mais atrasado, o mais recente, o maior risco. */
const COMECA_DECRESCENTE: SortCol[] = ['plataforma', 'price', 'ultimoContato', 'risco'];

const PERIODOS = [
  { valor: 'Todos', label: 'Últ. reunião: todas' },
  { valor: '7', label: 'Sem reunião +7d' },
  { valor: '15', label: 'Sem reunião +15d' },
  { valor: '30', label: 'Sem reunião +30d' },
  { valor: '60', label: 'Sem reunião +60d' },
];

const RISCO: Record<AnaliseIA['nivelRisco'], { texto: string; cor: string }> = {
  alto: { texto: 'alto', cor: 'var(--danger-fg)' },
  medio: { texto: 'médio', cor: 'var(--warning-fg)' },
  baixo: { texto: 'baixo', cor: 'var(--text-secondary)' },
};

function CelulaPrazo({ prazos, servico }: { prazos: ResumoFicha['prazos']; servico: string }) {
  const prazo = prazos.find((p) => p.servico === servico);
  return prazo ? <ValorPrazo prazo={prazo} curto /> : <span className="text-text-muted">—</span>;
}

/** Situação fora do normal, junto do nome. Regular e ativo não dizem nada: não ocupam a linha. */
function SituacaoFora({ cliente }: { cliente: Cliente }) {
  if ((cliente.estado || 'Ativo') !== 'Ativo') return <span className="font-medium text-[color:var(--danger-fg)]">Inativo</span>;
  if (cliente.status && !/^(regular|ativo)$/i.test(cliente.status)) return <span className="text-text-muted">{cliente.status}</span>;
  return null;
}

export default function ClientesPage() {
  const { clientes, agenda, acoes, analisesIA, cadencias, criarClientesEmLote, opcoesPorTipo, filtroMonitor } = useCarteira();
  const navigate = useNavigate();
  const hoje = new Date();

  const { value: search, debounced: debouncedSearch, setValue: setSearch } = useSearchFilter();
  const [fMonitores, setFMonitores] = usePersistedState<string[]>('filtro:clientes:monitores', []);
  const [fTipoAnalise, setFTipoAnalise] = usePersistedState<string>('filtro:clientes:analise', 'Todos');
  const [fServicos, setFServicos] = usePersistedState<string[]>('filtro:clientes:servicos', []);
  const [fFaseProduto, setFFaseProduto] = usePersistedState<string>('filtro:clientes:faseProduto', 'Ativo');
  const [fEstado, setFEstado] = usePersistedState<string>('filtro:clientes:estado:v2', 'Ativo');
  const [fStatus, setFStatus] = usePersistedState<string>('filtro:clientes:status:v2', 'Todos');
  const [fPeriodo, setFPeriodo] = usePersistedState<string>('filtro:clientes:periodo', 'Todos');
  // Campos menos usados no dia a dia que os de cima (segmento, linha, risco
  // do monitorIA) — ficam recolhidos em "Outros filtros" em vez de brigar
  // por espaço na barra principal.
  const [fRisco, setFRisco] = usePersistedState<string>('filtro:clientes:risco', 'Todos');
  const [fSegmento, setFSegmento] = usePersistedState<string>('filtro:clientes:segmento', 'Todos');
  const [fLinha, setFLinha] = usePersistedState<string>('filtro:clientes:linha', 'Todos');
  const [outrosFiltrosAbertos, setOutrosFiltrosAbertos] = useState(false);
  const [alvosAberto, setAlvosAberto] = usePersistedState('alvos:painel:aberto', false);
  const [pendenciasAlvos, setPendenciasAlvos] = useState(0);
  const informarPendencias = useCallback((n: number) => setPendenciasAlvos(n), []);
  // v2: a lista abre com quem precisa de atenção primeiro, não por nome.
  const [sortBy, setSortBy] = usePersistedState<SortCol>('filtro:clientes:sortBy:v2', 'urgencia');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('filtro:clientes:sortDir:v2', 'asc');
  const [modalState, setModalState] = useState<{ editing: Cliente | null } | null>(null);
  const [unindo, setUnindo] = useState(false);
  // Remonta o painel dos Dados Alvos depois de unir atendimentos — ele guarda o próprio estado.
  const [versaoVinculos, setVersaoVinculos] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vencimento do certificado é assunto do Fiscal: Negócios nem busca o retrato.
  const sessao = lerSessao();
  const verCert = sessao === 'fiscal' || sessao === 'admin';
  const colunas = verCert ? 8 : 7;
  const [retrato, setRetrato] = useState<RetratoDw | null>(null);
  useEffect(() => {
    if (!verCert) return;
    let vivo = true;
    // Informativo: sem retrato a coluna fica com "—".
    buscarRetratoDw().then((r) => { if (vivo) setRetrato(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [verCert]);

  // As análises já vêm do contexto: a tela não busca de novo.
  const analisesPorCliente = useMemo(() => new Map(analisesIA.map((a) => [a.clientId, a])), [analisesIA]);

  // Uma fila só para a tela inteira: mesma ordem e mesmos prazos da tela de Ações e da ficha.
  const { ordemFila, prazosPorCliente } = useMemo(() => {
    const fila = buildFilaCadencia(clientes, comPrecificacaoDoGrupo(agenda, clientes), acoes, cadencias, hoje);
    const relogios = new Map(fila.map((f) => [f.cliente.id, f.relogios]));
    return {
      ordemFila: new Map(fila.map((f, i) => [f.cliente.id, i])),
      prazosPorCliente: new Map(clientes.map((c) => [c.id, prazosDoCliente(c, relogios.get(c.id) ?? [])])),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, agenda, acoes, cadencias]);

  // Última reunião por cliente (reunião mais recente que JÁ ACONTECEU). SÓ
  // conta eventos do tipo Reunião — Contato/Relatório são eventos de agenda
  // mas não são reunião, então não atualizam esta coluna. Match por
  // palavra-chave (tipos são editáveis). Reunião futura com status Agendado
  // não conta (ainda não aconteceu) mesmo tendo a maior data; Cancelado/
  // Reagendado também não conta.
  const ultimaReuniao = useMemo(() => {
    const map = new Map<string, Date>();
    const concluida = (a: EventoAgenda) => /conclu|realiz/i.test(a.status || '');
    const cancelada = (a: EventoAgenda) => /cancel|reagend/i.test(a.status || '');
    agenda.forEach((a) => {
      if (!/reuni/i.test(a.type) || cancelada(a)) return;
      const d = parseISO(a.date);
      if (isNaN(d.getTime())) return;
      if (!concluida(a) && differenceInCalendarDays(d, hoje) >= 0) return;
      const atual = map.get(a.clientId);
      if (!atual || d > atual) map.set(a.clientId, d);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda]);

  // Próxima reunião e última conversa, com o mesmo critério do painel da ficha
  // (`resumoFicha`): a lista e a ficha nunca mostram datas diferentes. Relatório
  // não é "próxima" (envio programado), e cancelado/reagendado não conta nas duas.
  const { proximoAgendamento, ultimoContato } = useMemo(() => {
    const proximoMap = new Map<string, EventoAgenda>();
    const ultimoMap = new Map<string, EventoAgenda>();
    const concluido = (a: EventoAgenda) => /conclu|realiz/i.test(a.status || '');
    const cancelado = (a: EventoAgenda) => /cancel|reagend/i.test(a.status || '');
    // Inclui a precificação do grupo salva numa loja-irmã.
    comPrecificacaoDoGrupo(agenda, clientes).forEach((a) => {
      const d = parseISO(a.date);
      if (isNaN(d.getTime()) || ehSolicitacao(a) || cancelado(a)) return;
      const dias = differenceInCalendarDays(d, hoje);
      if (concluido(a)) {
        const atual = ultimoMap.get(a.clientId);
        if (dias <= 0 && (!atual || d > parseISO(atual.date))) ultimoMap.set(a.clientId, a);
      } else if (dias >= 0 && !/relat/i.test(a.type || '')) {
        const atual = proximoMap.get(a.clientId);
        if (!atual || d < parseISO(atual.date)) proximoMap.set(a.clientId, a);
      }
    });
    return { proximoAgendamento: proximoMap, ultimoContato: ultimoMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, clientes]);

  // Opções derivadas dos dados / categorias.
  const monitorOpcoes = useMemo(
    () => [...new Set(clientes.map((c) => c.monitor).filter(Boolean))].sort(),
    [clientes]
  );
  const servicoOpcoes = useMemo(() => opcoesPorTipo('servico'), [opcoesPorTipo]);
  // Mesmo padrão de monitorOpcoes: opções vêm do dado real (quem já está
  // cadastrado), não do catálogo inteiro de Categorias — evita opção vazia
  // que ninguém usa ainda poluindo o filtro.
  const segmentoOpcoes = useMemo(() => [...new Set(clientes.map((c) => c.local).filter(Boolean) as string[])].sort(), [clientes]);
  const linhaOpcoes = useMemo(() => [...new Set(clientes.map((c) => c.linha).filter(Boolean) as string[])].sort(), [clientes]);
  const statusOpcoes = useMemo(() => ['Todos', ...CLIENTE_STATUS_OPCOES], []);

  const filtrosAtivos =
    !!debouncedSearch.trim() || fMonitores.length > 0 || fTipoAnalise !== 'Todos' ||
    fServicos.length > 0 || fFaseProduto !== 'Ativo' || fEstado !== 'Todos' && fEstado !== 'Ativo' || fStatus !== 'Todos' || fPeriodo !== 'Todos' ||
    fRisco !== 'Todos' || fSegmento !== 'Todos' || fLinha !== 'Todos';
  // Quantos filtros ativos estão recolhidos em "Mais filtros".
  const qtdMaisFiltros = [
    fTipoAnalise !== 'Todos', fServicos.length > 0, fFaseProduto !== 'Ativo', fStatus !== 'Todos', fPeriodo !== 'Todos',
    fRisco !== 'Todos', fSegmento !== 'Todos', fLinha !== 'Todos',
  ].filter(Boolean).length;

  function limparFiltros() {
    setSearch(''); setFMonitores([]); setFTipoAnalise('Todos'); setFServicos([]); setFFaseProduto('Ativo'); setFEstado('Ativo'); setFStatus('Todos'); setFPeriodo('Todos');
    setFRisco('Todos'); setFSegmento('Todos'); setFLinha('Todos');
  }

  // Valor comparável de cada coluna, pra ordenação por clique no cabeçalho.
  function valorOrdenacao(c: Cliente, col: SortCol): string | number {
    // Atraso comparável: quem nunca foi atendido é o pior caso; independente ou sem o produto vem por último.
    const atrasoDe = (servico: string) => {
      const prazo = prazosPorCliente.get(c.id)?.find((p) => p.servico === servico);
      if (!prazo || prazo.independente) return -Infinity;
      return prazo.status === 'nunca' ? Infinity : prazo.atraso ?? -Infinity;
    };
    switch (col) {
      case 'urgencia': return ordemFila.get(c.id) ?? Infinity; // fora da fila (inativo, pausado) vai para o fim
      case 'empresa': return c.empresa.toLowerCase();
      case 'monitor': return (c.monitor || '').toLowerCase();
      case 'plataforma': return atrasoDe('Plataforma 2D');
      case 'price': return atrasoDe('2D Price');
      case 'risco': {
        const nivel = analisesPorCliente.get(c.id)?.nivelRisco;
        // Sem análise fica abaixo de "baixo": é ausência de informação, não risco baixo.
        return nivel === 'alto' ? 3 : nivel === 'medio' ? 2 : nivel === 'baixo' ? 1 : 0;
      }
      case 'proximo': {
        const p = proximoAgendamento.get(c.id);
        return p ? parseISO(p.date).getTime() : Infinity; // sem agendamento vai pro fim
      }
      case 'ultimoContato': {
        const u = ultimoContato.get(c.id);
        return u ? parseISO(u.date).getTime() : -Infinity;
      }
    }
  }

  function ordenarPor(col: SortCol) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir(COMECA_DECRESCENTE.includes(col) ? 'desc' : 'asc'); }
  }
  const seta = (col: SortCol) => (sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const filtrados = useMemo(() => {
    const termo = debouncedSearch.trim().toLowerCase();
    return clientes
      .filter((c) => fEstado === 'Todos' || (c.estado || (c.status === 'Suspenso' ? 'Inativo' : 'Ativo')) === fEstado)
      .filter((c) => fStatus === 'Todos' || c.status === fStatus)
      // Também acha pelo nome de uma LOJA do atendimento ou pelo CNPJ dela (1.6.9).
      .filter((c) => !termo || c.empresa?.toLowerCase().includes(termo) || (c.monitor ?? '').toLowerCase().includes(termo)
        || (c.lojasCadastro ?? []).some((l) => l.nome.toLowerCase().includes(termo)
          || (termo.replace(/\D/g, '').length >= 8 && l.cnpj.includes(termo.replace(/\D/g, '')))))
      // Dois filtros de monitor coexistem de propósito (mesmo caso já corrigido
      // na Agenda): o GLOBAL do header (filtroMonitor) e o LOCAL desta tela
      // (fMonitores, multi-seleção) — os dois precisam valer ao mesmo tempo.
      // Antes o global era ignorado aqui, então trocar ele no header não
      // filtrava nada na lista de Clientes.
      .filter((c) => filtroMonitor === 'Todos' || c.monitor === filtroMonitor)
      .filter((c) => fMonitores.length === 0 || fMonitores.includes(c.monitor))
      .filter((c) => fTipoAnalise === 'Todos' || (c.tipoAnalise ?? 'unitaria') === fTipoAnalise)
      .filter((c) => passaFiltroProduto(c, fServicos, fFaseProduto))
      .filter((c) => {
        if (fRisco === 'Todos') return true;
        const nivel = analisesPorCliente.get(c.id)?.nivelRisco;
        return fRisco === 'sem_analise' ? !nivel : nivel === fRisco;
      })
      .filter((c) => fSegmento === 'Todos' || c.local === fSegmento)
      .filter((c) => fLinha === 'Todos' || c.linha === fLinha)
      .filter((c) => {
        if (fPeriodo === 'Todos') return true;
        const n = Number(fPeriodo);
        const ult = ultimaReuniao.get(c.id);
        const dias = ult ? differenceInCalendarDays(hoje, ult) : Infinity; // nunca = sempre "vencido"
        return dias > n;
      })
      .sort((a, b) => {
        const va = valorOrdenacao(a, sortBy);
        const vb = valorOrdenacao(b, sortBy);
        // `===` antes da subtração: Infinity - Infinity daria NaN e bagunçaria a ordem.
        let r = va === vb ? 0 : typeof va === 'number' && typeof vb === 'number' ? (va < vb ? -1 : 1) : String(va).localeCompare(String(vb));
        if (r === 0) r = a.empresa.localeCompare(b.empresa);
        return sortDir === 'asc' ? r : -r;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, debouncedSearch, filtroMonitor, fMonitores, fTipoAnalise, fServicos, fFaseProduto, fRisco, fSegmento, fLinha, fEstado, fStatus, fPeriodo, ultimaReuniao, proximoAgendamento, ultimoContato, sortBy, sortDir, analisesPorCliente, ordemFila, prazosPorCliente]);

  // Lojas da mesma rede (`Cliente.grupo`, ex.: "Altese - Recreio + Barra" e
  // "Altese - GM, Ford, Fiat, VW") viram um bloco recolhível na tabela — cada
  // loja continua sendo um cliente 100% independente por trás (cadastro,
  // cadência, análise própria); isso é só apresentação. `principal` (a loja
  // mais antiga do grupo) é quem "dá a cara" ao cabeçalho fechado — grupo
  // já confirmado, nos dados reais, sempre com monitor único entre lojas.
  const linhas = useMemo(() => agruparPorGrupo(filtrados, clientes), [filtrados, clientes]);

  // Recolhido por padrão; abre sozinho quando há filtro ativo (senão uma
  // busca por nome de loja "encontraria" o registro mas ele ficaria escondido
  // dentro de um acordeão fechado) — MAS um clique manual explícito sempre
  // vence essa regra automática. Sem isso, o botão "recolher" parecia
  // quebrado (bug real reportado): com qualquer filtro ativo (inclusive um
  // sem relação nenhuma com aquele grupo, ex. Segmento), TODO grupo abria
  // sozinho e clicar pra fechar não tinha efeito nenhum, sempre.
  const [gruposManual, setGruposManual] = useState<Map<string, boolean>>(new Map());
  function alternarGrupo(grupo: string) {
    setGruposManual((prev) => {
      const novo = new Map(prev);
      novo.set(grupo, !grupoAberto(grupo));
      return novo;
    });
  }
  function grupoAberto(grupo: string): boolean {
    return gruposManual.get(grupo) ?? filtrosAtivos;
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const parsed: NovoCliente[] = rows
      .map((row) => {
        const servicos = servicosDaImportacao(row, servicoOpcoes);
        return {
          empresa: String(row.Empresa ?? row.empresa ?? '').trim(),
          monitor: String(row.Monitor ?? row.monitor ?? '').trim(),
          servicos,
          observacao: String(row.Observacao ?? row.Observação ?? row.observacao ?? ''),
          status: String(row.Status ?? row.status ?? 'Regular').trim() || 'Regular',
        };
      })
      .filter((c) => c.empresa);

    if (parsed.length === 0) {
      toastError('Nenhum cliente válido encontrado na planilha (coluna "Empresa" é obrigatória).');
    } else {
      await criarClientesEmLote(parsed);
      toastSuccess(`${parsed.length} cliente(s) importado(s) com sucesso.`);
    }
    e.target.value = '';
  }

  const abrirFicha = (cliente: Cliente) => navigate(`/clientes/${cliente.id}`);
  /** Clique na linha abre a ficha, menos quando o clique foi num link ou botão dela. */
  const cliqueNaLinha = (cliente: Cliente) => (e: MouseEvent<HTMLTableRowElement>) => {
    if (!(e.target as HTMLElement).closest('a, button')) abrirFicha(cliente);
  };

  /** Uma linha por atendimento. `prefixo`: a seta e o nome do bloco (rede ou atendimento com várias lojas). */
  function renderLinhaCliente(cliente: Cliente, opts?: {
    indent?: boolean;
    prefixo?: { nome: string; qtdLojas: number; aberto: boolean; onToggle: () => void };
    /** Rede fechada: o clique na linha abre o bloco em vez de ir para uma das lojas. */
    cliqueAbreBloco?: boolean;
    /** Rede fechada: a data é da rede toda; um certificado vencido não pode sumir atrás da linha da frente. */
    certDe?: Cliente[];
  }) {
    const ultC = ultimoContato.get(cliente.id);
    const prox = proximoAgendamento.get(cliente.id);
    const risco = analisesPorCliente.get(cliente.id)?.nivelRisco;
    const prazos = prazosPorCliente.get(cliente.id) ?? [];
    return (
      <tr
        key={cliente.id}
        className="group cursor-pointer [&:last-child>td]:border-b-0"
        onClick={opts?.cliqueAbreBloco && opts.prefixo ? opts.prefixo.onToggle : cliqueNaLinha(cliente)}
      >
        <Td first>
          <span className="flex items-baseline gap-2 min-w-0" style={opts?.indent ? { paddingLeft: '1.4rem' } : undefined}>
            {opts?.prefixo ? (
              <button
                type="button"
                className="link-button self-center inline-flex items-center gap-1.5 font-semibold whitespace-nowrap"
                onClick={(e) => { e.stopPropagation(); opts.prefixo!.onToggle(); }}
                aria-expanded={opts.prefixo.aberto}
                aria-label={`${opts.prefixo.aberto ? 'Recolher' : 'Abrir'} ${opts.prefixo.nome}`}
              >
                {opts.prefixo.aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                {opts.prefixo.nome}
              </button>
            ) : (
              <Link className="link-button font-semibold whitespace-nowrap" to={`/clientes/${cliente.id}`}>{cliente.empresa}</Link>
            )}
            {opts?.prefixo && <span className="text-text-muted text-[0.78rem] whitespace-nowrap">{opts.prefixo.qtdLojas} lojas</span>}
            <span className="text-[0.78rem] whitespace-nowrap"><SituacaoFora cliente={cliente} /></span>
          </span>
        </Td>
        <Td className="text-text-muted whitespace-nowrap">{cliente.monitor || '—'}</Td>
        <Td className="whitespace-nowrap"><CelulaPrazo prazos={prazos} servico="Plataforma 2D" /></Td>
        <Td className="whitespace-nowrap"><CelulaPrazo prazos={prazos} servico="2D Price" /></Td>
        <Td className="whitespace-nowrap">{ultC ? format(parseISO(ultC.date), 'dd/MM/yy') : <span className="text-text-muted">—</span>}</Td>
        <Td className="whitespace-nowrap">
          {prox ? format(parseISO(prox.date), 'dd/MM/yy') : <span className="text-text-muted">—</span>}
          {prox && /pendente/i.test(prox.status || '') && <span className="text-text-muted text-[0.78rem]"> pendente</span>}
        </Td>
        <Td className="whitespace-nowrap">
          {risco ? <span className="font-medium" style={{ color: RISCO[risco].cor }}>{RISCO[risco].texto}</span> : <span className="text-text-muted">—</span>}
        </Td>
        {verCert && <Td className="whitespace-nowrap"><ValorCert data={certMaisProximo(opts?.certDe ?? [cliente], retrato)} /></Td>}
      </tr>
    );
  }

  /** Loja física dentro de um atendimento aberto: só identifica a loja; os dados são do atendimento. */
  function renderLinhasDeLojas(cliente: Cliente, nivel: number) {
    return (cliente.lojasCadastro ?? []).map((loja, i) => (
      <tr key={`${cliente.id}-loja-${i}`} className="group cursor-pointer [&:last-child>td]:border-b-0" onClick={cliqueNaLinha(cliente)}>
        <Td first colSpan={7} className="text-[0.82rem]">
          <span style={{ paddingLeft: `${nivel * 1.4}rem` }}>
            {loja.nome || cliente.empresa}
            <span className="text-text-muted text-[0.76rem]"> · {loja.cnpj ? formatarCNPJ(loja.cnpj) : 'sem CNPJ'}</span>
          </span>
        </Td>
        {verCert && <Td className="whitespace-nowrap text-[0.82rem]"><ValorCert data={fiscalDaLoja(retrato, loja.cnpj)?.certificadoValidade} /></Td>}
      </tr>
    ));
  }

  /**
   * Bloco recolhível. Atendimento único com várias lojas: a linha é o próprio
   * atendimento e abrir só lista as lojas. Rede com vários atendimentos: fechada,
   * mostra a linha do atendimento que deu a posição ao bloco (a ordenação continua
   * conferível); aberta, vira um título com cada atendimento embaixo.
   */
  function renderLinhaGrupo(linha: Extract<LinhaTabela, { tipo: 'grupo' }>) {
    const aberto = grupoAberto(linha.grupo);
    const onToggle = () => alternarGrupo(linha.grupo);
    const prefixo = { nome: linha.grupo, qtdLojas: contarLojasFisicas(linha.lojas), aberto, onToggle };

    if (linha.lojas.length === 1) {
      return (
        <Fragment key={`grupo-${linha.grupo}`}>
          {renderLinhaCliente(linha.lojas[0], { prefixo })}
          {aberto && renderLinhasDeLojas(linha.lojas[0], 1)}
        </Fragment>
      );
    }
    if (!aberto) return renderLinhaCliente(linha.lojas[0], { prefixo, cliqueAbreBloco: true, certDe: linha.lojas });

    return (
      <Fragment key={`grupo-${linha.grupo}`}>
        <tr className="group cursor-pointer" onClick={onToggle}>
          <Td first colSpan={colunas}>
            <span className="inline-flex items-center gap-2">
              <button type="button" className="link-button inline-flex items-center gap-1.5 font-semibold" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-expanded={aberto}>
                <ChevronDown size={15} /> {linha.grupo}
              </button>
              <span className="text-text-muted text-[0.78rem]">{prefixo.qtdLojas} lojas</span>
            </span>
          </Td>
        </tr>
        {linha.lojas.map((atendimento) => (
          <Fragment key={atendimento.id}>
            {renderLinhaCliente(atendimento, { indent: true })}
            {(atendimento.lojasCadastro?.length ?? 0) > 1 && renderLinhasDeLojas(atendimento, 2)}
          </Fragment>
        ))}
      </Fragment>
    );
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Carteira</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            {filtrados.length} de {clientes.length} clientes
            {sortBy === 'urgencia' ? ' · mais urgentes primeiro' : (
              <> · <button type="button" className="link-button" onClick={() => { setSortBy('urgencia'); setSortDir('asc'); }}>ver mais urgentes primeiro</button></>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setAlvosAberto((v) => !v)} aria-expanded={alvosAberto}>
            {pendenciasAlvos > 0 && <TriangleAlert size={15} style={{ color: 'var(--warning-fg)' }} />}
            Dados Alvos{pendenciasAlvos > 0 && ` · ${pendenciasAlvos}`}
          </Button>
          <Button variant="secondary" onClick={() => setUnindo(true)}><Combine size={15} /> Unir atendimentos</Button>
          <MenuMais itens={[
            { rotulo: <><LayoutDashboard size={14} /> Dashboard da Carteira</>, onClick: () => navigate('/clientes/dashboard') },
            { rotulo: <><FileUp size={14} /> Importar planilha</>, onClick: () => fileInputRef.current?.click() },
          ]} />
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportFile} />
          <Button variant="primary" onClick={() => setModalState({ editing: null })}><Plus size={15} /> Novo cliente</Button>
        </div>
      </div>

      <PainelCadastroAlvos key={versaoVinculos} aberto={alvosAberto} onFechar={() => setAlvosAberto(false)} onPendencias={informarPendencias} />

      {/* Filtros em uma linha: o que se usa todo dia; o resto fica em "Mais filtros". */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="filter-ctl filter-search flex-1 min-w-[220px]">
          <Search size={16} />
          <input placeholder="Buscar cliente, loja, CNPJ ou monitor..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="w-[180px]">
          <Dropdown label="Monitor" multiple options={monitorOpcoes.map((m) => ({ value: m, label: m }))} value={fMonitores} onChange={(v) => setFMonitores(v as string[])} />
        </div>
        <div className="w-[160px]">
          <Dropdown
            label="Situação: ativos"
            options={['Todos', ...CLIENTE_ESTADO_OPCOES].map((e) => ({ value: e, label: e === 'Todos' ? 'Situação: todos' : e === 'Ativo' ? 'Situação: ativos' : 'Situação: inativos' }))}
            value={fEstado}
            onChange={(v) => setFEstado(v as string)}
          />
        </div>
        <Button variant="secondary" onClick={() => setOutrosFiltrosAbertos((v) => !v)} aria-expanded={outrosFiltrosAbertos}>
          {outrosFiltrosAbertos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Mais filtros{qtdMaisFiltros > 0 && ` (${qtdMaisFiltros})`}
        </Button>
        {filtrosAtivos && (
          <Button variant="ghost" onClick={limparFiltros}><X size={14} /> Limpar</Button>
        )}
      </div>

      {outrosFiltrosAbertos && (
        <div className="filter-grid mb-3">
          <Dropdown
            label="Produtos"
            multiple
            options={servicoOpcoes.map((o) => ({ value: o, label: o }))}
            // Filtro salvo com o nome de antes da 1.7 aparece marcado na opção de hoje.
            value={fServicos.map((f) => servicoOpcoes.find((o) => renomearProduto(o) === renomearProduto(f)) ?? f)}
            onChange={(v) => setFServicos(v as string[])}
          />
          <Dropdown
            label="Fase: ativo"
            options={['Todas', ...FASES].map((f) => ({ value: f, label: `Fase: ${f.toLowerCase()}` }))}
            value={fFaseProduto}
            onChange={(v) => setFFaseProduto(v as string)}
          />
          <Dropdown
            label="Status: todos"
            options={statusOpcoes.map((o) => ({ value: o, label: o === 'Todos' ? 'Status: todos' : o }))}
            value={fStatus}
            onChange={(v) => setFStatus(v as string)}
          />
          <Dropdown
            label="Últ. reunião: todas"
            defaultValue="Todos"
            options={PERIODOS.map((o) => ({ value: o.valor, label: o.label }))}
            value={fPeriodo}
            onChange={(v) => setFPeriodo(v as string)}
          />
          <Dropdown
            label="Risco: todos"
            defaultValue="Todos"
            options={[
              { value: 'Todos', label: 'Risco: todos' },
              { value: 'baixo', label: 'Risco baixo' },
              { value: 'medio', label: 'Risco médio' },
              { value: 'alto', label: 'Risco alto' },
              { value: 'sem_analise', label: 'Sem análise' },
            ]}
            value={fRisco}
            onChange={(v) => setFRisco(v as string)}
          />
          <Dropdown
            label="Segmento: todos"
            defaultValue="Todos"
            options={[{ value: 'Todos', label: 'Segmento: todos' }, ...segmentoOpcoes.map((o) => ({ value: o, label: o }))]}
            value={fSegmento}
            onChange={(v) => setFSegmento(v as string)}
          />
          <Dropdown
            label="Linha: todas"
            defaultValue="Todos"
            options={[{ value: 'Todos', label: 'Linha: todas' }, ...linhaOpcoes.map((o) => ({ value: o, label: o }))]}
            value={fLinha}
            onChange={(v) => setFLinha(v as string)}
          />
          <Dropdown
            label="Análise: todas"
            defaultValue="Todos"
            options={[
              { value: 'Todos', label: 'Análise: todas' },
              { value: 'unitaria', label: TIPO_ANALISE_LABEL.unitaria },
              { value: 'segmentado', label: 'Segmentado' },
            ]}
            value={fTipoAnalise}
            onChange={(v) => setFTipoAnalise(v as string)}
          />
        </div>
      )}

      {filtrados.length === 0 ? (
        <Card flat><div className="empty-state">Nenhum cliente com esses filtros.</div></Card>
      ) : (
        <>
          {/* Computador: a lista rola por dentro e o cabeçalho fica sempre à vista. */}
          <Card flat className="hidden md:block" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="overflow-auto max-h-[calc(100vh-13.5rem)]">
              <table className="w-full border-collapse text-[0.88rem]">
                <thead className="sticky top-0 z-[1] bg-card">
                  <tr>
                    <Th sortable onClick={() => ordenarPor('empresa')}>Cliente{seta('empresa')}</Th>
                    <Th sortable onClick={() => ordenarPor('monitor')}>Monitor{seta('monitor')}</Th>
                    <Th sortable onClick={() => ordenarPor('plataforma')} title="Dias até vencer; + é atraso">Plataforma 2D{seta('plataforma')}</Th>
                    <Th sortable onClick={() => ordenarPor('price')} title="Dias até vencer; + é atraso">2D Price{seta('price')}</Th>
                    <Th sortable onClick={() => ordenarPor('ultimoContato')} title="Última entrega ou conversa concluída">Última{seta('ultimoContato')}</Th>
                    <Th sortable onClick={() => ordenarPor('proximo')} title="Próxima reunião ou entrega marcada">Próxima{seta('proximo')}</Th>
                    <Th sortable onClick={() => ordenarPor('risco')} title="Risco da análise do monitorIA">Risco{seta('risco')}</Th>
                    {verCert && <Th title="Vencimento mais próximo entre as lojas do atendimento">Vencimento Cert.</Th>}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha) =>
                    linha.tipo === 'grupo'
                      ? renderLinhaGrupo(linha)
                      : renderLinhaCliente(linha.cliente)
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Celular: um cartão curto por atendimento, na mesma ordem. */}
          <ul className="md:hidden flex flex-col gap-2 list-none p-0 m-0">
            {filtrados.map((c) => {
              const prazos = prazosPorCliente.get(c.id) ?? [];
              const prox = proximoAgendamento.get(c.id);
              return (
                <li key={c.id}>
                  <Link to={`/clientes/${c.id}`} className="block rounded border border-border bg-card px-4 py-3 no-underline">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-text-primary">{c.empresa}</span>
                      <span className="text-[0.78rem]"><SituacaoFora cliente={c} /></span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.82rem] text-text-muted">
                      {prazos.map((p) => <span key={p.servico}>{p.servico}: <ValorPrazo prazo={p} curto /></span>)}
                      <span>Próxima: {prox ? format(parseISO(prox.date), 'dd/MM') : '—'}</span>
                      {verCert && <span>Cert.: <ValorCert data={certMaisProximo([c], retrato)} /></span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {modalState && (
        <ClientFormModal initial={modalState.editing ?? undefined} onClose={() => setModalState(null)} />
      )}

      {unindo && (
        <UnirAtendimentosModal onClose={() => setUnindo(false)} onSalvo={() => setVersaoVinculos((v) => v + 1)} />
      )}
    </div>
  );
}
