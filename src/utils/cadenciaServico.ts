import { parseISO } from 'date-fns';
import * as motor from '../../shared/cadenciaServico.cjs';
import { isClienteAtivo } from './formatters';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

/**
 * Motor de cadência (fila de priorização, relógio por serviço, `isClienteAtivo`)
 * mora em `shared/cadenciaServico.cjs` — compartilhado de verdade com o
 * backend, não mais uma cópia paralela. Este arquivo reexporta a API pública
 * que as páginas já usavam (`buildFilaCadencia`, `classificarCadencia` etc.)
 * e mantém só o que é EXCLUSIVO do frontend: `ehServicoDeReuniao` (UI de
 * evento), `buildVencendoDashboard` (card do Dashboard) e os tipos TS.
 *
 * Ver o comentário de topo de `shared/cadenciaServico.cjs` pro histórico da
 * unificação (04/09/2026) — os dois lados tinham a MESMA lógica copiada,
 * sincronizada só por disciplina manual, sem teste cruzado cobrindo os dois.
 */

export type ServicoCad = motor.ServicoCad;
export type CadStatus = motor.CadStatus;
export type ClassificacaoCadencia = motor.ClassificacaoCadencia;
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
  opts?: { servico?: ServicoCad }
) => FilaCadItem[];

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
export const ehServicoDeReuniao = (nome: string) => /monitor|price|prec/i.test(nome);

export interface VencendoDashboardItem {
  cliente: Cliente;
  relogios: RelogioServico[];
}

function temServico(c: Cliente, re: RegExp, flag: keyof Cliente): boolean {
  return (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[flag]);
}
function ehIndependente(c: Cliente, re: RegExp): boolean {
  return (c.servicosIndependentes ?? []).some((s) => re.test(s));
}

/**
 * Cálculo PRÓPRIO pro card "Vencendo" do Dashboard (mesma cobertura
 * por-serviço do motor compartilhado) — não estende `buildFilaCadencia` de
 * propósito: ali só entram clientes com Monitoria ou Price cadastrado; se
 * Relatório virasse um relógio ali, TODO cliente ativo passaria a aparecer na
 * fila de Ações (efeito colateral não pedido). Aqui, todo cliente ativo (fora
 * Marco) sempre ganha um relógio de Relatório (pela cadência configurada, ou
 * o padrão global), além de Monitoria/Price quando aplicável. Janela de
 * "vencendo" de 5 dias, igual à usada em Ações (`motor.JANELA_VENCENDO`).
 */
export function buildVencendoDashboard(
  clientes: Cliente[],
  agenda: EventoAgenda[],
  cadencias: Cadencias,
  now: Date = new Date(),
  janelaVencendo = 5
): VencendoDashboardItem[] {
  const monDias = Number(cadencias?.monitoria_dias) || 30;
  const priceDias = Number(cadencias?.price_dias) || 30;
  const relatorioDiasPadrao = Number(cadencias?.relatorio_dias) || 45;

  const porCliente = new Map<string, EventoAgenda[]>();
  agenda.forEach((a) => {
    if (!porCliente.has(a.clientId)) porCliente.set(a.clientId, []);
    porCliente.get(a.clientId)!.push(a);
  });

  const out: VencendoDashboardItem[] = [];
  for (const c of clientes) {
    if (!isClienteAtivo(c)) continue;
    const evs = porCliente.get(c.id) ?? [];
    const desde = c.createdAt ? parseISO(c.createdAt) : now;

    const relogios: RelogioServico[] = [];
    if (temServico(c, /monitor/i, 'monitoria') && !ehIndependente(c, /monitor/i)) {
      relogios.push(motor.calcularRelogio('Monitoria', evs, motor.ehToqueMonitoria, monDias, now, desde, janelaVencendo));
    }
    if (temServico(c, /(price|prec)/i, 'price') && !ehIndependente(c, /(price|prec)/i)) {
      relogios.push(motor.calcularRelogio('Price', evs, motor.ehToquePrice, priceDias, now, desde, janelaVencendo));
    }
    const relatorioDias = motor.relatorioCadenciaEmDias(c.relatorioCadencia, relatorioDiasPadrao);
    relogios.push(motor.calcularRelogio('Relatório', evs, motor.ehToqueRelatorio, relatorioDias, now, desde, janelaVencendo));

    out.push({ cliente: c, relogios });
  }
  return out;
}
