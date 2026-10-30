import * as motor from 'carteira-shared/cadenciaServico.cjs';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

/**
 * Motor de cadência (fila de priorização, relógio por serviço, `isClienteAtivo`)
 * mora em `shared/cadenciaServico.cjs` — compartilhado de verdade com o
 * backend, não mais uma cópia paralela. Este arquivo reexporta a API pública
 * que as páginas já usavam (`buildFilaCadencia`, `classificarCadencia` etc.)
 * e mantém só o que é EXCLUSIVO do frontend: `ehServicoDeReuniao` (UI de
 * evento), os helpers do card "Vencendo" e os tipos TS.
 *
 * Ver o comentário de topo de `shared/cadenciaServico.cjs` pro histórico da
 * unificação (04/09/2026) — os dois lados tinham a MESMA lógica copiada,
 * sincronizada só por disciplina manual, sem teste cruzado cobrindo os dois.
 */

export type ServicoCad = motor.ServicoCad;
export type CadStatus = motor.CadStatus;
export type ClassificacaoCadencia = motor.ClassificacaoCadencia;
export type NivelRisco = motor.NivelRisco;
export type RelogioServico = motor.RelogioServico;
export type FilaCadItem = motor.FilaCadItem<Cliente>;

export const contatoRecenteNaoRefletido = motor.contatoRecenteNaoRefletido;
export const classificarCadencia = motor.classificarCadencia as (f: FilaCadItem) => ClassificacaoCadencia;
export const rotuloRelogio = motor.rotuloRelogio;

/**
 * Fila de priorização por aderência à cadência de cada serviço — ver
 * `shared/cadenciaServico.cjs` pra regra completa. Cast de tipo aqui porque o
 * motor compartilhado é genérico em `ClienteCadencia` (estrutural, sem
 * depender de `src/types`) e `Cliente` do app satisfaz esse contrato.
 */
export const buildFilaCadencia = motor.buildFilaCadencia as (
  clientes: Cliente[],
  agenda: EventoAgenda[],
  acoes: Acao[],
  cadencias: Cadencias,
  now?: Date,
  // Aceita também o nome antigo ("Monitoria"/"Price"), ver `servicoDoRelogio`.
  opts?: { servico?: ServicoCad | 'Monitoria' | 'Price'; riscoPorCliente?: Map<string, NivelRisco> }
) => FilaCadItem[];

/** Filtro de serviço guardado no navegador → relógio atual. Valor de antes da
 * 1.7 ("Monitoria"/"Price") vira o nome novo; qualquer outro (ex.: o antigo
 * "Relatório") vira 'Todos' — senão o card filtraria por um relógio que não existe. */
export function filtroServicoSalvo(v: string): ServicoCad | 'Todos' {
  const s = motor.servicoDoRelogio(v);
  return s === 'Plataforma 2D' || s === '2D Price' ? s : 'Todos';
}

/**
 * Serviços que são TRATADOS numa reunião — só Monitoria e Precificação, que
 * são também os únicos com régua de cadência aqui.
 *
 * Os outros serviços do cadastro (Controladoria, OptiMarco, AutoTech, Book
 * Fiscal, Raptor, Protocolo GPS, Apura...) são INFORMACIONAIS: decisão do
 * usuário — existem no cadastro do cliente e no Dashboard da Carteira, mas não
 * aparecem em "Serviços tratados" de um evento e não entram em métrica de
 * monitoria. Mesma dupla de regex já usada no motor compartilhado.
 */
/** Agenda + cópia de cada precificação do grupo pra cada loja-irmã — só pra medida por atendimento (ver motor). */
export const comPrecificacaoDoGrupo = motor.comPrecificacaoDoGrupo as (agenda: EventoAgenda[], clientes: Cliente[]) => EventoAgenda[];

/** Evento conta como Price (precificação, ou reunião/relatório com Price). */
export const ehToquePrice = motor.ehToquePrice as (a: EventoAgenda) => boolean;

/** Reconhecem nome antigo e novo do produto (Monitoria/Plataforma 2D, Precificação/2D Price). */
export const ehPlataforma2D = motor.ehPlataforma2D;
export const eh2DPrice = motor.eh2DPrice;

export const ehServicoDeReuniao = (nome: string) => motor.ehPlataforma2D(nome) || motor.eh2DPrice(nome);

/** Relógios a menos de `janela` dias do prazo, sem reunião futura marcada — ver `shared/cadenciaServico.cjs`. */
export const itensVencendo = motor.itensVencendo as (
  fila: FilaCadItem[],
  janela?: number
) => { cliente: Cliente; relogio: RelogioServico; diasParaVencer: number }[];

export const relogioNoPrazo = motor.relogioNoPrazo;
export const atendimentoEmDia = motor.atendimentoEmDia as (f: { relogios: RelogioServico[] }) => boolean;
export const ehEntrega = motor.ehEntrega as (a: EventoAgenda) => boolean;
export const ehConcluido = motor.ehConcluido as (a: { status?: string }) => boolean;
export type CategoriaCancelamento = motor.CategoriaCancelamento;
export const categoriaCancelamento = motor.categoriaCancelamento;
export const ehAvisoDeCancelamento = motor.ehAvisoDeCancelamento;
/** Serviço dedutível para um evento sem serviço (Precificação → Price, Relatório → Monitoria, cliente com um serviço só); null = ambíguo. */
export const servicoPadraoDoEvento = motor.servicoPadraoDoEvento as (evento: { type?: string }, cliente: Cliente | undefined) => string[] | null;
