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

  const recarregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientesData, agendaData, lembretesData, categoriasData, acoesData, modelosData, cadenciasData] = await Promise.all([
        api.listarClientes(),
        api.listarAgenda(),
        api.listarLembretes(),
        api.listarCategorias(),
        api.listarAcoes(),
        api.listarModelos(),
        api.listarCadencias(),
      ]);
      setClientes(clientesData);
      setAgenda(agendaData);
      setLembretes(lembretesData);
      setCategorias(categoriasData);
      setAcoes(acoesData);
      setModelos(modelosData);
      setCadencias({ ...CADENCIAS_PADRAO, ...cadenciasData });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

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
    const novo: EventoAgenda = { id: uuidv4(), createdAt: new Date().toISOString(), attachments: [], ...data };
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
      registrarAcao, atualizarAcaoFn, criarModeloFn, atualizarModeloFn, removerModeloFn, salvarCadenciasFn,
    ]
  );

  return <CarteiraContext.Provider value={value}>{children}</CarteiraContext.Provider>;
}

export function useCarteira(): CarteiraContextValue {
  const ctx = useContext(CarteiraContext);
  if (!ctx) throw new Error('useCarteira precisa estar dentro de <CarteiraProvider>');
  return ctx;
}
