// Declarações de tipo do motor de cadência compartilhado (`cadenciaServico.cjs`).
// Ver o comentário de topo daquele arquivo pro porquê deste `shared/` existir.
// Tipos aqui são estruturais de propósito (campos mínimos necessários), não
// importam de `src/types` — este pacote é consumido também pelo backend, que
// não tem (nem deve ter) dependência da pasta `src/`.

export type ServicoCad = 'Monitoria' | 'Price';
export type CadStatus = 'coberto' | 'em_dia' | 'vencendo' | 'vencido' | 'nunca';
export type ClassificacaoCadencia = 'vencido' | 'vencendo' | 'em_dia';

export interface ClienteCadencia {
  id: string;
  createdAt?: string;
  estado?: string;
  status?: string;
  servicos?: string[] | string;
  servicosIndependentes?: string[] | string;
  monitoria?: boolean;
  price?: boolean;
}

export interface EventoCadencia {
  clientId: string;
  date: string;
  status?: string;
  type?: string;
  servicos?: string[] | string;
}

export interface AcaoCadencia {
  clientId: string;
  tipo?: string;
  status?: string;
  dueAt?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface CadenciasConfig {
  monitoria_dias?: number | string;
  price_dias?: number | string;
  relatorio_dias?: number | string;
  recontato_dias?: number | string;
  peso_contato_recente?: number | string;
}

export interface RelatorioCadenciaCliente {
  numero?: number;
  unidade?: 'dia' | 'semana' | 'mes' | 'trimestre' | 'semestre' | 'personalizado';
}

export interface RelogioServico {
  servico: ServicoCad;
  cadencia: number;
  ultimo: Date | null;
  proximo: Date | null;
  /** dias além da cadência: >0 vencido; <=0 dentro do prazo. */
  atraso: number;
  status: CadStatus;
  /** Status "puro" pela cadência, ignorando agendamento futuro — nunca vira
   * 'coberto'. Usado pelo card "Carteira no Ritmo" do Dashboard, que quer
   * refletir o atraso real de contato mesmo já havendo uma ação marcada. */
  statusReal: Exclude<CadStatus, 'coberto'>;
  atrasoReal: number;
}

export type NivelRisco = 'alto' | 'medio' | 'baixo';

export interface FilaCadItem<C = ClienteCadencia> {
  cliente: C;
  relogios: RelogioServico[];
  /** maior = mais urgente (usado para ordenar a fila). */
  score: number;
  /** true se algum relógio pede ação (vencido / vencendo / nunca) e não está coberto. */
  precisaAcao: boolean;
  /** Nível de risco do dossiê do monitorIA (`AnalisesIA.nivelRisco`), quando
   *  `opts.riscoPorCliente` foi passado pra `buildFilaCadencia`. `undefined`
   *  = sem dossiê ainda, ou o parâmetro não foi informado. */
  nivelRisco?: NivelRisco;
}

export const STATUS_EM_ATENDIMENTO: RegExp;
export const JANELA_VENCENDO: number;
export const PESO_NUNCA: number;

export function listaJSON(raw: unknown): string[];
export function isClienteAtivo(cliente: { estado?: string; status?: string; pausadoAte?: string }, now?: Date): boolean;

export function buildUltimaInteracaoMap(
  agenda: EventoCadencia[],
  acoes: AcaoCadencia[],
  opts?: { now?: Date; isRelevant?: (clientId: string) => boolean }
): Map<string, Date>;

export function temServico(c: ClienteCadencia, re: RegExp, flag: string): boolean;
export function ehIndependente(c: ClienteCadencia, re: RegExp): boolean;
export function naoCancelado(a: EventoCadencia): boolean;
export function ehConcluido(a: { status?: string }): boolean;
export function ehEntrega(a: EventoCadencia): boolean;
export function relogioNoPrazo(r: RelogioServico): boolean;
export function atendimentoEmDia(f: { relogios: RelogioServico[] }): boolean;
export function servicoPadraoDoEvento(
  evento: { type?: string } | null | undefined,
  cliente: { servicos?: string[] | string } | null | undefined
): string[] | null;
export function itensVencendo<F extends { cliente: { empresa?: string }; relogios: RelogioServico[] }>(
  fila: F[],
  janela?: number
): { cliente: F['cliente']; relogio: RelogioServico; diasParaVencer: number }[];

export function ehToqueMonitoria(a: EventoCadencia): boolean;
export function ehToquePrice(a: EventoCadencia): boolean;

export function calcularProximoPorServico(
  eventos: EventoCadencia[],
  ehToque: (a: EventoCadencia) => boolean,
  now: Date
): Date | null;

export function calcularRelogio(
  servico: ServicoCad,
  eventos: EventoCadencia[],
  ehToque: (a: EventoCadencia) => boolean,
  cadencia: number,
  now: Date,
  desde: Date,
  janelaVencendo?: number,
  toquesExtras?: Date[]
): RelogioServico;

export function contatoRecenteNaoRefletido(relogios: RelogioServico[] | undefined, ultimoContato: Date | null): boolean;
export function classificarCadencia(f: FilaCadItem): ClassificacaoCadencia;

export function buildFilaCadencia<C extends ClienteCadencia>(
  clientes: C[],
  agenda: EventoCadencia[],
  acoes: AcaoCadencia[],
  cadencias: CadenciasConfig,
  now?: Date,
  opts?: { servico?: ServicoCad; riscoPorCliente?: Map<string, NivelRisco> }
): FilaCadItem<C>[];

export function rotuloRelogio(r: RelogioServico): string;
