import type { Acao, Anexo, Cadencias, Categoria, ChecklistItem, Cliente, ClienteCandidato, Contato, EventoAgenda, Lembrete, Modelo, PreAnalise, RelatorioCadencia, SecoesReuniao } from '../types';

const PRE_ANALISE_VAZIA: PreAnalise = { orientacoes: [], clientesGeral: '', produtosGeral: '' };
function parsePreAnalise(raw: unknown): PreAnalise {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...PRE_ANALISE_VAZIA, ...(raw as PreAnalise) };
  if (typeof raw === 'string' && raw.trim()) {
    try { const p = JSON.parse(raw); return { ...PRE_ANALISE_VAZIA, ...p }; } catch { /* ignore */ }
  }
  return { ...PRE_ANALISE_VAZIA };
}

// Em desenvolvimento (`npm run dev`/`npm start`), o Vite dev server e o Node
// rodam em portas separadas (5173 e 3001) — derivamos o host da URL atual pra
// funcionar tanto local quanto por outras máquinas na LAN.
// Em produção (build servido pelo Apache), usamos caminho relativo: o Apache
// faz proxy de /api e /uploads pro Node (que só escuta em 127.0.0.1, nunca
// exposto direto na rede) — nesse modo não existe IP/host nenhum pra montar.
const API_ORIGIN = import.meta.env.DEV
  ? `http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:3001`
  : '';
const API_BASE = `${API_ORIGIN}/api`;

async function tratarResposta<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Erro ${res.status} ao chamar ${res.url}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Contador de mutações
// A revalidação periódica (ver CarteiraContext) sobrescreve o estado global com
// o que o servidor devolveu. Se uma escrita acontecer no meio de uma
// revalidação, a resposta — montada ANTES da escrita — reverteria na tela a
// alteração que o usuário acabou de salvar. Estes contadores deixam o
// revalidador detectar isso e descartar a resposta obsoleta.
// ---------------------------------------------------------------------------
let mutacoesEmVoo = 0;
let mutacoesConcluidas = 0;

export function estadoMutacoes() {
  return { emVoo: mutacoesEmVoo, concluidas: mutacoesConcluidas };
}

/** Executa `fn` contabilizando-a como mutação (escrita) em andamento. */
async function comoMutacao<T>(fn: () => Promise<T>): Promise<T> {
  mutacoesEmVoo++;
  try {
    return await fn();
  } finally {
    mutacoesEmVoo--;
    mutacoesConcluidas++;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const metodo = (options?.method ?? 'GET').toUpperCase();
  const executar = async () => {
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
  };
  return metodo === 'GET' ? executar() : comoMutacao(executar);
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

function parseRelatorioCadencia(raw: unknown): RelatorioCadencia | undefined {
  if (raw && typeof raw === 'object') return raw as RelatorioCadencia;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw) as RelatorioCadencia; } catch { return undefined; }
  }
  return undefined;
}

function serializeCliente(c: Cliente): Record<string, unknown> {
  return {
    ...c,
    servicos: JSON.stringify(c.servicos ?? []),
    servicosIndependentes: JSON.stringify(c.servicosIndependentes ?? []),
    contatos: JSON.stringify(c.contatos ?? []),
    relatorioCadencia: c.relatorioCadencia ? JSON.stringify(c.relatorioCadencia) : '',
  };
}

function deserializeCliente(raw: Record<string, unknown>): Cliente {
  return {
    ...(raw as unknown as Cliente),
    servicos: parseListaJSON<string>(raw.servicos),
    servicosIndependentes: parseListaJSON<string>(raw.servicosIndependentes),
    contatos: parseListaJSON<Contato>(raw.contatos),
    observacao: (raw.observacao as string) ?? '',
    monitor: (raw.monitor as string) ?? '',
    status: (raw.status as string) ?? '',
    tipoAnalise: (raw.tipoAnalise as Cliente['tipoAnalise']) || 'unitaria',
    grupo: (raw.grupo as string) ?? '',
    relatorioCadencia: parseRelatorioCadencia(raw.relatorioCadencia),
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
  if ('servicosIndependentes' in data) payload.servicosIndependentes = JSON.stringify(data.servicosIndependentes ?? []);
  if (data.contatos) payload.contatos = JSON.stringify(data.contatos);
  // `relatorioCadencia` pode ser explicitamente `undefined` (desligar a cadência)
  // — por isso testa a presença da chave, não a truthiness do valor.
  if ('relatorioCadencia' in data) payload.relatorioCadencia = data.relatorioCadencia ? JSON.stringify(data.relatorioCadencia) : '';
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

// --- Importação de resumo de reunião ---
export const identificarReuniao = (texto: string) =>
  request<{ candidatos: ClienteCandidato[]; secoes: SecoesReuniao }>('/reunioes/identificar', { method: 'POST', body: JSON.stringify({ texto }) });

// --- Anexos ---
export async function enviarAnexo(file: File): Promise<Anexo> {
  // Não passa por `request` (envia FormData, sem Content-Type JSON), então
  // precisa entrar na contagem de mutações explicitamente.
  return comoMutacao(async () => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', body: formData });
    return tratarResposta<Anexo>(res);
  });
}

// (urlAnexo abaixo usa API_ORIGIN — mesmo host do front)

export async function removerAnexo(filename: string): Promise<void> {
  await request(`/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
}

export function urlAnexo(filename: string): string {
  return `${API_ORIGIN}/uploads/${encodeURIComponent(filename)}`;
}
