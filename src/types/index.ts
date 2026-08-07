// --- Categorias (CRUD editável) ---
export type CategoriaTipo = 'servico' | 'tipo_evento' | 'status_cliente' | 'status_evento' | 'monitor' | 'tipo_lembrete' | 'sala';

export const CATEGORIA_TIPO_LABEL: Record<CategoriaTipo, string> = {
  servico: 'Serviços',
  tipo_evento: 'Tipos de evento',
  status_cliente: 'Status de cliente',
  status_evento: 'Status de evento',
  monitor: 'Monitores',
  tipo_lembrete: 'Tipos de lembrete',
  sala: 'Salas de reunião',
};

export interface Categoria {
  id: string;
  tipo: CategoriaTipo;
  valor: string;
  ordem: number;
  createdAt: string;
}

// --- Cliente ---
export type TipoAnalise = 'unitaria' | 'segmentado';

export const TIPO_ANALISE_LABEL: Record<TipoAnalise, string> = {
  unitaria: 'Unitária',
  segmentado: 'Segmentado (por loja)',
};

export interface Contato {
  id: string;
  nome: string;
  cargo: string;
  telefone: string;
}

// --- Cadência de relatório automático (por cliente) ---
export type UnidadeCadenciaRelatorio = 'dia' | 'semana' | 'mes' | 'trimestre' | 'semestre' | 'personalizado';

export const UNIDADE_CADENCIA_LABEL: Record<UnidadeCadenciaRelatorio, string> = {
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  trimestre: 'Trimestre',
  semestre: 'Semestre',
  personalizado: 'Personalizado',
};

export interface RelatorioCadencia {
  numero: number;
  unidade: UnidadeCadenciaRelatorio;
  /** Só usado quando unidade = 'personalizado'. 0=domingo..6=sábado. */
  diasSemana?: number[];
}

export interface Cliente {
  id: string;
  empresa: string;
  monitor: string;
  servicos: string[];
  /** Serviços (nomes de `servicos`) em que o cliente é independente — faz
   * sozinho, não depende de reunião/monitoria. Some da fila de cadência
   * daquele serviço específico. */
  servicosIndependentes?: string[];
  observacao: string;
  status: string;
  /** Pessoas de contato do cliente (nome, cargo, telefone). */
  contatos?: Contato[];
  /** Análise unitária (empresa toda) ou segmentada (por loja). */
  tipoAnalise?: TipoAnalise;
  /**
   * Grupo/rede da loja. Em análise segmentada, cada loja é um cliente próprio
   * (empresa = "Grupo - Loja") e todas compartilham o mesmo `grupo`.
   */
  grupo?: string;
  /** Cadência de geração automática de Relatório na agenda (opcional — sem isso,
   * o cliente não participa da geração automática). */
  relatorioCadencia?: RelatorioCadencia;
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

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Linha da pré-análise: orientação por cliente/produto. */
export interface OrientacaoItem {
  id: string;
  cliente: string;
  produto: string;
  orientacao: string;
}

/** Pré-análise da reunião (preparação): orientações + visões gerais. */
export interface PreAnalise {
  orientacoes: OrientacaoItem[];
  clientesGeral: string;
  produtosGeral: string;
}

export interface EventoAgenda {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  /** Hora HH:mm (opcional). Manhã < 12:00, Tarde >= 12:00. */
  time?: string;
  /** Duração em minutos. */
  duracao?: number;
  type: EventoTipo;
  subject: string;
  description: string;
  /** Serviços tratados nesta reunião (múltipla escolha, vindos do CRUD de serviços). */
  servicos: string[];
  /** Checklist de atividades/pauta da reunião. */
  checklist?: ChecklistItem[];
  /** Pré-análise (preparação) — disponível após criar a reunião. */
  preAnalise?: PreAnalise;
  /** Ata da reunião — gerada automaticamente (editável). */
  ata?: string;
  /** Resumo da reunião (texto livre). */
  resumo?: string;
  attachments: Anexo[];
  status: EventoStatus;
  /** Monitor responsável por este evento (referência, vinda do CRUD de monitores). */
  monitor?: string;
  /** Motivo do reagendamento — obrigatório quando status = Reagendado. */
  motivo?: string;
  /** Sala da reunião (Nova Iorque/Paris/...) — só relevante quando type = Reunião.
   * Duas reuniões não podem ocupar a mesma sala no mesmo dia/horário. */
  sala?: string;
  /** Id da série de recorrência (agrupa ocorrências geradas juntas). */
  serie?: string;
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

// Rótulos alinhados ao vocabulário da fila de cadência (Ações → Acompanhamento:
// Vencidos/Vencendo/Em dia) — antes eram termos próprios (Engajado/Esfriando/Não
// atendido) de um cálculo à parte, que confundia por não bater com o resto do app.
export const SEGMENTO_LABEL: Record<Segmento, string> = {
  engajado: 'Em dia',
  esfriando: 'Vencendo',
  frio: 'Vencido',
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
  /** Serviço a que a ação se refere (Monitoria/Precificação/...). Opcional. */
  servico?: string;
  /** Monitor responsável pela ação (referência, vinda do CRUD de monitores). */
  monitor?: string;
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
  /** Cadência-alvo por serviço (dias) — priorização por serviço no Acompanhamento. */
  monitoria_dias: number;
  price_dias: number;
}

// --- Importação de resumo de reunião (identificação de cliente + extração de seções) ---
export interface ClienteCandidato {
  id: string;
  empresa: string;
  score: number;
  motivos: string[];
}

export interface CapituloReuniao {
  titulo: string;
  texto: string;
}

export interface SecoesReuniao {
  titulo: string;
  linhaData: string;
  resumo: string;
  tarefas: string;
  capitulos: CapituloReuniao[];
  blocoNotas: string;
}
