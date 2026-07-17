// --- Categorias (CRUD editável) ---
export type CategoriaTipo = 'servico' | 'tipo_evento' | 'status_cliente' | 'status_evento' | 'monitor' | 'tipo_lembrete';

export const CATEGORIA_TIPO_LABEL: Record<CategoriaTipo, string> = {
  servico: 'Serviços',
  tipo_evento: 'Tipos de evento',
  status_cliente: 'Status de cliente',
  status_evento: 'Status de evento',
  monitor: 'Monitores',
  tipo_lembrete: 'Tipos de alerta',
};

export interface Categoria {
  id: string;
  tipo: CategoriaTipo;
  valor: string;
  ordem: number;
  createdAt: string;
}

// --- Cliente ---
export interface Cliente {
  id: string;
  empresa: string;
  monitor: string;
  servicos: string[];
  observacao: string;
  status: string;
  /** Cliente atendido diretamente pelo Marco (fora da monitoria) — vira "neutro". */
  atendidoMarco?: boolean;
  createdAt: string;
  // Colunas legadas do banco real, mantidas em sincronia pelo backend:
  suspenso?: boolean;
  monitoria?: boolean;
  price?: boolean;
  controladoria?: boolean;
  lastContact?: string;
  lastMeeting?: string;
  lastPricing?: string;
  userId?: string;
}

export type NovoCliente = Omit<Cliente, 'id' | 'createdAt'>;

// --- Agenda ---
export type EventoStatus = string;
export type EventoTipo = string;

export interface Anexo {
  id: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
}

export interface EventoAgenda {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  type: EventoTipo;
  subject: string;
  description: string;
  /** Serviços tratados nesta reunião (múltipla escolha, vindos do CRUD de serviços). */
  servicos: string[];
  attachments: Anexo[];
  status: EventoStatus;
  createdAt: string;
  userId?: string;
}

export type NovoEvento = Omit<EventoAgenda, 'id' | 'createdAt' | 'attachments' | 'servicos'> & {
  attachments?: Anexo[];
  servicos?: string[];
};

// --- Lembretes ---
export type Recorrencia = 'none' | 'daily' | 'weekly' | 'monthly';
export type LembreteStatus = 'ativo' | 'concluido';

export interface Lembrete {
  id: string;
  title: string;
  datetime: string;
  description: string;
  status: LembreteStatus;
  clientId: string;
  eventId?: string;
  recurrence: Recorrencia;
  createdAt: string;
  type?: string;
  userId?: string;
}

export type NovoLembrete = Omit<Lembrete, 'id' | 'createdAt' | 'status'> & { status?: LembreteStatus };

// --- Feriados ---
export interface Holiday {
  date: Date;
  name: string;
  scope: 'nacional' | 'estadual-rj' | 'municipal-dc';
}

// --- Ações / Recomendações ---
export type Segmento = 'engajado' | 'esfriando' | 'frio';
export type AcaoTipo = 'contato' | 'reuniao' | 'relatorio' | 'price';
export type AcaoStatus = 'programado' | 'concluido' | 'dispensado';

export const ACAO_TIPOS: AcaoTipo[] = ['contato', 'reuniao', 'relatorio', 'price'];

export const SEGMENTO_LABEL: Record<Segmento, string> = {
  engajado: 'Engajado',
  esfriando: 'Esfriando',
  frio: 'Não atendido',
};

export const ACAO_TIPO_LABEL: Record<AcaoTipo, string> = {
  contato: 'Contato',
  reuniao: 'Reunião',
  relatorio: 'Relatório',
  price: 'Price',
};

/** Registro persistido de uma recomendação já tratada (programada/concluída/dispensada). */
export interface Acao {
  id: string;
  clientId: string;
  tipo: AcaoTipo;
  segmento: Segmento;
  status: AcaoStatus;
  notes?: string;
  /** Data planejada da ação (para ações agendadas). */
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Modelo {
  id: string;
  segmento: Segmento;
  titulo: string;
  conteudo: string;
  createdAt: string;
}

export interface Cadencias {
  reuniao_dias: number;
  relatorio_dias: number;
  primeiro_contato_dias: number;
  esfriando_dias: number;
}
