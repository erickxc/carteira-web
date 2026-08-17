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
  /** Serviços que ESTA pessoa atende (Monitoria/Precificação/...). Numa mesma
   *  loja o contato de monitoria costuma ser diferente do de precificação —
   *  sem isso não há como saber a quem recorrer para cada serviço. Vazio =
   *  contato geral (serve para qualquer serviço). */
  servicos?: string[];
  /**
   * Alcance do contato quando o cliente faz parte de um grupo (análise
   * segmentada, uma loja por cliente):
   *  - 'loja' (padrão, e o que vale para todo contato antigo sem o campo):
   *    aparece só na loja onde foi cadastrado;
   *  - 'grupo': a mesma pessoa atende todas as lojas do grupo, então as outras
   *    lojas também o exibem — sem precisar cadastrar de novo em cada uma.
   */
  escopo?: 'loja' | 'grupo';
}

// --- Cadência de relatório automático (por cliente) ---
export type UnidadeCadenciaRelatorio = 'dia' | 'semana' | 'mes' | 'trimestre' | 'semestre' | 'personalizado' | 'dias_do_mes';

export const UNIDADE_CADENCIA_LABEL: Record<UnidadeCadenciaRelatorio, string> = {
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  trimestre: 'Trimestre',
  semestre: 'Semestre',
  personalizado: 'Personalizado',
  dias_do_mes: 'Dias do mês',
};

export interface RelatorioCadencia {
  numero: number;
  unidade: UnidadeCadenciaRelatorio;
  /** Só usado quando unidade = 'personalizado'. 0=domingo..6=sábado. */
  diasSemana?: number[];
  /** Só usado quando unidade = 'dias_do_mes'. Dias fixos do mês (1-31) — ex.:
   * [10, 20, 30] gera relatório todo dia 10, 20 e 30. Dia maior que o total de
   * dias do mês cai no último dia (ex.: 30 em fevereiro vira 28/29). */
  diasDoMes?: number[];
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
  /** Estado comercial/operacional: define se entra na carteira. */
  estado?: 'Ativo' | 'Inativo' | string;
  /** Situação do cliente, independente do estado. */
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

export const CLIENTE_ESTADO_OPCOES = ['Ativo', 'Inativo'] as const;
export const CLIENTE_STATUS_OPCOES = ['Regular', 'Suspenso', 'Atendido pelo Marco', 'Gratuidade', 'Problemas Externos'] as const;

export type NovoCliente = Omit<Cliente, 'id' | 'createdAt'>;

// --- Agenda ---
export type EventoStatus = string;
export type EventoTipo = string;

/** De quem partiu a interação. Eventos antigos não têm o campo (undefined =
 *  não informado) — nunca assuma 'nos' nesse caso, senão as métricas de
 *  contato recebido do cliente ficam infladas com histórico legado. */
export type OrigemEvento = 'nos' | 'cliente';

export const ORIGEM_LABEL: Record<OrigemEvento, string> = {
  nos: 'Nós procuramos',
  cliente: 'Cliente procurou',
};

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

/**
 * Pré-análise da reunião (preparação). Hoje é só um texto breve: a versão
 * anterior pedia uma tabela de orientações por cliente/produto + dois campos
 * gerais, detalhe que não se justificava para uma anotação de preparação.
 *
 * Os campos antigos continuam no tipo (e são lidos) para não perder o que já
 * está gravado: `preAnaliseParaTexto` converte o legado em texto na abertura.
 */
export interface PreAnalise {
  /** Campo atual — anotação livre de preparação. */
  texto?: string;
  /** @deprecated Legado (tabela de orientações). Só leitura/migração. */
  orientacoes: OrientacaoItem[];
  /** @deprecated Legado. */
  clientesGeral: string;
  /** @deprecated Legado. */
  produtosGeral: string;
}

/** Texto da pré-análise, convertendo o formato legado quando `texto` não existe. */
export function preAnaliseParaTexto(pa?: PreAnalise): string {
  if (!pa) return '';
  if (pa.texto?.trim()) return pa.texto;
  const partes: string[] = [];
  (pa.orientacoes ?? []).forEach((o) => {
    const cabeca = [o.cliente, o.produto].filter(Boolean).join(' / ');
    const linha = [cabeca, o.orientacao].filter(Boolean).join(': ');
    if (linha) partes.push(linha);
  });
  if (pa.clientesGeral?.trim()) partes.push(`Clientes em geral: ${pa.clientesGeral.trim()}`);
  if (pa.produtosGeral?.trim()) partes.push(`Produtos em geral: ${pa.produtosGeral.trim()}`);
  return partes.join('\n');
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
  /** Monitores responsáveis por este evento (múltipla escolha, vindos do CRUD
   * de monitores) — uma reunião pode ter mais de um monitor presente. */
  monitores: string[];
  /** Motivo do reagendamento — obrigatório quando status = Reagendado. */
  motivo?: string;
  /** Sala da reunião (Nova Iorque/Paris/...) — só relevante quando type = Reunião.
   * Duas reuniões não podem ocupar a mesma sala no mesmo dia/horário. */
  sala?: string;
  /** De quem partiu a interação (Contato/Ligação). Ausente = não informado. */
  origem?: OrigemEvento;
  /**
   * Quantas vezes esta reunião foi remarcada (arrastada no calendário, movida
   * no Kanban ou remarcada pelo botão). Contador PRÓPRIO, separado do status
   * "Reagendado": aquele status é desfecho final (o evento morreu e some do
   * calendário por padrão), enquanto aqui o evento continua vivo e só mudou de
   * data. Sem esse campo não havia como medir remarcação, porque arrastar o
   * card nunca mexeu no status.
   */
  reagendamentos?: number;
  /** Id da série de recorrência (agrupa ocorrências geradas juntas). */
  serie?: string;
  createdAt: string;
  userId?: string;
}

export type NovoEvento = Omit<EventoAgenda, 'id' | 'createdAt' | 'attachments' | 'servicos' | 'monitores'> & {
  attachments?: Anexo[];
  servicos?: string[];
  monitores?: string[];
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

// --- Agenda do CEO (Google Calendar, somente leitura) ---
export interface EventoCeo {
  id: string;
  title: string;
  start: string;
  end: string | null;
  location: string;
  allDay: boolean;
}

export interface CeoAgendaCache {
  events: EventoCeo[];
  lastSync: string | null;
  lastError: string | null;
}

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
  /** Janela (dias) após um contato/ligação sem resposta em que o cliente ainda
   * conta como "sendo tratado" — não some da carteira, só não entra em
   * "Precisa contato" nesse intervalo. Passado esse prazo, volta a precisar de ação. */
  recontato_dias: number;
  /** Peso (0-100) do cliente em "Aguardando Retorno" na % central de "Carteira
   * no Ritmo" — contato/ligação vale menos que reunião/relatório (que conta
   * 100% como "Em dia"), mas não é zero: já está sendo tratado. */
  peso_contato_recente: number;
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
