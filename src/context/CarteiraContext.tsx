import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as api from '../api/client';
import type {
  Acao,
  Anexo,
  Cadencias,
  Categoria,
  CategoriaTipo,
  Cliente,
  EventoAgenda,
  Lembrete,
  Modelo,
  NovoCliente,
  NovoEvento,
  NovoLembrete,
} from '../types';

const CADENCIAS_PADRAO: Cadencias = {
  reuniao_dias: 30,
  relatorio_dias: 45,
  primeiro_contato_dias: 14,
  esfriando_dias: 45,
  monitoria_dias: 30,
  price_dias: 30,
};

interface CarteiraContextValue {
  clientes: Cliente[];
  agenda: EventoAgenda[];
  lembretes: Lembrete[];
  categorias: Categoria[];
  acoes: Acao[];
  modelos: Modelo[];
  cadencias: Cadencias;
  loading: boolean;
  error: string | null;
  recarregar: () => Promise<void>;

  /** Lista de valores (strings) de uma categoria, na ordem cadastrada. */
  opcoesPorTipo: (tipo: CategoriaTipo) => string[];

  criarCliente: (data: NovoCliente) => Promise<Cliente>;
  criarClientesEmLote: (data: NovoCliente[]) => Promise<Cliente[]>;
  atualizarCliente: (id: string, data: Partial<Cliente>) => Promise<void>;
  removerCliente: (id: string) => Promise<void>;

  criarEvento: (data: NovoEvento) => Promise<EventoAgenda>;
  atualizarEvento: (id: string, data: Partial<EventoAgenda>) => Promise<void>;
  removerEvento: (id: string) => Promise<void>;
  enviarAnexoEvento: (eventoId: string, file: File) => Promise<void>;
  removerAnexoEvento: (eventoId: string, anexo: Anexo) => Promise<void>;

  criarLembrete: (data: NovoLembrete) => Promise<Lembrete>;
  atualizarLembrete: (id: string, data: Partial<Lembrete>) => Promise<void>;
  removerLembrete: (id: string) => Promise<void>;

  criarCategoria: (tipo: CategoriaTipo, valor: string) => Promise<void>;
  atualizarCategoria: (id: string, valor: string) => Promise<void>;
  removerCategoria: (id: string) => Promise<void>;

  registrarAcao: (data: Omit<Acao, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  atualizarAcao: (id: string, data: Partial<Acao>) => Promise<void>;
  removerAcao: (id: string) => Promise<void>;

  criarModelo: (data: Omit<Modelo, 'id' | 'createdAt'>) => Promise<void>;
  atualizarModelo: (id: string, data: Partial<Modelo>) => Promise<void>;
  removerModelo: (id: string) => Promise<void>;

  salvarCadencias: (data: Cadencias) => Promise<void>;
}

const CarteiraContext = createContext<CarteiraContextValue | null>(null);

export function CarteiraProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [agenda, setAgenda] = useState<EventoAgenda[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [cadencias, setCadencias] = useState<Cadencias>(CADENCIAS_PADRAO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buscarTudo = useCallback(async () => {
    const [clientesData, agendaData, lembretesData, categoriasData, acoesData, modelosData, cadenciasData] = await Promise.all([
      api.listarClientes(),
      api.listarAgenda(),
      api.listarLembretes(),
      api.listarCategorias(),
      api.listarAcoes(),
      api.listarModelos(),
      api.listarCadencias(),
    ]);
    return { clientesData, agendaData, lembretesData, categoriasData, acoesData, modelosData, cadenciasData };
  }, []);

  const aplicarDados = useCallback((d: Awaited<ReturnType<typeof buscarTudo>>) => {
    setClientes(d.clientesData);
    setAgenda(d.agendaData);
    setLembretes(d.lembretesData);
    setCategorias(d.categoriasData);
    setAcoes(d.acoesData);
    setModelos(d.modelosData);
    setCadencias({ ...CADENCIAS_PADRAO, ...d.cadenciasData });
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

  const opcoesPorTipo = useCallback(
    (tipo: CategoriaTipo) =>
      categorias
        .filter((c) => c.tipo === tipo)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((c) => c.valor),
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
    await api.atualizarCliente(id, data);
    setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
  }, []);

  const removerClienteFn = useCallback(async (id: string) => {
    await api.removerCliente(id);
    setClientes((prev) => prev.filter((c) => c.id !== id));
    setAgenda((prev) => prev.filter((a) => a.clientId !== id));
  }, []);

  const criarEventoFn = useCallback(async (data: NovoEvento) => {
    const novo: EventoAgenda = { id: uuidv4(), createdAt: new Date().toISOString(), attachments: [], servicos: [], checklist: [], ...data };
    const salvo = await api.criarEvento(novo);
    setAgenda((prev) => [...prev, salvo]);
    return salvo;
  }, []);

  const atualizarEventoFn = useCallback(async (id: string, data: Partial<EventoAgenda>) => {
    await api.atualizarEvento(id, data);
    setAgenda((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
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

  const criarLembreteFn = useCallback(async (data: NovoLembrete) => {
    const novo: Lembrete = { id: uuidv4(), createdAt: new Date().toISOString(), status: 'ativo', ...data };
    const salvo = await api.criarLembrete(novo);
    setLembretes((prev) => [...prev, salvo]);
    return salvo;
  }, []);

  const atualizarLembreteFn = useCallback(async (id: string, data: Partial<Lembrete>) => {
    await api.atualizarLembrete(id, data);
    setLembretes((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)));
  }, []);

  const removerLembreteFn = useCallback(async (id: string) => {
    await api.removerLembrete(id);
    setLembretes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const criarCategoriaFn = useCallback(async (tipo: CategoriaTipo, valor: string) => {
    const nova = await api.criarCategoria(tipo, valor);
    setCategorias((prev) => [...prev, nova]);
  }, []);

  const atualizarCategoriaFn = useCallback(async (id: string, valor: string) => {
    await api.atualizarCategoria(id, { valor });
    setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, valor } : c)));
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
    await api.atualizarAcao(id, data);
    setAcoes((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
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
    await api.atualizarModelo(id, data);
    setModelos((prev) => prev.map((m) => (m.id === id ? { ...m, ...data } : m)));
  }, []);

  const removerModeloFn = useCallback(async (id: string) => {
    await api.removerModelo(id);
    setModelos((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const salvarCadenciasFn = useCallback(async (data: Cadencias) => {
    await api.salvarCadencias(data);
    setCadencias(data);
  }, []);

  const value = useMemo<CarteiraContextValue>(
    () => ({
      clientes,
      agenda,
      lembretes,
      categorias,
      acoes,
      modelos,
      cadencias,
      loading,
      error,
      recarregar,
      opcoesPorTipo,
      criarCliente,
      criarClientesEmLote,
      atualizarCliente: atualizarClienteFn,
      removerCliente: removerClienteFn,
      criarEvento: criarEventoFn,
      atualizarEvento: atualizarEventoFn,
      removerEvento: removerEventoFn,
      enviarAnexoEvento,
      removerAnexoEvento,
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
    }),
    [
      clientes, agenda, lembretes, categorias, acoes, modelos, cadencias, loading, error, recarregar, opcoesPorTipo,
      criarCliente, criarClientesEmLote, atualizarClienteFn, removerClienteFn,
      criarEventoFn, atualizarEventoFn, removerEventoFn, enviarAnexoEvento, removerAnexoEvento,
      criarLembreteFn, atualizarLembreteFn, removerLembreteFn,
      criarCategoriaFn, atualizarCategoriaFn, removerCategoriaFn,
      registrarAcao, atualizarAcaoFn, removerAcaoFn, criarModeloFn, atualizarModeloFn, removerModeloFn, salvarCadenciasFn,
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
