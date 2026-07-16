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
  attachments: Anexo[];
  status: EventoStatus;
  createdAt: string;
  userId?: string;
}

export type NovoEvento = Omit<EventoAgenda, 'id' | 'createdAt' | 'attachments'> & {
  attachments?: Anexo[];
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
