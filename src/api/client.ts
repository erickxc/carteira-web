import type { Acao, Anexo, Cadencias, Categoria, ChecklistItem, Cliente, EventoAgenda, Lembrete, Modelo, PreAnalise } from '../types';

const PRE_ANALISE_VAZIA: PreAnalise = { orientacoes: [], clientesGeral: '', produtosGeral: '' };
function parsePreAnalise(raw: unknown): PreAnalise {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...PRE_ANALISE_VAZIA, ...(raw as PreAnalise) };
  if (typeof raw === 'string' && raw.trim()) {
    try { const p = JSON.parse(raw); return { ...PRE_ANALISE_VAZIA, ...p }; } catch { /* ignore */ }
  }
  return { ...PRE_ANALISE_VAZIA };
}

// A API roda na mesma máquina que serve o front (o "servidor" da intranet).
// Derivamos o host da URL atual: abrindo em http://192.168.1.18:5173, a API é
// http://192.168.1.18:3001 — funciona tanto local quanto pelas outras máquinas.
const API_HOST = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
const API_ORIGIN = `http://${API_HOST}:3001`;
const API_BASE = `${API_ORIGIN}/api`;

async function tratarResposta<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Erro ${res.status} ao chamar ${res.url}`);
  }
  return res.json();
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Não foi possível conectar à API local (node server.cjs). Verifique se o servidor está rodando.');
  }
  return tratarResposta<T>(res);
}

/**
 * O backend grava linhas de planilha Excel (SheetJS) — arrays/objetos aninhados
 * (servicos, anexos) precisam ser serializados para string antes de salvar e
 * desserializados ao ler, senão viram "[object Object]" na célula.
 */
function parseListaJSON<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
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

function serializeCliente(c: Cliente): Record<string, unknown> {
  return { ...c, servicos: JSON.stringify(c.servicos ?? []) };
}

function deserializeCliente(raw: Record<string, unknown>): Cliente {
  const bool = (v: unknown) => v === true || v === 1 || /^(true|1|sim|x)$/i.test(String(v ?? '').trim());
  return {
    ...(raw as unknown as Cliente),
    servicos: parseListaJSON<string>(raw.servicos),
    observacao: (raw.observacao as string) ?? '',
    monitor: (raw.monitor as string) ?? '',
    status: (raw.status as string) ?? '',
    atendidoMarco: bool(raw.atendidoMarco),
    tipoAnalise: (raw.tipoAnalise as Cliente['tipoAnalise']) || 'unitaria',
    grupo: (raw.grupo as string) ?? '',
  };
}

function serializeEvento(e: EventoAgenda): Record<string, unknown> {
  return {
    ...e,
    servicos: JSON.stringify(e.servicos ?? []),
    checklist: JSON.stringify(e.checklist ?? []),
    preAnalise: JSON.stringify(e.preAnalise ?? PRE_ANALISE_VAZIA),
    attachments: JSON.stringify(e.attachments ?? []),
  };
}

function deserializeEvento(raw: Record<string, unknown>): EventoAgenda {
  return {
    ...(raw as unknown as EventoAgenda),
    servicos: parseListaJSON<string>(raw.servicos),
    checklist: parseListaJSON<ChecklistItem>(raw.checklist),
    preAnalise: parsePreAnalise(raw.preAnalise),
    attachments: parseListaJSON<Anexo>(raw.attachments),
    subject: (raw.subject as string) ?? '',
    description: (raw.description as string) ?? '',
    time: (raw.time as string) ?? '',
    ata: (raw.ata as string) ?? '',
    resumo: (raw.resumo as string) ?? '',
  };
}

// --- Clientes ---
export const listarClientes = async () => (await request<Record<string, unknown>[]>('/clients')).map(deserializeCliente);
export const criarCliente = async (data: Cliente) =>
  deserializeCliente(await request<Record<string, unknown>>('/clients', { method: 'POST', body: JSON.stringify(serializeCliente(data)) }));
export const criarClientesEmLote = (data: Cliente[]) =>
  request<{ success: boolean; count: number }>('/clients/bulk', { method: 'POST', body: JSON.stringify(data.map(serializeCliente)) });
export const atualizarCliente = (id: string, data: Partial<Cliente>) => {
  const payload: Record<string, unknown> = { ...data };
  if (data.servicos) payload.servicos = JSON.stringify(data.servicos);
  return request<{ success: boolean }>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
};
export const removerCliente = (id: string) => request<{ success: boolean }>(`/clients/${id}`, { method: 'DELETE' });

// --- Agenda ---
export const listarAgenda = async () => (await request<Record<string, unknown>[]>('/agenda')).map(deserializeEvento);
export const criarEvento = async (data: EventoAgenda) =>
  deserializeEvento(await request<Record<string, unknown>>('/agenda', { method: 'POST', body: JSON.stringify(serializeEvento(data)) }));
export const atualizarEvento = (id: string, data: Partial<EventoAgenda>) => {
  const payload: Record<string, unknown> = { ...data };
  if (data.servicos) payload.servicos = JSON.stringify(data.servicos);
  if (data.checklist) payload.checklist = JSON.stringify(data.checklist);
  if (data.preAnalise) payload.preAnalise = JSON.stringify(data.preAnalise);
  if (data.attachments) payload.attachments = JSON.stringify(data.attachments);
  return request<{ success: boolean }>(`/agenda/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
};
export const removerEvento = (id: string) => request<{ success: boolean }>(`/agenda/${id}`, { method: 'DELETE' });

// --- Lembretes ---
export const listarLembretes = () => request<Lembrete[]>('/reminders');
export const criarLembrete = (data: Lembrete) => request<Lembrete>('/reminders', { method: 'POST', body: JSON.stringify(data) });
export const atualizarLembrete = (id: string, data: Partial<Lembrete>) =>
  request<{ success: boolean }>(`/reminders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerLembrete = (id: string) => request<{ success: boolean }>(`/reminders/${id}`, { method: 'DELETE' });

// --- Categorias ---
export const listarCategorias = () => request<Categoria[]>('/categorias');
export const criarCategoria = (tipo: string, valor: string) =>
  request<Categoria>('/categorias', { method: 'POST', body: JSON.stringify({ tipo, valor }) });
export const atualizarCategoria = (id: string, data: Partial<Categoria>) =>
  request<{ success: boolean }>(`/categorias/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerCategoria = (id: string) => request<{ success: boolean }>(`/categorias/${id}`, { method: 'DELETE' });

// --- Ações ---
export const listarAcoes = () => request<Acao[]>('/acoes');
export const criarAcao = (data: Omit<Acao, 'id' | 'createdAt' | 'updatedAt'>) =>
  request<Acao>('/acoes', { method: 'POST', body: JSON.stringify(data) });
export const atualizarAcao = (id: string, data: Partial<Acao>) =>
  request<{ success: boolean }>(`/acoes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerAcao = (id: string) => request<{ success: boolean }>(`/acoes/${id}`, { method: 'DELETE' });

// --- Modelos ---
export const listarModelos = () => request<Modelo[]>('/modelos');
export const criarModelo = (data: Omit<Modelo, 'id' | 'createdAt'>) =>
  request<Modelo>('/modelos', { method: 'POST', body: JSON.stringify(data) });
export const atualizarModelo = (id: string, data: Partial<Modelo>) =>
  request<{ success: boolean }>(`/modelos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerModelo = (id: string) => request<{ success: boolean }>(`/modelos/${id}`, { method: 'DELETE' });

// --- Cadências ---
export const listarCadencias = () => request<Cadencias>('/cadencias');
export const salvarCadencias = (data: Cadencias) =>
  request<{ success: boolean }>('/cadencias', { method: 'PUT', body: JSON.stringify(data) });

// --- Anexos ---
export async function enviarAnexo(file: File): Promise<Anexo> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', body: formData });
  return tratarResposta<Anexo>(res);
}

// (urlAnexo abaixo usa API_ORIGIN — mesmo host do front)

export async function removerAnexo(filename: string): Promise<void> {
  await request(`/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
}

export function urlAnexo(filename: string): string {
  return `${API_ORIGIN}/uploads/${encodeURIComponent(filename)}`;
}
