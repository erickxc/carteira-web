import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as api from '../api/client';
import { resolverNomesClientes } from '../utils/agendaNomes';
import { isClienteAtivo } from '../utils/formatters';
import type {
  Acao,
  AgendaSerie,
  AnaliseIA,
  AgilBoard,
  AgilWorkspace,
  AgilColuna,
  AgilComentario,
  AgilCampoPersonalizado,
  AgilFrente,
  AgilIniciativa,
  AgilSubtarefa,
  AgilTarefa,
  Anexo,
  Cadencias,
  CeoAgendaCache,
  Categoria,
  CategoriaTipo,
  ExtraLinkServico,
  Cliente,
  EventoAgenda,
  Lembrete,
  Modelo,
  NovaAgendaSerie,
  NovaAgilColuna,
  NovaAgilFrente,
  NovaAgilIniciativa,
  NovoAgilCampoPersonalizado,
  NovaAgilSubtarefa,
  NovaAgilWorkspace,
  NovaAgilTarefa,
  NovoAgilBoard,
  NovoAgilComentario,
  NovoCliente,
  NovoEvento,
  NovoLembrete,
} from '../types';

const CEO_AGENDA_VAZIA: CeoAgendaCache = { events: [], lastSync: null, lastError: null };

const CADENCIAS_PADRAO: Cadencias = {
  reuniao_dias: 30,
  relatorio_dias: 45,
  primeiro_contato_dias: 14,
  esfriando_dias: 45,
  monitoria_dias: 30,
  price_dias: 30,
  recontato_dias: 5,
  peso_contato_recente: 50,
};

interface CarteiraContextValue {
  clientes: Cliente[];
  /**
   * Filtro GLOBAL de monitor — "quem sou eu nesta máquina". Existe porque o
   * app não tem autenticação (LAN, qualquer um usa o mesmo navegador/máquina)
   * e mesmo assim cada monitor só deveria ver o que é dele: seus clientes na
   * Visão Geral, seus alertas no monitorIA. Fica AQUI (Context), e não
   * duplicado em `usePersistedState` por página, porque duas instâncias
   * independentes de `usePersistedState` não se sincronizam entre si — mudar
   * numa tela não atualizaria a outra já montada. Persistido em localStorage
   * (por navegador/máquina), único ponto de leitura e escrita.
   */
  filtroMonitor: string;
  setFiltroMonitor: (monitor: string) => void;
  /** ['Todos', ...monitores com cliente ativo] — mesma derivação usada pelo filtro da Visão Geral. */
  monitoresDisponiveis: string[];
  agenda: EventoAgenda[];
  agendaSeries: AgendaSerie[];
  lembretes: Lembrete[];
  categorias: Categoria[];
  acoes: Acao[];
  /** Última análise automática (dossiê/risco) de cada cliente, uma por
   *  `clientId` — usada hoje pela fila de Ações (desempate por urgência do
   *  dossiê, `nivelRisco`) e reaproveitável por qualquer tela que precise do
   *  mesmo dado sem fazer fetch próprio. */
  analisesIA: AnaliseIA[];
  modelos: Modelo[];
  cadencias: Cadencias;
  agilWorkspaces: AgilWorkspace[];
  agilBoards: AgilBoard[];
  agilColunas: AgilColuna[];
  agilIniciativas: AgilIniciativa[];
  agilFrentes: AgilFrente[];
  agilCamposPersonalizados: AgilCampoPersonalizado[];
  agilTarefas: AgilTarefa[];
  agilSubtarefas: AgilSubtarefa[];
  agilComentarios: AgilComentario[];
  loading: boolean;
  error: string | null;
  recarregar: () => Promise<void>;

  /** Camada isolada e somente-leitura: nunca afeta `loading`/`error` acima —
   *  uma falha aqui (Google fora do ar, link não configurado) não pode
   *  impedir o carregamento do resto da Carteira. */
  ceoAgenda: CeoAgendaCache;

  /** Lista de valores (strings) de uma categoria, na ordem cadastrada. */
  opcoesPorTipo: (tipo: CategoriaTipo) => string[];
  /** Igual, mas devolve o objeto `Categoria` inteiro (tipoLink/urlAplicacao inclusos). */
  categoriasPorTipo: (tipo: CategoriaTipo) => Categoria[];

  criarCliente: (data: NovoCliente) => Promise<Cliente>;
  criarClientesEmLote: (data: NovoCliente[]) => Promise<Cliente[]>;
  atualizarCliente: (id: string, data: Partial<Cliente>) => Promise<void>;
  removerCliente: (id: string) => Promise<void>;

  criarEvento: (data: NovoEvento) => Promise<EventoAgenda>;
  atualizarEvento: (id: string, data: Partial<EventoAgenda>) => Promise<void>;
  removerEvento: (id: string) => Promise<void>;
  enviarAnexoEvento: (eventoId: string, file: File) => Promise<void>;
  removerAnexoEvento: (eventoId: string, anexo: Anexo) => Promise<void>;

  /** Cria a REGRA de recorrência — o servidor materializa o mês corrente na
   *  hora e os meses seguintes conforme eles chegam (ver server/agendaSeries.cjs). */
  criarAgendaSerie: (data: NovaAgendaSerie) => Promise<AgendaSerie>;
  atualizarAgendaSerie: (id: string, data: Partial<AgendaSerie>) => Promise<void>;
  /** Remove a regra; os eventos já gerados por ela permanecem na agenda. */
  removerAgendaSerie: (id: string) => Promise<void>;

  criarLembrete: (data: NovoLembrete) => Promise<Lembrete>;
  atualizarLembrete: (id: string, data: Partial<Lembrete>) => Promise<void>;
  removerLembrete: (id: string) => Promise<void>;

  criarCategoria: (tipo: CategoriaTipo, valor: string, extra?: ExtraLinkServico) => Promise<void>;
  atualizarCategoria: (id: string, valor: string, extra?: ExtraLinkServico) => Promise<void>;
  removerCategoria: (id: string) => Promise<void>;

  registrarAcao: (data: Omit<Acao, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  atualizarAcao: (id: string, data: Partial<Acao>) => Promise<void>;
  removerAcao: (id: string) => Promise<void>;

  criarModelo: (data: Omit<Modelo, 'id' | 'createdAt'>) => Promise<void>;
  atualizarModelo: (id: string, data: Partial<Modelo>) => Promise<void>;
  removerModelo: (id: string) => Promise<void>;

  salvarCadencias: (data: Cadencias) => Promise<void>;

  criarAgilWorkspace: (data: NovaAgilWorkspace) => Promise<AgilWorkspace>;
  atualizarAgilWorkspace: (id: string, data: Partial<AgilWorkspace>) => Promise<void>;
  removerAgilWorkspace: (id: string) => Promise<void>;
  reordenarAgilWorkspaces: (itens: { id: string; ordem: number }[]) => Promise<void>;

  criarAgilBoard: (data: NovoAgilBoard) => Promise<AgilBoard>;
  atualizarAgilBoard: (id: string, data: Partial<AgilBoard>) => Promise<void>;
  removerAgilBoard: (id: string) => Promise<void>;

  criarAgilColuna: (data: NovaAgilColuna) => Promise<AgilColuna>;
  atualizarAgilColuna: (id: string, data: Partial<AgilColuna>) => Promise<void>;
  removerAgilColuna: (id: string) => Promise<void>;
  reordenarAgilColunas: (itens: { id: string; ordem: number }[]) => Promise<void>;

  criarAgilIniciativa: (data: NovaAgilIniciativa) => Promise<AgilIniciativa>;
  atualizarAgilIniciativa: (id: string, data: Partial<AgilIniciativa>) => Promise<void>;
  removerAgilIniciativa: (id: string) => Promise<void>;
  reordenarAgilIniciativas: (itens: { id: string; ordem: number }[]) => Promise<void>;

  criarAgilFrente: (data: NovaAgilFrente) => Promise<AgilFrente>;
  atualizarAgilFrente: (id: string, data: Partial<AgilFrente>) => Promise<void>;
  removerAgilFrente: (id: string) => Promise<void>;
  reordenarAgilFrentes: (itens: { id: string; ordem: number }[]) => Promise<void>;

  criarAgilCampoPersonalizado: (data: NovoAgilCampoPersonalizado) => Promise<AgilCampoPersonalizado>;
  atualizarAgilCampoPersonalizado: (id: string, data: Partial<AgilCampoPersonalizado>) => Promise<void>;
  removerAgilCampoPersonalizado: (id: string) => Promise<void>;
  reordenarAgilCamposPersonalizados: (itens: { id: string; ordem: number }[]) => Promise<void>;

  criarAgilTarefa: (data: NovaAgilTarefa) => Promise<AgilTarefa>;
  atualizarAgilTarefa: (id: string, data: Partial<AgilTarefa>) => Promise<void>;
  removerAgilTarefa: (id: string) => Promise<void>;
  /** Move/reordena cards (drag do Kanban) — aplica local otimista e persiste em lote. */
  moverAgilTarefas: (itens: { id: string; colunaId: string; ordem: number }[]) => Promise<void>;

  criarAgilSubtarefa: (data: NovaAgilSubtarefa) => Promise<AgilSubtarefa>;
  atualizarAgilSubtarefa: (id: string, data: Partial<AgilSubtarefa>) => Promise<void>;
  removerAgilSubtarefa: (id: string) => Promise<void>;

  criarAgilComentario: (data: NovoAgilComentario) => Promise<AgilComentario>;
  removerAgilComentario: (id: string) => Promise<void>;
}

const CarteiraContext = createContext<CarteiraContextValue | null>(null);

export function CarteiraProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  // Filtro global de monitor — ver o comentário na interface acima.
  const [filtroMonitor, setFiltroMonitor] = useState<string>(() => {
    try { return window.localStorage.getItem('filtro:global:monitor') ?? 'Todos'; } catch { return 'Todos'; }
  });
  const definirFiltroMonitor = useCallback((monitor: string) => {
    setFiltroMonitor(monitor);
    try { window.localStorage.setItem('filtro:global:monitor', monitor); } catch { /* localStorage indisponível — filtro só não persiste */ }
  }, []);
  const monitoresDisponiveis = useMemo(
    () => ['Todos', ...[...new Set(clientes.filter((c) => isClienteAtivo(c)).map((c) => c.monitor).filter(Boolean))].sort()],
    [clientes],
  );
  const [agendaBruta, setAgenda] = useState<EventoAgenda[]>([]);
  const [agendaSeries, setAgendaSeries] = useState<AgendaSerie[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [analisesIA, setAnalisesIA] = useState<AnaliseIA[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [cadencias, setCadencias] = useState<Cadencias>(CADENCIAS_PADRAO);
  const [agilWorkspaces, setAgilWorkspaces] = useState<AgilWorkspace[]>([]);
  const [agilBoards, setAgilBoards] = useState<AgilBoard[]>([]);
  const [agilColunas, setAgilColunas] = useState<AgilColuna[]>([]);
  const [agilIniciativas, setAgilIniciativas] = useState<AgilIniciativa[]>([]);
  const [agilFrentes, setAgilFrentes] = useState<AgilFrente[]>([]);
  const [agilCamposPersonalizados, setAgilCamposPersonalizados] = useState<AgilCampoPersonalizado[]>([]);
  const [agilTarefas, setAgilTarefas] = useState<AgilTarefa[]>([]);
  const [agilSubtarefas, setAgilSubtarefas] = useState<AgilSubtarefa[]>([]);
  const [agilComentarios, setAgilComentarios] = useState<AgilComentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ceoAgenda, setCeoAgenda] = useState<CeoAgendaCache>(CEO_AGENDA_VAZIA);

  // -------------------------------------------------------------------------
  // Nome do cliente no evento (`clientName`)
  // É um campo DESNORMALIZADO, gravado na linha do evento no momento em que ele
  // foi criado — e nada no sistema o ressincroniza quando o cliente é renomeado
  // depois. Resultado real medido na base: 15 de 302 eventos exibiam nome
  // antigo (ex.: "Altese" onde o cliente hoje é "Altese - Recreio + Barra",
  // "IMP. DIESEL" onde é "Império Diesel") — e, num grupo com várias lojas,
  // isso esconde de qual loja o evento é.
  // A fonte de verdade é o `clientId`: o nome de exibição é resolvido a partir
  // dele aqui, uma única vez, então TODO consumidor (cards da agenda, dashboard,
  // busca global, relatórios, atas) já recebe o nome atual sem precisar saber
  // desse detalhe. Regra e fallbacks em `resolverNomesClientes`.
  const agenda = useMemo(() => resolverNomesClientes(agendaBruta, clientes), [agendaBruta, clientes]);

  const buscarTudo = useCallback(async () => {
    const [
      clientesData, agendaData, agendaSeriesData, lembretesData, categoriasData, acoesData, modelosData, cadenciasData,
      agilWorkspacesData, agilBoardsData, agilColunasData, agilIniciativasData, agilFrentesData, agilCamposPersonalizadosData, agilTarefasData, agilSubtarefasData, agilComentariosData,
      analisesIAData,
    ] = await Promise.all([
      api.listarClientes(),
      api.listarAgenda(),
      api.listarAgendaSeries(),
      api.listarLembretes(),
      api.listarCategorias(),
      api.listarAcoes(),
      api.listarModelos(),
      api.listarCadencias(),
      api.listarAgilWorkspaces(),
      api.listarAgilBoards(),
      api.listarAgilColunas(),
      api.listarAgilIniciativas(),
      api.listarAgilFrentes(),
      api.listarAgilCamposPersonalizados(),
      api.listarAgilTarefas(),
      api.listarAgilSubtarefas(),
      api.listarAgilComentarios(),
      // Não crítico pro app funcionar (fila de Ações cai pra ordenação só por
      // cadência sem isso) — cai pra lista vazia em erro, em vez de derrubar
      // o `Promise.all` inteiro e travar toda a carga inicial da Carteira.
      api.buscarAnalisesIA().catch(() => []),
    ]);
    return {
      clientesData, agendaData, agendaSeriesData, lembretesData, categoriasData, acoesData, modelosData, cadenciasData,
      agilWorkspacesData, agilBoardsData, agilColunasData, agilIniciativasData, agilFrentesData, agilCamposPersonalizadosData, agilTarefasData, agilSubtarefasData, agilComentariosData,
      analisesIAData,
    };
  }, []);

  const aplicarDados = useCallback((d: Awaited<ReturnType<typeof buscarTudo>>) => {
    setClientes(d.clientesData);
    setAgenda(d.agendaData);
    setAgendaSeries(d.agendaSeriesData);
    setLembretes(d.lembretesData);
    setCategorias(d.categoriasData);
    setAcoes(d.acoesData);
    setModelos(d.modelosData);
    setCadencias({ ...CADENCIAS_PADRAO, ...d.cadenciasData });
    setAgilWorkspaces(d.agilWorkspacesData);
    setAgilBoards(d.agilBoardsData);
    setAgilColunas(d.agilColunasData);
    setAgilIniciativas(d.agilIniciativasData);
    setAgilFrentes(d.agilFrentesData);
    setAgilCamposPersonalizados(d.agilCamposPersonalizadosData);
    setAgilTarefas(d.agilTarefasData);
    setAgilSubtarefas(d.agilSubtarefasData);
    setAgilComentarios(d.agilComentariosData);
    setAnalisesIA(d.analisesIAData);
  }, []);

  const recarregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      aplicarDados(await buscarTudo());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, [buscarTudo, aplicarDados]);

  useEffect(() => {
    // Busca inicial ao montar o provider — padrão de "fetch on mount"
    // recomendado pela própria doc do React; a regra é conservadora demais p/
    // esse caso legítimo (recarregar já controla loading/error internamente).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recarregar();
  }, [recarregar]);

  // -------------------------------------------------------------------------
  // Revalidação silenciosa
  // O app é usado em várias máquinas da LAN sobre a mesma planilha, e a aba
  // costuma ficar aberta o dia inteiro — sem isso, o usuário edita em cima de
  // dados carregados no logon e sobrescreve alterações de outra pessoa.
  // "Silenciosa": não liga `loading` (evita piscar a tela de carregamento) nem
  // publica `error` (uma falha transitória de rede não deve derrubar a tela;
  // os dados em memória continuam válidos).
  // -------------------------------------------------------------------------
  useEffect(() => {
    const INTERVALO_MS = 60_000;
    const MIN_ENTRE_REVALIDACOES_MS = 10_000;
    // Começa "agora": a busca inicial do mount acabou de rodar, não faz
    // sentido revalidar de novo se a janela ganhar foco em seguida.
    let ultimaRevalidacao = Date.now();
    let cancelado = false;

    const revalidar = async () => {
      if (cancelado || document.hidden) return;
      const agora = Date.now();
      if (agora - ultimaRevalidacao < MIN_ENTRE_REVALIDACOES_MS) return;

      // Uma escrita em andamento significa que o servidor ainda não tem o
      // estado final — revalidar agora traria dados já obsoletos.
      const antes = api.estadoMutacoes();
      if (antes.emVoo > 0) return;
      ultimaRevalidacao = agora;

      try {
        const dados = await buscarTudo();
        const depois = api.estadoMutacoes();
        // Se alguma mutação começou ou terminou durante a busca, esta resposta
        // foi montada antes dela: aplicá-la reverteria na tela o que o usuário
        // acabou de salvar. Descarta e deixa para o próximo ciclo.
        if (cancelado || depois.emVoo > 0 || depois.concluidas !== antes.concluidas) return;
        aplicarDados(dados);
      } catch (err) {
        console.warn('Revalidação falhou (mantendo dados atuais):', err);
      }
    };

    const aoVoltarPraTela = () => {
      if (!document.hidden) void revalidar();
    };

    const timer = window.setInterval(() => void revalidar(), INTERVALO_MS);
    document.addEventListener('visibilitychange', aoVoltarPraTela);
    window.addEventListener('focus', aoVoltarPraTela);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltarPraTela);
      window.removeEventListener('focus', aoVoltarPraTela);
    };
  }, [buscarTudo, aplicarDados]);

  // -------------------------------------------------------------------------
  // Agenda do CEO (Google Calendar, somente leitura)
  // Efeito totalmente separado do carregamento principal: uma falha aqui
  // (backend sem CEO_AGENDA_ICS_URL configurada, Google fora do ar) nunca deve
  // aparecer como erro global nem atrasar o resto da Carteira. O backend já
  // cacheia e sincroniza 1x/dia — aqui só refazemos a leitura do cache
  // periodicamente para refletir uma sincronização nova sem exigir reload.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelado = false;
    const buscar = async () => {
      try {
        const dados = await api.buscarAgendaCeo();
        if (!cancelado) setCeoAgenda(dados);
      } catch (err) {
        console.warn('Agenda do CEO indisponível (mantendo dados atuais):', err);
      }
    };
    buscar();
    const timer = window.setInterval(buscar, 30 * 60_000);
    return () => { cancelado = true; window.clearInterval(timer); };
  }, []);

  const opcoesPorTipo = useCallback(
    (tipo: CategoriaTipo) =>
      categorias
        .filter((c) => c.tipo === tipo)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((c) => c.valor),
    [categorias]
  );

  /** Igual a `opcoesPorTipo`, mas devolve o objeto `Categoria` inteiro — usado
   *  onde importa mais que o `valor` (ex.: `tipoLink`/`urlAplicacao` de um
   *  serviço, pra saber se ele é PowerBI/Aplicação). */
  const categoriasPorTipo = useCallback(
    (tipo: CategoriaTipo) => categorias.filter((c) => c.tipo === tipo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    [categorias]
  );

  const criarCliente = useCallback(async (data: NovoCliente) => {
    const novo: Cliente = { id: uuidv4(), createdAt: new Date().toISOString(), ...data };
    const salvo = await api.criarCliente(novo);
    setClientes((prev) => [...prev, salvo]);
    return salvo;
  }, []);

  const criarClientesEmLote = useCallback(async (data: NovoCliente[]) => {
    const comIds: Cliente[] = data.map((c) => ({ id: uuidv4(), createdAt: new Date().toISOString(), ...c }));
    await api.criarClientesEmLote(comIds);
    setClientes((prev) => [...prev, ...comIds]);
    return comIds;
  }, []);

  const atualizarClienteFn = useCallback(async (id: string, data: Partial<Cliente>) => {
    const salvo = await api.atualizarCliente(id, data);
    setClientes((prev) => prev.map((c) => (c.id === id ? salvo : c)));
  }, []);

  const removerClienteFn = useCallback(async (id: string) => {
    await api.removerCliente(id);
    setClientes((prev) => prev.filter((c) => c.id !== id));
    setAgenda((prev) => prev.filter((a) => a.clientId !== id));
  }, []);

  const criarEventoFn = useCallback(async (data: NovoEvento) => {
    const novo: EventoAgenda = { id: uuidv4(), createdAt: new Date().toISOString(), attachments: [], servicos: [], monitores: [], checklist: [], ...data };
    const salvo = await api.criarEvento(novo);
    setAgenda((prev) => [...prev, salvo]);
    return salvo;
  }, []);

  const atualizarEventoFn = useCallback(async (id: string, data: Partial<EventoAgenda>) => {
    const salvo = await api.atualizarEvento(id, data);
    setAgenda((prev) => prev.map((a) => (a.id === id ? salvo : a)));
  }, []);

  const removerEventoFn = useCallback(async (id: string) => {
    await api.removerEvento(id);
    setAgenda((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const enviarAnexoEvento = useCallback(
    async (eventoId: string, file: File) => {
      const anexo = await api.enviarAnexo(file);
      const evento = agenda.find((a) => a.id === eventoId);
      if (!evento) return;
      await atualizarEventoFn(eventoId, { attachments: [...evento.attachments, anexo] });
    },
    [agenda, atualizarEventoFn]
  );

  const removerAnexoEvento = useCallback(
    async (eventoId: string, anexo: Anexo) => {
      const evento = agenda.find((a) => a.id === eventoId);
      if (!evento) return;
      await api.removerAnexo(anexo.filename);
      await atualizarEventoFn(eventoId, { attachments: evento.attachments.filter((a) => a.id !== anexo.id) });
    },
    [agenda, atualizarEventoFn]
  );

  const criarAgendaSerieFn = useCallback(async (data: NovaAgendaSerie) => {
    const nova = await api.criarAgendaSerie(data);
    setAgendaSeries((prev) => [...prev, nova]);
    // O servidor materializa o mês corrente na hora de criar a série — os
    // eventos e lembretes gerados têm ids que só o servidor conhece, então
    // refaz a busca em vez de tentar prever o que foi criado (mesmo padrão de
    // criarAgilBoardFn, que refaz a busca de colunas após criar um board).
    const [agendaAtualizada, lembretesAtualizados] = await Promise.all([api.listarAgenda(), api.listarLembretes()]);
    setAgenda(agendaAtualizada);
    setLembretes(lembretesAtualizados);
    return nova;
  }, []);

  const atualizarAgendaSerieFn = useCallback(async (id: string, data: Partial<AgendaSerie>) => {
    const salva = await api.atualizarAgendaSerie(id, data);
    setAgendaSeries((prev) => prev.map((s) => (s.id === id ? salva : s)));
    const [agendaAtualizada, lembretesAtualizados] = await Promise.all([api.listarAgenda(), api.listarLembretes()]);
    setAgenda(agendaAtualizada);
    setLembretes(lembretesAtualizados);
  }, []);

  const removerAgendaSerieFn = useCallback(async (id: string) => {
    await api.removerAgendaSerie(id);
    setAgendaSeries((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const criarLembreteFn = useCallback(async (data: NovoLembrete) => {
    const novo: Lembrete = { id: uuidv4(), createdAt: new Date().toISOString(), status: 'ativo', ...data };
    const salvo = await api.criarLembrete(novo);
    setLembretes((prev) => [...prev, salvo]);
    return salvo;
  }, []);

  const atualizarLembreteFn = useCallback(async (id: string, data: Partial<Lembrete>) => {
    const salvo = await api.atualizarLembrete(id, data);
    setLembretes((prev) => prev.map((r) => (r.id === id ? salvo : r)));
  }, []);

  const removerLembreteFn = useCallback(async (id: string) => {
    await api.removerLembrete(id);
    setLembretes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const criarCategoriaFn = useCallback(async (tipo: CategoriaTipo, valor: string, extra?: ExtraLinkServico) => {
    const nova = await api.criarCategoria(tipo, valor, extra);
    setCategorias((prev) => [...prev, nova]);
  }, []);

  const atualizarCategoriaFn = useCallback(async (id: string, valor: string, extra?: ExtraLinkServico) => {
    const salva = await api.atualizarCategoria(id, { valor, ...extra });
    setCategorias((prev) => prev.map((c) => (c.id === id ? salva : c)));
  }, []);

  const removerCategoriaFn = useCallback(async (id: string) => {
    await api.removerCategoria(id);
    setCategorias((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const registrarAcao = useCallback(async (data: Omit<Acao, 'id' | 'createdAt' | 'updatedAt'>) => {
    const nova = await api.criarAcao(data);
    setAcoes((prev) => [...prev, nova]);
  }, []);

  const atualizarAcaoFn = useCallback(async (id: string, data: Partial<Acao>) => {
    const salva = await api.atualizarAcao(id, data);
    setAcoes((prev) => prev.map((a) => (a.id === id ? salva : a)));
  }, []);

  const removerAcaoFn = useCallback(async (id: string) => {
    await api.removerAcao(id);
    setAcoes((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const criarModeloFn = useCallback(async (data: Omit<Modelo, 'id' | 'createdAt'>) => {
    const novo = await api.criarModelo(data);
    setModelos((prev) => [...prev, novo]);
  }, []);

  const atualizarModeloFn = useCallback(async (id: string, data: Partial<Modelo>) => {
    const salvo = await api.atualizarModelo(id, data);
    setModelos((prev) => prev.map((m) => (m.id === id ? salvo : m)));
  }, []);

  const removerModeloFn = useCallback(async (id: string) => {
    await api.removerModelo(id);
    setModelos((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const salvarCadenciasFn = useCallback(async (data: Cadencias) => {
    await api.salvarCadencias(data);
    setCadencias(data);
  }, []);

  const criarAgilWorkspaceFn = useCallback(async (data: NovaAgilWorkspace) => {
    const nova = await api.criarAgilWorkspace(data);
    setAgilWorkspaces((prev) => [...prev, nova]);
    return nova;
  }, []);

  const atualizarAgilWorkspaceFn = useCallback(async (id: string, data: Partial<AgilWorkspace>) => {
    const salva = await api.atualizarAgilWorkspace(id, data);
    setAgilWorkspaces((prev) => prev.map((w) => (w.id === id ? salva : w)));
  }, []);

  const removerAgilWorkspaceFn = useCallback(async (id: string) => {
    await api.removerAgilWorkspace(id);
    // Cascade local espelhando o servidor: todos os boards da workspace (e
    // tudo que pende deles) somem junto.
    const idsBoards = new Set(agilBoards.filter((b) => b.workspaceId === id).map((b) => b.id));
    const idsTarefas = new Set(agilTarefas.filter((t) => idsBoards.has(t.boardId)).map((t) => t.id));
    setAgilWorkspaces((prev) => prev.filter((w) => w.id !== id));
    setAgilBoards((prev) => prev.filter((b) => !idsBoards.has(b.id)));
    setAgilColunas((prev) => prev.filter((c) => !idsBoards.has(c.boardId)));
    setAgilIniciativas((prev) => prev.filter((i) => !idsBoards.has(i.boardId)));
    setAgilTarefas((prev) => prev.filter((t) => !idsBoards.has(t.boardId)));
    setAgilSubtarefas((prev) => prev.filter((s) => !idsTarefas.has(s.tarefaId)));
    setAgilComentarios((prev) => prev.filter((c) => !idsTarefas.has(c.tarefaId)));
  }, [agilBoards, agilTarefas]);

  const reordenarAgilWorkspacesFn = useCallback(async (itens: { id: string; ordem: number }[]) => {
    const porId = new Map(itens.map((i) => [i.id, i.ordem]));
    setAgilWorkspaces((prev) => prev.map((w) => (porId.has(w.id) ? { ...w, ordem: porId.get(w.id)! } : w)));
    await api.reordenarAgilWorkspaces(itens);
  }, []);

  const criarAgilBoardFn = useCallback(async (data: NovoAgilBoard) => {
    const novo = await api.criarAgilBoard(data);
    // O backend cria, junto com o board, as 5 colunas padrão — refletir isso
    // localmente exigiria conhecer os ids gerados no servidor, então só refaz a busca.
    const colunas = await api.listarAgilColunas();
    setAgilBoards((prev) => [...prev, novo]);
    setAgilColunas(colunas);
    return novo;
  }, []);

  const atualizarAgilBoardFn = useCallback(async (id: string, data: Partial<AgilBoard>) => {
    const salvo = await api.atualizarAgilBoard(id, data);
    setAgilBoards((prev) => prev.map((b) => (b.id === id ? salvo : b)));
  }, []);

  const removerAgilBoardFn = useCallback(async (id: string) => {
    await api.removerAgilBoard(id);
    setAgilBoards((prev) => prev.filter((b) => b.id !== id));
    setAgilColunas((prev) => prev.filter((c) => c.boardId !== id));
    setAgilIniciativas((prev) => prev.filter((i) => i.boardId !== id));
    setAgilCamposPersonalizados((prev) => prev.filter((c) => c.boardId !== id));
    const idsRemovidos = new Set(agilTarefas.filter((t) => t.boardId === id).map((t) => t.id));
    setAgilTarefas((prev) => prev.filter((t) => t.boardId !== id));
    setAgilSubtarefas((prev) => prev.filter((s) => !idsRemovidos.has(s.tarefaId)));
    setAgilComentarios((prev) => prev.filter((c) => !idsRemovidos.has(c.tarefaId)));
  }, [agilTarefas]);

  const criarAgilColunaFn = useCallback(async (data: NovaAgilColuna) => {
    const nova = await api.criarAgilColuna(data);
    setAgilColunas((prev) => [...prev, nova]);
    // Criar uma sub-coluna move para ela as tarefas que estavam na coluna pai
    // (só folhas recebem tarefas) — o servidor faz isso, então relemos as
    // tarefas em vez de tentar reproduzir a regra aqui.
    if (data.parentId) setAgilTarefas(await api.listarAgilTarefas());
    return nova;
  }, []);

  const atualizarAgilColunaFn = useCallback(async (id: string, data: Partial<AgilColuna>) => {
    const salva = await api.atualizarAgilColuna(id, data);
    setAgilColunas((prev) => prev.map((c) => (c.id === id ? salva : c)));
  }, []);

  const removerAgilColunaFn = useCallback(async (id: string) => {
    await api.removerAgilColuna(id);
    // Cascade local espelhando o servidor: a coluna, suas sub-colunas e tudo
    // que pendurava nas tarefas dessas colunas.
    const idsColunas = new Set([id, ...agilColunas.filter((c) => c.parentId === id).map((c) => c.id)]);
    setAgilColunas((prev) => prev.filter((c) => !idsColunas.has(c.id)));
    const idsRemovidos = new Set(agilTarefas.filter((t) => idsColunas.has(t.colunaId)).map((t) => t.id));
    setAgilTarefas((prev) => prev.filter((t) => !idsColunas.has(t.colunaId)));
    setAgilSubtarefas((prev) => prev.filter((s) => !idsRemovidos.has(s.tarefaId)));
    setAgilComentarios((prev) => prev.filter((c) => !idsRemovidos.has(c.tarefaId)));
  }, [agilColunas, agilTarefas]);

  const reordenarAgilColunasFn = useCallback(async (itens: { id: string; ordem: number }[]) => {
    const porId = new Map(itens.map((i) => [i.id, i.ordem]));
    setAgilColunas((prev) => prev.map((c) => (porId.has(c.id) ? { ...c, ordem: porId.get(c.id)! } : c)));
    await api.reordenarAgilColunas(itens);
  }, []);

  const criarAgilIniciativaFn = useCallback(async (data: NovaAgilIniciativa) => {
    const nova = await api.criarAgilIniciativa(data);
    setAgilIniciativas((prev) => [...prev, nova]);
    return nova;
  }, []);

  const atualizarAgilIniciativaFn = useCallback(async (id: string, data: Partial<AgilIniciativa>) => {
    const salva = await api.atualizarAgilIniciativa(id, data);
    setAgilIniciativas((prev) => prev.map((i) => (i.id === id ? salva : i)));
  }, []);

  const removerAgilIniciativaFn = useCallback(async (id: string) => {
    await api.removerAgilIniciativa(id);
    // Não-destrutivo: remover o agrupador não apaga as tarefas, só limpa o vínculo.
    setAgilIniciativas((prev) => prev.filter((i) => i.id !== id));
    setAgilTarefas((prev) => prev.map((t) => (t.iniciativaId === id ? { ...t, iniciativaId: undefined } : t)));
  }, []);

  const reordenarAgilIniciativasFn = useCallback(async (itens: { id: string; ordem: number }[]) => {
    const porId = new Map(itens.map((i) => [i.id, i.ordem]));
    setAgilIniciativas((prev) => prev.map((i) => (porId.has(i.id) ? { ...i, ordem: porId.get(i.id)! } : i)));
    await api.reordenarAgilIniciativas(itens);
  }, []);

  const criarAgilFrenteFn = useCallback(async (data: NovaAgilFrente) => {
    const nova = await api.criarAgilFrente(data);
    setAgilFrentes((prev) => [...prev, nova]);
    return nova;
  }, []);

  const atualizarAgilFrenteFn = useCallback(async (id: string, data: Partial<AgilFrente>) => {
    const salva = await api.atualizarAgilFrente(id, data);
    setAgilFrentes((prev) => prev.map((f) => (f.id === id ? salva : f)));
  }, []);

  const removerAgilFrenteFn = useCallback(async (id: string) => {
    await api.removerAgilFrente(id);
    // Não-destrutivo: remover a Frente não apaga tarefas, só limpa o vínculo.
    setAgilFrentes((prev) => prev.filter((f) => f.id !== id));
    setAgilTarefas((prev) => prev.map((t) => (t.frenteId === id ? { ...t, frenteId: undefined } : t)));
  }, []);

  const reordenarAgilFrentesFn = useCallback(async (itens: { id: string; ordem: number }[]) => {
    const porId = new Map(itens.map((i) => [i.id, i.ordem]));
    setAgilFrentes((prev) => prev.map((f) => (porId.has(f.id) ? { ...f, ordem: porId.get(f.id)! } : f)));
    await api.reordenarAgilFrentes(itens);
  }, []);

  const criarAgilCampoPersonalizadoFn = useCallback(async (data: NovoAgilCampoPersonalizado) => {
    const novo = await api.criarAgilCampoPersonalizado(data);
    setAgilCamposPersonalizados((prev) => [...prev, novo]);
    return novo;
  }, []);

  const atualizarAgilCampoPersonalizadoFn = useCallback(async (id: string, data: Partial<AgilCampoPersonalizado>) => {
    const salvo = await api.atualizarAgilCampoPersonalizado(id, data);
    setAgilCamposPersonalizados((prev) => prev.map((c) => (c.id === id ? salvo : c)));
  }, []);

  const removerAgilCampoPersonalizadoFn = useCallback(async (id: string) => {
    await api.removerAgilCampoPersonalizado(id);
    // Não-destrutivo: o valor gravado nas tarefas fica órfão no JSON, sem
    // aparecer em lugar nenhum — mesmo comportamento do backend.
    setAgilCamposPersonalizados((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const reordenarAgilCamposPersonalizadosFn = useCallback(async (itens: { id: string; ordem: number }[]) => {
    const porId = new Map(itens.map((i) => [i.id, i.ordem]));
    setAgilCamposPersonalizados((prev) => prev.map((c) => (porId.has(c.id) ? { ...c, ordem: porId.get(c.id)! } : c)));
    await api.reordenarAgilCamposPersonalizados(itens);
  }, []);

  const criarAgilTarefaFn = useCallback(async (data: NovaAgilTarefa) => {
    const nova = await api.criarAgilTarefa(data);
    setAgilTarefas((prev) => [...prev, nova]);
    return nova;
  }, []);

  const atualizarAgilTarefaFn = useCallback(async (id: string, data: Partial<AgilTarefa>) => {
    const salva = await api.atualizarAgilTarefa(id, data);
    setAgilTarefas((prev) => prev.map((t) => (t.id === id ? salva : t)));
  }, []);

  const removerAgilTarefaFn = useCallback(async (id: string) => {
    await api.removerAgilTarefa(id);
    setAgilTarefas((prev) => prev.filter((t) => t.id !== id));
    setAgilSubtarefas((prev) => prev.filter((s) => s.tarefaId !== id));
    setAgilComentarios((prev) => prev.filter((c) => c.tarefaId !== id));
  }, []);

  const moverAgilTarefasFn = useCallback(async (itens: { id: string; colunaId: string; ordem: number }[]) => {
    const porId = new Map(itens.map((i) => [i.id, i]));
    // Otimista: aplica local na hora (drag precisa responder sem esperar o
    // round-trip) e persiste em lote — mesmo padrão de reordenarAgilColunas.
    setAgilTarefas((prev) => prev.map((t) => (porId.has(t.id) ? { ...t, ...porId.get(t.id) } : t)));
    await api.reordenarAgilTarefas(itens);
  }, []);

  const criarAgilSubtarefaFn = useCallback(async (data: NovaAgilSubtarefa) => {
    const nova = await api.criarAgilSubtarefa(data);
    setAgilSubtarefas((prev) => [...prev, nova]);
    return nova;
  }, []);

  const atualizarAgilSubtarefaFn = useCallback(async (id: string, data: Partial<AgilSubtarefa>) => {
    const salva = await api.atualizarAgilSubtarefa(id, data);
    setAgilSubtarefas((prev) => prev.map((s) => (s.id === id ? salva : s)));
  }, []);

  const removerAgilSubtarefaFn = useCallback(async (id: string) => {
    await api.removerAgilSubtarefa(id);
    setAgilSubtarefas((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const criarAgilComentarioFn = useCallback(async (data: NovoAgilComentario) => {
    const novo = await api.criarAgilComentario(data);
    setAgilComentarios((prev) => [...prev, novo]);
    return novo;
  }, []);

  const removerAgilComentarioFn = useCallback(async (id: string) => {
    await api.removerAgilComentario(id);
    setAgilComentarios((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo<CarteiraContextValue>(
    () => ({
      clientes,
      filtroMonitor,
      setFiltroMonitor: definirFiltroMonitor,
      monitoresDisponiveis,
      agenda,
      agendaSeries,
      lembretes,
      categorias,
      acoes,
      analisesIA,
      modelos,
      cadencias,
      agilWorkspaces,
      agilBoards,
      agilColunas,
      agilIniciativas,
      agilFrentes,
      agilCamposPersonalizados,
      agilTarefas,
      agilSubtarefas,
      agilComentarios,
      loading,
      error,
      recarregar,
      ceoAgenda,
      opcoesPorTipo,
      categoriasPorTipo,
      criarCliente,
      criarClientesEmLote,
      atualizarCliente: atualizarClienteFn,
      removerCliente: removerClienteFn,
      criarEvento: criarEventoFn,
      atualizarEvento: atualizarEventoFn,
      removerEvento: removerEventoFn,
      enviarAnexoEvento,
      removerAnexoEvento,
      criarAgendaSerie: criarAgendaSerieFn,
      atualizarAgendaSerie: atualizarAgendaSerieFn,
      removerAgendaSerie: removerAgendaSerieFn,
      criarLembrete: criarLembreteFn,
      atualizarLembrete: atualizarLembreteFn,
      removerLembrete: removerLembreteFn,
      criarCategoria: criarCategoriaFn,
      atualizarCategoria: atualizarCategoriaFn,
      removerCategoria: removerCategoriaFn,
      registrarAcao,
      atualizarAcao: atualizarAcaoFn,
      removerAcao: removerAcaoFn,
      criarModelo: criarModeloFn,
      atualizarModelo: atualizarModeloFn,
      removerModelo: removerModeloFn,
      salvarCadencias: salvarCadenciasFn,
      criarAgilWorkspace: criarAgilWorkspaceFn,
      atualizarAgilWorkspace: atualizarAgilWorkspaceFn,
      removerAgilWorkspace: removerAgilWorkspaceFn,
      reordenarAgilWorkspaces: reordenarAgilWorkspacesFn,
      criarAgilBoard: criarAgilBoardFn,
      atualizarAgilBoard: atualizarAgilBoardFn,
      removerAgilBoard: removerAgilBoardFn,
      criarAgilColuna: criarAgilColunaFn,
      atualizarAgilColuna: atualizarAgilColunaFn,
      removerAgilColuna: removerAgilColunaFn,
      reordenarAgilColunas: reordenarAgilColunasFn,
      criarAgilIniciativa: criarAgilIniciativaFn,
      atualizarAgilIniciativa: atualizarAgilIniciativaFn,
      removerAgilIniciativa: removerAgilIniciativaFn,
      reordenarAgilIniciativas: reordenarAgilIniciativasFn,
      criarAgilFrente: criarAgilFrenteFn,
      atualizarAgilFrente: atualizarAgilFrenteFn,
      removerAgilFrente: removerAgilFrenteFn,
      reordenarAgilFrentes: reordenarAgilFrentesFn,
      criarAgilCampoPersonalizado: criarAgilCampoPersonalizadoFn,
      atualizarAgilCampoPersonalizado: atualizarAgilCampoPersonalizadoFn,
      removerAgilCampoPersonalizado: removerAgilCampoPersonalizadoFn,
      reordenarAgilCamposPersonalizados: reordenarAgilCamposPersonalizadosFn,
      criarAgilTarefa: criarAgilTarefaFn,
      atualizarAgilTarefa: atualizarAgilTarefaFn,
      removerAgilTarefa: removerAgilTarefaFn,
      moverAgilTarefas: moverAgilTarefasFn,
      criarAgilSubtarefa: criarAgilSubtarefaFn,
      atualizarAgilSubtarefa: atualizarAgilSubtarefaFn,
      removerAgilSubtarefa: removerAgilSubtarefaFn,
      criarAgilComentario: criarAgilComentarioFn,
      removerAgilComentario: removerAgilComentarioFn,
    }),
    [
      clientes, filtroMonitor, definirFiltroMonitor, monitoresDisponiveis, agenda, agendaSeries, lembretes, categorias, acoes, analisesIA, modelos, cadencias,
      agilWorkspaces, agilBoards, agilColunas, agilIniciativas, agilFrentes, agilCamposPersonalizados, agilTarefas, agilSubtarefas, agilComentarios,
      loading, error, recarregar, ceoAgenda, opcoesPorTipo, categoriasPorTipo,
      criarCliente, criarClientesEmLote, atualizarClienteFn, removerClienteFn,
      criarEventoFn, atualizarEventoFn, removerEventoFn, enviarAnexoEvento, removerAnexoEvento,
      criarAgendaSerieFn, atualizarAgendaSerieFn, removerAgendaSerieFn,
      criarLembreteFn, atualizarLembreteFn, removerLembreteFn,
      criarCategoriaFn, atualizarCategoriaFn, removerCategoriaFn,
      registrarAcao, atualizarAcaoFn, removerAcaoFn, criarModeloFn, atualizarModeloFn, removerModeloFn, salvarCadenciasFn,
      criarAgilWorkspaceFn, atualizarAgilWorkspaceFn, removerAgilWorkspaceFn, reordenarAgilWorkspacesFn,
      criarAgilBoardFn, atualizarAgilBoardFn, removerAgilBoardFn,
      criarAgilColunaFn, atualizarAgilColunaFn, removerAgilColunaFn, reordenarAgilColunasFn,
      criarAgilIniciativaFn, atualizarAgilIniciativaFn, removerAgilIniciativaFn, reordenarAgilIniciativasFn,
      criarAgilFrenteFn, atualizarAgilFrenteFn, removerAgilFrenteFn, reordenarAgilFrentesFn,
      criarAgilCampoPersonalizadoFn, atualizarAgilCampoPersonalizadoFn, removerAgilCampoPersonalizadoFn, reordenarAgilCamposPersonalizadosFn,
      criarAgilTarefaFn, atualizarAgilTarefaFn, removerAgilTarefaFn, moverAgilTarefasFn,
      criarAgilSubtarefaFn, atualizarAgilSubtarefaFn, removerAgilSubtarefaFn,
      criarAgilComentarioFn, removerAgilComentarioFn,
    ]
  );

  return <CarteiraContext.Provider value={value}>{children}</CarteiraContext.Provider>;
}

// Mantido neste arquivo (não vira módulo próprio): 16 arquivos importam
// useCarteira daqui — separar só afetaria Fast Refresh em dev (sem impacto
// em build/runtime), não compensa o risco de mexer em 16 imports.
// eslint-disable-next-line react-refresh/only-export-components
export function useCarteira(): CarteiraContextValue {
  const ctx = useContext(CarteiraContext);
  if (!ctx) throw new Error('useCarteira precisa estar dentro de <CarteiraProvider>');
  return ctx;
}
