import type { Acao, AcaoIA, AgendaSerie, AgilBoard, AgilColuna, AgilComentario, AgilFrente, AgilSubtarefa, AgilSwimlane, AgilTarefa, AgilWorkspace, AnaliseIA, Anexo, Cadencias, CeoAgendaCache, Categoria, ChecklistItem, Cliente, ClienteCandidato, Contato, EventoAgenda, Lembrete, Modelo, NovaAgendaSerie, NovaAgilColuna, NovaAgilFrente, NovaAgilSubtarefa, NovaAgilSwimlane, NovaAgilTarefa, NovaAgilWorkspace, NovoAgilBoard, NovoAgilComentario, PrecificacaoItem, PreAnalise, ProdutoSituacaoItem, RegraRecorrencia, RelatorioCadencia, SecoesReuniao } from '../types';

const PRE_ANALISE_VAZIA: PreAnalise = { orientacoes: [], clientesGeral: '', produtosGeral: '' };
function parsePreAnalise(raw: unknown): PreAnalise {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...PRE_ANALISE_VAZIA, ...(raw as PreAnalise) };
  if (typeof raw === 'string' && raw.trim()) {
    try { const p = JSON.parse(raw); return { ...PRE_ANALISE_VAZIA, ...p }; } catch { /* ignore */ }
  }
  return { ...PRE_ANALISE_VAZIA };
}

// Em desenvolvimento (`npm run dev`/`npm start`), o Vite dev server e o Node
// rodam em portas separadas (5173 e 3011 por padrão) — derivamos o host da
// URL atual pra funcionar tanto local quanto por outras máquinas na LAN.
// `VITE_API_PORT` sobrescreve a porta do backend (default 3011) — útil pra
// rodar um backend de teste numa porta livre sem derrubar uma instância de
// produção já escutando em 3011 na mesma máquina.
// Em produção (build servido pelo Apache), usamos caminho relativo: o Apache
// faz proxy de /api e /uploads pro Node (que só escuta em 127.0.0.1, nunca
// exposto direto na rede) — nesse modo não existe IP/host nenhum pra montar.
const API_ORIGIN = import.meta.env.DEV
  ? `http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${import.meta.env.VITE_API_PORT || '3011'}`
  : '';
const API_BASE = `${API_ORIGIN}/api`;

export interface StatusBase {
  ok: boolean;
  updatedAt?: string;
  checkedAt: string;
  error?: string;
}

export const verificarStatusBase = () => request<StatusBase>('/status/base');

export interface StatusFila {
  pendentes: number;
  comErro: number;
  ultimoErro: string | null;
}

// Fila de sincronização (Etapa 4, acesso remoto): em APP_MODE=server sempre
// devolve zerado; em APP_MODE=client reflete o que ainda não foi confirmado
// pelo controller. Ver server/fila/status.cjs.
export const verificarStatusFila = () => request<StatusFila>('/fila/status');

export interface StatusAtualizacao {
  instalada: string;
  disponivel: string | null;
  atualizada: boolean;
  publicadoEm: string | null;
  /** Só true quando o app foi aberto pelo .exe local — é ele que sabe aplicar
   * a atualização. Acessando pela LAN (Apache) ou em dev, o botão não aparece. */
  podeAplicar: boolean;
  /** O que muda na versão DISPONÍVEL (vem do manifesto publicado). */
  novidades: string[];
  /** O que mudou na versão INSTALADA (arquivo local) — é o que sobra pra ver depois de atualizar. */
  novidadesInstalada: string[];
}

export const verificarStatusAtualizacao = () => request<StatusAtualizacao>('/atualizacao/status');

// Fecha o servidor e reabre o .exe — é o launcher que troca os arquivos e
// sobe a versão nova. A resposta chega ANTES do servidor cair; depois disso a
// API fica fora do ar por alguns segundos, até o app voltar sozinho.
export const aplicarAtualizacao = () =>
  request<{ ok: true; versao: string }>('/atualizacao/aplicar', { method: 'POST' });

export interface StatusIniciarComWindows {
  suportado: boolean;
  ativo: boolean;
}

// "Suportado" só é true quando o app foi aberto pelo .exe local (launcher) —
// via navegador/LAN (Apache) não faz sentido, a máquina que abriu o
// navegador pode não ser a que deveria iniciar o app.
export const verificarIniciarComWindows = () => request<StatusIniciarComWindows>('/sistema/iniciar-com-windows');
export const definirIniciarComWindows = (ativo: boolean) =>
  request<StatusIniciarComWindows>('/sistema/iniciar-com-windows', { method: 'PUT', body: JSON.stringify({ ativo }) });

async function tratarResposta<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // As rotas respondem `{ error: '...' }` em 400/404/409 — sem isso, o usuário
    // só via "Erro 400 ao chamar /api/clients/123", perdendo o motivo real.
    let mensagem = `Erro ${res.status} ao chamar ${res.url}`;
    try {
      const corpo = await res.json();
      if (corpo && typeof corpo.error === 'string') mensagem = corpo.error;
    } catch { /* corpo não era JSON — mantém a mensagem genérica */ }
    throw new Error(mensagem);
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

// Sem `JSON.stringify` de campo aqui de propósito — o motor real (SQLite,
// `dbSqlite.cjs`) já serializa/desserializa QUALQUER coluna sozinho
// (`JSON.stringify` na escrita, `JSON.parse` na leitura). Isso aqui é herança
// da era Excel/SheetJS (que não persistia array/objeto direto na célula,
// exigia serializar manualmente — ver CLAUDE.md), e a migração pro SQLite
// nunca removeu esse passo duplicado: array virava string aqui, o SQLite
// serializava ESSA STRING de novo, e a leitura só desfazia 1 nível — sobrava
// uma string com o JSON preso dentro (bug real, achado em produção: quase
// todo `Clientes.servicos` estava assim). `deserializeCliente` continua
// aceitando string OU array (`parseListaJSON`) — não quebra dado antigo que
// ainda estiver com esse resíduo até ser regravado uma vez.
function serializeCliente(c: Cliente): Record<string, unknown> {
  return { ...c, relatorioCadencia: c.relatorioCadencia ?? null };
}

function deserializeCliente(raw: Record<string, unknown>): Cliente {
  return {
    ...(raw as unknown as Cliente),
    servicos: parseListaJSON<string>(raw.servicos),
    servicosIndependentes: parseListaJSON<string>(raw.servicosIndependentes),
    contatos: parseListaJSON<Contato>(raw.contatos),
    observacao: (raw.observacao as string) ?? '',
    // Compatibilidade com a base anterior, que usava status para estado.
    estado: (raw.estado as string) ?? (/^(ativ|gratuidade)/i.test(String(raw.status ?? '')) ? 'Ativo' : 'Inativo'),
    monitor: (raw.monitor as string) ?? '',
    status: (raw.status as string) ?? '',
    tipoAnalise: (raw.tipoAnalise as Cliente['tipoAnalise']) || 'unitaria',
    grupo: (raw.grupo as string) ?? '',
    relatorioCadencia: parseRelatorioCadencia(raw.relatorioCadencia),
  };
}

// Idem `serializeCliente` — sem stringify de campo, o SQLite já serializa sozinho.
function serializeEvento(e: EventoAgenda): Record<string, unknown> {
  return { ...e, preAnalise: e.preAnalise ?? PRE_ANALISE_VAZIA };
}

function deserializeEvento(raw: Record<string, unknown>): EventoAgenda {
  return {
    ...(raw as unknown as EventoAgenda),
    servicos: parseListaJSON<string>(raw.servicos),
    monitores: parseListaJSON<string>(raw.monitores),
    checklist: parseListaJSON<ChecklistItem>(raw.checklist),
    preAnalise: parsePreAnalise(raw.preAnalise),
    attachments: parseListaJSON<Anexo>(raw.attachments),
    datasAnteriores: parseListaJSON<string>(raw.datasAnteriores),
    produtosSituacao: parseListaJSON<ProdutoSituacaoItem>(raw.produtosSituacao),
    precificacoes: parseListaJSON<PrecificacaoItem>(raw.precificacoes),
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
export const atualizarCliente = async (id: string, data: Partial<Cliente>) => {
  const payload: Record<string, unknown> = { ...data };
  // `relatorioCadencia` pode ser explicitamente `undefined` (desligar a cadência)
  // — por isso testa a presença da chave, não a truthiness do valor.
  if ('relatorioCadencia' in data) payload.relatorioCadencia = data.relatorioCadencia ?? null;
  // O PUT devolve o registro como o servidor de fato o persistiu (ex.: campos
  // derivados por `syncClienteColumns`) — usar isso, não o payload enviado,
  // evita o estado local divergir do servidor até a próxima revalidação.
  return deserializeCliente(await request<Record<string, unknown>>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) }));
};
export const removerCliente = (id: string) => request<{ success: boolean }>(`/clients/${id}`, { method: 'DELETE' });

// --- Agenda ---
export const listarAgenda = async () => (await request<Record<string, unknown>[]>('/agenda')).map(deserializeEvento);
export const criarEvento = async (data: EventoAgenda) =>
  deserializeEvento(await request<Record<string, unknown>>('/agenda', { method: 'POST', body: JSON.stringify(serializeEvento(data)) }));
export const atualizarEvento = async (id: string, data: Partial<EventoAgenda>) =>
  deserializeEvento(await request<Record<string, unknown>>(`/agenda/${id}`, { method: 'PUT', body: JSON.stringify(data) }));
export const removerEvento = (id: string) => request<{ success: boolean }>(`/agenda/${id}`, { method: 'DELETE' });

// --- Séries recorrentes de agenda ---
function serializeAgendaSerie(s: NovaAgendaSerie | Partial<AgendaSerie>): Record<string, unknown> {
  return { ...s, regra: s.regra ?? null };
}
function deserializeAgendaSerie(raw: Record<string, unknown>): AgendaSerie {
  return {
    ...(raw as unknown as AgendaSerie),
    monitores: parseListaJSON<string>(raw.monitores),
    servicos: parseListaJSON<string>(raw.servicos),
    regra: typeof raw.regra === 'string' ? (JSON.parse(raw.regra || 'null') as RegraRecorrencia) : (raw.regra as RegraRecorrencia),
    lembretes: parseListaJSON<AgendaSerie['lembretes'][number]>(raw.lembretes),
    ativo: raw.ativo === true || raw.ativo === 'true' || raw.ativo === 1,
  };
}

export const listarAgendaSeries = async () => (await request<Record<string, unknown>[]>('/agenda/series')).map(deserializeAgendaSerie);
export const criarAgendaSerie = async (data: NovaAgendaSerie) =>
  deserializeAgendaSerie(await request<Record<string, unknown>>('/agenda/series', { method: 'POST', body: JSON.stringify(serializeAgendaSerie(data)) }));
export const atualizarAgendaSerie = async (id: string, data: Partial<AgendaSerie>) =>
  deserializeAgendaSerie(await request<Record<string, unknown>>(`/agenda/series/${id}`, { method: 'PUT', body: JSON.stringify(serializeAgendaSerie(data)) }));
export const removerAgendaSerie = (id: string) => request<{ success: boolean }>(`/agenda/series/${id}`, { method: 'DELETE' });
/** Prévia de datas sem salvar nada — usada pelo formulário pra mostrar "vai criar em: ...". */
export const previewAgendaSerie = (regra: RegraRecorrencia, inicio: string) =>
  request<{ datas: string[]; total: number }>('/agenda/series/preview', { method: 'POST', body: JSON.stringify({ regra, inicio }) });

// --- Lembretes ---
export const listarLembretes = () => request<Lembrete[]>('/reminders');
export const criarLembrete = (data: Lembrete) => request<Lembrete>('/reminders', { method: 'POST', body: JSON.stringify(data) });
export const atualizarLembrete = (id: string, data: Partial<Lembrete>) =>
  request<Lembrete>(`/reminders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerLembrete = (id: string) => request<{ success: boolean }>(`/reminders/${id}`, { method: 'DELETE' });

// --- Categorias ---
export const listarCategorias = () => request<Categoria[]>('/categorias');
export const criarCategoria = (tipo: string, valor: string) =>
  request<Categoria>('/categorias', { method: 'POST', body: JSON.stringify({ tipo, valor }) });
export const atualizarCategoria = (id: string, data: Partial<Categoria>) =>
  request<Categoria>(`/categorias/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerCategoria = (id: string) => request<{ success: boolean }>(`/categorias/${id}`, { method: 'DELETE' });

// --- Ações ---
export const listarAcoes = () => request<Acao[]>('/acoes');
export const criarAcao = (data: Omit<Acao, 'id' | 'createdAt' | 'updatedAt'>) =>
  request<Acao>('/acoes', { method: 'POST', body: JSON.stringify(data) });
export const atualizarAcao = (id: string, data: Partial<Acao>) =>
  request<Acao>(`/acoes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerAcao = (id: string) => request<{ success: boolean }>(`/acoes/${id}`, { method: 'DELETE' });

// --- Modelos ---
export const listarModelos = () => request<Modelo[]>('/modelos');
export const criarModelo = (data: Omit<Modelo, 'id' | 'createdAt'>) =>
  request<Modelo>('/modelos', { method: 'POST', body: JSON.stringify(data) });
export const atualizarModelo = (id: string, data: Partial<Modelo>) =>
  request<Modelo>(`/modelos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerModelo = (id: string) => request<{ success: boolean }>(`/modelos/${id}`, { method: 'DELETE' });

// --- Cadências ---
export const listarCadencias = () => request<Cadencias>('/cadencias');
export const salvarCadencias = (data: Cadencias) =>
  request<{ success: boolean }>('/cadencias', { method: 'PUT', body: JSON.stringify(data) });

// --- Agenda do CEO (Google Calendar, somente leitura) ---
export const buscarAgendaCeo = () => request<CeoAgendaCache>('/ceo-agenda');

// --- Importação de resumo de reunião ---
export const identificarReuniao = (texto: string) =>
  request<{ candidatos: ClienteCandidato[]; secoes: SecoesReuniao }>('/reunioes/identificar', { method: 'POST', body: JSON.stringify({ texto }) });

// --- Ágil (Kanban de tarefas) ---
function serializeAgilTarefa(t: NovaAgilTarefa | Partial<AgilTarefa>): Record<string, unknown> {
  return { ...t };
}
function deserializeAgilTarefa(raw: Record<string, unknown>): AgilTarefa {
  return { ...(raw as unknown as AgilTarefa), labels: parseListaJSON<string>(raw.labels) };
}

export const listarAgilWorkspaces = () => request<AgilWorkspace[]>('/agil/workspaces');
export const criarAgilWorkspace = (data: NovaAgilWorkspace) => request<AgilWorkspace>('/agil/workspaces', { method: 'POST', body: JSON.stringify(data) });
export const atualizarAgilWorkspace = (id: string, data: Partial<AgilWorkspace>) =>
  request<AgilWorkspace>(`/agil/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerAgilWorkspace = (id: string) => request<{ success: boolean }>(`/agil/workspaces/${id}`, { method: 'DELETE' });
export const reordenarAgilWorkspaces = (itens: { id: string; ordem: number }[]) =>
  request<AgilWorkspace[]>('/agil/workspaces/reorder', { method: 'PUT', body: JSON.stringify(itens) });

export const listarAgilBoards = () => request<AgilBoard[]>('/agil/boards');
export const criarAgilBoard = (data: NovoAgilBoard) => request<AgilBoard>('/agil/boards', { method: 'POST', body: JSON.stringify(data) });
export const atualizarAgilBoard = (id: string, data: Partial<AgilBoard>) =>
  request<AgilBoard>(`/agil/boards/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerAgilBoard = (id: string) => request<{ success: boolean }>(`/agil/boards/${id}`, { method: 'DELETE' });

export const listarAgilColunas = () => request<AgilColuna[]>('/agil/colunas');
export const criarAgilColuna = (data: NovaAgilColuna) => request<AgilColuna>('/agil/colunas', { method: 'POST', body: JSON.stringify(data) });
export const atualizarAgilColuna = (id: string, data: Partial<AgilColuna>) =>
  request<AgilColuna>(`/agil/colunas/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerAgilColuna = (id: string) => request<{ success: boolean }>(`/agil/colunas/${id}`, { method: 'DELETE' });
export const reordenarAgilColunas = (itens: { id: string; ordem: number }[]) =>
  request<AgilColuna[]>('/agil/colunas/reorder', { method: 'PUT', body: JSON.stringify(itens) });

export const listarAgilTarefas = async () => (await request<Record<string, unknown>[]>('/agil/tarefas')).map(deserializeAgilTarefa);
export const criarAgilTarefa = async (data: NovaAgilTarefa) =>
  deserializeAgilTarefa(await request<Record<string, unknown>>('/agil/tarefas', { method: 'POST', body: JSON.stringify(serializeAgilTarefa(data)) }));
export const atualizarAgilTarefa = async (id: string, data: Partial<AgilTarefa>) =>
  deserializeAgilTarefa(await request<Record<string, unknown>>(`/agil/tarefas/${id}`, { method: 'PUT', body: JSON.stringify(serializeAgilTarefa(data)) }));
export const removerAgilTarefa = (id: string) => request<{ success: boolean }>(`/agil/tarefas/${id}`, { method: 'DELETE' });
export const reordenarAgilTarefas = async (itens: { id: string; colunaId: string; swimlaneId: string; ordem: number }[]) =>
  (await request<Record<string, unknown>[]>('/agil/tarefas/reorder', { method: 'PUT', body: JSON.stringify(itens) })).map(deserializeAgilTarefa);

export const listarAgilSwimlanes = () => request<AgilSwimlane[]>('/agil/swimlanes');
export const criarAgilSwimlane = (data: NovaAgilSwimlane) => request<AgilSwimlane>('/agil/swimlanes', { method: 'POST', body: JSON.stringify(data) });
export const atualizarAgilSwimlane = (id: string, data: Partial<AgilSwimlane>) =>
  request<AgilSwimlane>(`/agil/swimlanes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerAgilSwimlane = (id: string) => request<{ success: boolean }>(`/agil/swimlanes/${id}`, { method: 'DELETE' });
export const reordenarAgilSwimlanes = (itens: { id: string; ordem: number }[]) =>
  request<AgilSwimlane[]>('/agil/swimlanes/reorder', { method: 'PUT', body: JSON.stringify(itens) });

export const listarAgilFrentes = () => request<AgilFrente[]>('/agil/frentes');
export const criarAgilFrente = (data: NovaAgilFrente) => request<AgilFrente>('/agil/frentes', { method: 'POST', body: JSON.stringify(data) });
export const atualizarAgilFrente = (id: string, data: Partial<AgilFrente>) =>
  request<AgilFrente>(`/agil/frentes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerAgilFrente = (id: string) => request<{ success: boolean }>(`/agil/frentes/${id}`, { method: 'DELETE' });
export const reordenarAgilFrentes = (itens: { id: string; ordem: number }[]) =>
  request<AgilFrente[]>('/agil/frentes/reorder', { method: 'PUT', body: JSON.stringify(itens) });

export const listarAgilSubtarefas = () => request<AgilSubtarefa[]>('/agil/subtarefas');
export const criarAgilSubtarefa = (data: NovaAgilSubtarefa) => request<AgilSubtarefa>('/agil/subtarefas', { method: 'POST', body: JSON.stringify(data) });
export const atualizarAgilSubtarefa = (id: string, data: Partial<AgilSubtarefa>) =>
  request<AgilSubtarefa>(`/agil/subtarefas/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const removerAgilSubtarefa = (id: string) => request<{ success: boolean }>(`/agil/subtarefas/${id}`, { method: 'DELETE' });

export const listarAgilComentarios = () => request<AgilComentario[]>('/agil/comentarios');
export const criarAgilComentario = (data: NovoAgilComentario) => request<AgilComentario>('/agil/comentarios', { method: 'POST', body: JSON.stringify(data) });
export const removerAgilComentario = (id: string) => request<{ success: boolean }>(`/agil/comentarios/${id}`, { method: 'DELETE' });

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

// --- Assistente IA ---
// `buscarAnaliseIA` não usa `request` porque 404 aqui é um estado normal
// (cliente ainda não analisado), não um erro a propagar como exceção.
export async function buscarAnaliseIA(clienteId: string): Promise<AnaliseIA | null> {
  const res = await fetch(`${API_BASE}/ia/clientes/${clienteId}/analise`, { headers: { 'Content-Type': 'application/json' } });
  if (res.status === 404) return null;
  return tratarResposta<AnaliseIA>(res);
}

export interface MensagemChatIA {
  role: 'user' | 'assistant';
  content: string;
}

export const enviarMensagemChatIA = (texto: string, historico: MensagemChatIA[], clienteId?: string, monitor?: string) =>
  request<{ resposta: string }>('/ia/chat', { method: 'POST', body: JSON.stringify({ texto, historico, clientId: clienteId, monitor }) });

// Log de auditoria das ações que o agente já executou (mais recentes primeiro).
export const buscarAcoesIA = () => request<AcaoIA[]>('/ia/acoes');

// --- Provedor de IA / conta Claude (Claude Code CLI) ---

export type ProvedorIA = 'ollama' | 'claude-cli';
export type EstadoLoginClaude = 'inativo' | 'iniciando' | 'aguardando_codigo' | 'validando' | 'concluido' | 'erro';

export interface StatusLoginClaude {
  estado: EstadoLoginClaude;
  /** Link de autorização impresso pelo CLI — abrir no navegador e aprovar. */
  link: string | null;
  mensagem: string;
}

export interface StatusProvedorIA {
  provedor: ProvedorIA;
  /** `true` quando `IA_PROVIDER` está fixado no .env — a interface não pode trocar. */
  travado: boolean;
  provedores: ProvedorIA[];
  claude: {
    cliInstalado: boolean;
    caminho: string | null;
    versao: string | null;
    autenticado: boolean;
    /** Qual credencial está valendo: token guardado aqui, ou o login do CLI nesta máquina. */
    origemCredencial: 'token' | 'maquina' | null;
    email: string | null;
    plano: string | null;
    modelo: string;
    /** `true` quando CLAUDE_CLI_MODEL está fixado no .env — a interface não troca. */
    modeloTravado: boolean;
    empacotado: boolean;
    login: StatusLoginClaude;
  };
}

export const buscarStatusProvedorIA = () => request<StatusProvedorIA>('/ia/provedor');

export const definirProvedorIA = (provedor: ProvedorIA) =>
  request<{ provedor: ProvedorIA }>('/ia/provedor', { method: 'PUT', body: JSON.stringify({ provedor }) });

export const iniciarLoginClaude = () => request<StatusLoginClaude>('/ia/claude/login', { method: 'POST' });
export const buscarLoginClaude = () => request<StatusLoginClaude>('/ia/claude/login');
export const enviarCodigoLoginClaude = (codigo: string) =>
  request<StatusLoginClaude>('/ia/claude/login/codigo', { method: 'POST', body: JSON.stringify({ codigo }) });
export const cancelarLoginClaude = () => request<StatusLoginClaude>('/ia/claude/login', { method: 'DELETE' });
export const definirTokenClaude = (token: string) =>
  request<{ ok: boolean }>('/ia/claude/token', { method: 'POST', body: JSON.stringify({ token }) });
export const desconectarContaClaude = () =>
  request<{ ok: boolean; loginDaMaquina: boolean; email: string | null }>('/ia/claude/conta', { method: 'DELETE' });

// --- Painel do MCP da carteira (ferramentas que o Claude Code recebe) ---

export interface FerramentaMcp {
  nome: string;
  /** Nome como o CLI enxerga (`mcp__carteira__x`) — é o que o filtro de --allowed-tools casa. */
  qualificado: string;
  descricao: string;
  /** Muda dado (o agente executa sem confirmação prévia). */
  escreve: boolean;
}

export interface StatusMcpClaude {
  servidor: string;
  prefixo: string;
  cwd: string;
  arquivoConfig: string;
  /** Config paralela pra plugar as ferramentas num cliente MCP próprio (origem própria no log). */
  arquivoConfigExterno: string;
  timeoutSegundos: number;
  modelos: string[];
  ferramentas: FerramentaMcp[];
}

export interface ResultadoTesteClaude {
  ok: boolean;
  resposta: string;
  /** Ferramentas que rodaram de verdade nesse teste (diff do log de auditoria). */
  ferramentas: string[];
  segundos: number;
}

export const buscarMcpClaude = () => request<StatusMcpClaude>('/ia/claude/mcp');

export const definirModeloClaude = (modelo: string) =>
  request<{ modelo: string }>('/ia/claude/modelo', { method: 'PUT', body: JSON.stringify({ modelo }) });

export const testarClaudeCli = () => request<ResultadoTesteClaude>('/ia/claude/teste', { method: 'POST' });

// --- Alertas conversáveis do monitorIA ---

export type SeveridadeAlerta = 'alta' | 'media' | 'baixa';

export interface AlertaIA {
  id: string;
  tipo: 'risco_sem_pauta' | 'sem_contato' | 'vencendo' | 'sem_analise' | 'contradicao_dossie' | 'pauta_parada';
  severidade: SeveridadeAlerta;
  titulo: string;
  detalhe: string;
  clientId: string;
  cliente: string;
  /** Monitor responsável pelo cliente do alerta — null em alertas sem cliente (padrão de carteira). */
  monitor: string | null;
  /** Frase literal que vai pro chat ao clicar em "Conversar" — não é rótulo. */
  pergunta: string;
}

export const buscarAlertasIA = () => request<AlertaIA[]>('/ia/alertas');

// --- Padrões da carteira (não são de um cliente específico) ---

export interface PadraoCarteira {
  id: string;
  tipo: 'padrao_carteira';
  severidade: SeveridadeAlerta;
  titulo: string;
  detalhe: string;
  clientId: '';
  cliente: '';
  monitor: null;
  pergunta: string;
}

export const buscarPadroesCarteira = () => request<PadraoCarteira[]>('/ia/padroes');

// --- Dados Alvos: dashboard de cadastro (/clientes) ---

/** Estado do vínculo loja↔cliente — ver server/alvos/estado.cjs. */
export type EstadoAlvosCliente = 'ok' | 'sem_vinculo' | 'vinculo_quebrado';

export interface LinhaCadastroAlvos {
  clientId: string;
  empresa: string;
  estadoAlvos: EstadoAlvosCliente;
  motivo: string | null;
  semLocal: boolean;
}

export interface ResumoCadastroAlvos {
  total: number;
  ok: number;
  sem_vinculo: number;
  vinculo_quebrado: number;
  semLocal: number;
}

export const buscarCadastroAlvos = () =>
  request<{ resumo: ResumoCadastroAlvos; linhas: LinhaCadastroAlvos[] }>('/alvos/cadastro');

export interface AlertaAlvos {
  id: string;
  tipo: 'alvos_vinculo_quebrado' | 'alvos_acompanhamento';
  severidade: SeveridadeAlerta;
  titulo: string;
  detalhe: string;
  clientId: string;
  cliente: string;
  monitor: string | null;
  pergunta: string;
}

export const buscarAlertasAlvos = () => request<AlertaAlvos[]>('/alvos/alertas');

export const buscarEmpresasAlvos = () => request<string[]>('/alvos/empresas');

export interface CandidatoVinculoAlvos {
  clientId: string;
  empresa: string;
  pontos: number;
  confianca: 'alta' | 'media' | 'baixa';
  motivo: string;
}

export interface LojaVinculoAlvos {
  loja: string;
  receita: number;
  vinculado: string | null;
  sugestao: CandidatoVinculoAlvos | null;
  candidatos: CandidatoVinculoAlvos[];
  ambiguo: boolean;
}

export const buscarSugestoesVinculo = (empresa: string, forcar?: boolean) =>
  request<LojaVinculoAlvos[]>(`/alvos/sugestoes/${encodeURIComponent(empresa)}${forcar ? '?forcar=1' : ''}`);

export const vincularLojaAlvos = (empresa: string, loja: string, clientId: string | null) =>
  request<{ success: true }>('/alvos/vinculo', { method: 'POST', body: JSON.stringify({ empresa, loja, clientId }) });

export interface CatalogoAlvosCliente {
  disponivel: boolean;
  estado?: EstadoAlvosCliente | 'dados_nao_carregados';
  motivo?: string | null;
  pendentes?: string[];
  produtos: string[];
  clientes: string[];
}

/**
 * `aquecer`: só passe `true` a partir da FICHA do cliente (ao abrir a página) —
 * pode custar ~20s se o cache estiver frio. O seletor do formulário de reunião
 * nunca deve aquecer: usa o resultado como veio, disponível ou não.
 */
export const buscarCatalogoAlvos = (clientId: string, aquecer?: boolean) =>
  request<CatalogoAlvosCliente>(`/alvos/catalogo/${clientId}${aquecer ? '?aquecer=1' : ''}`);

// --- Consumo de IA (tokens/custo por pergunta) ---

export interface FerramentaDoTurno {
  ferramenta: string;
  argumentos: unknown;
  resultado: unknown;
  descricao: string;
}

export interface TurnoUsoIA {
  id: string;
  criadoEm: string;
  origem: string;
  provedor: 'ollama' | 'claude-cli';
  modelo: string | null;
  turnId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** null quando o provedor não expõe custo (Ollama é gratuito). */
  custoUsd: number | null;
  duracaoMs: number;
  numFerramentas: number;
  erro: boolean;
  /** Texto truncado do que foi perguntado/respondido — para diagnóstico. */
  pergunta?: string;
  resposta?: string;
  /** Chamadas de ferramenta que aconteceram NESTA pergunta — mesmo turnId. */
  ferramentas: FerramentaDoTurno[];
}

export interface TotaisUsoIA {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  custoUsd: number;
  perguntas: number;
  erros: number;
}

export interface UsoIAResposta {
  dias: number;
  totais: TotaisUsoIA;
  turnos: TurnoUsoIA[];
}

export const buscarUsoIA = (dias = 7) => request<UsoIAResposta>(`/ia/uso?dias=${dias}`);

// --- Cota da assinatura Claude (janela 5h / limite 7d) ---

export interface JanelaCota {
  /** 0..1 — fração já usada da janela. */
  utilizacao: number;
  status: string | null;
  /** ISO 8601, ou null se o header não veio. */
  resetaEm: string | null;
}

export interface LimiteContaClaude {
  ok: boolean;
  motivo?: string;
  cincoHoras?: JanelaCota | null;
  seteDias?: JanelaCota | null;
  consultadoEm?: string;
}

export const buscarLimiteContaClaude = () => request<LimiteContaClaude>('/ia/claude/limite');
