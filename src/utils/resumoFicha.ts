import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { naoCancelado } from 'carteira-shared/cadenciaServico.cjs';
import { buildFilaCadencia, comPrecificacaoDoGrupo, eh2DPrice, ehConcluido, ehPlataforma2D } from './cadenciaServico';
import type { RelogioServico } from './cadenciaServico';
import type { Acao, Cadencias, Cliente, EventoAgenda } from '../types';

export interface ResumoFicha {
  /** `status` é o `statusReal` do relógio (null se independente): 'nunca' não se lê pelo sinal de `atraso`, que sem data de cadastro é negativo. */
  prazos: { servico: string; independente: boolean; atraso: number | null; status: RelogioServico['statusReal'] | null; proximo: Date | null }[];
  /** Última entrega/conversa CONCLUÍDA, mais recente. */
  ultima: EventoAgenda | null;
  /** Próxima marcada: não concluída, não cancelada/reagendada, dia >= hoje. Pendente conta. Relatório não (envio programado), como em `proximos` de useDashboardData. */
  proxima: EventoAgenda | null;
}

const RELOGIOS = [
  { servico: 'Plataforma 2D', eh: ehPlataforma2D },
  { servico: '2D Price', eh: eh2DPrice },
];

// Mesma chave de `proximos` em useDashboardData: a data é gravada à meia-noite, quem desempata é a hora.
const chaveOrdem = (a: EventoAgenda) => `${format(parseISO(a.date), 'yyyy-MM-dd')} ${a.time || '00:00'}`;

const primeiraLinha = (texto: string) => texto.split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/**
 * Uma linha sobre o que foi conversado. A ata gerada começa com o título "ATA DE
 * REUNIÃO" e o cabeçalho: a linha que diz algo é a da seção "1. RESUMO" (`src/utils/ata.ts`).
 */
export function resumoDaConversa(evento: EventoAgenda): string {
  if (evento.resumo?.trim()) return primeiraLinha(evento.resumo);
  const ata = evento.ata ?? '';
  const secao = ata.match(/^1\. RESUMO[ \t]*\r?\n[ \t]*(\S.*)$/m);
  if (!secao) return primeiraLinha(ata);
  return secao[1].includes('(a preencher)') ? '' : secao[1].trim();
}

/** Painel da ficha: nenhuma conta de cadência aqui, tudo sai do motor da fila. */
export function resumoFicha(
  cliente: Cliente,
  clientes: Cliente[],
  agenda: EventoAgenda[],
  acoes: Acao[],
  cadencias: Cadencias,
  hoje: Date = new Date(),
): ResumoFicha {
  const agendaGrupo = comPrecificacaoDoGrupo(agenda, clientes);
  // A carteira inteira, não só [cliente]: a fila soma as Ações de Price das
  // lojas-irmãs olhando a lista recebida; com um cliente só, a ficha mostraria
  // um prazo diferente do da fila.
  const relogios = buildFilaCadencia(clientes, agendaGrupo, acoes, cadencias, hoje).find((f) => f.cliente.id === cliente.id)?.relogios ?? [];

  const prazos = RELOGIOS.flatMap(({ servico, eh }): ResumoFicha['prazos'] => {
    if ((cliente.servicosIndependentes ?? []).some((s) => eh(s))) return [{ servico, independente: true, atraso: null, status: null, proximo: null }];
    const r = relogios.find((x) => x.servico === servico);
    // `atrasoReal`, não `atraso`: com reunião marcada, `atraso` vira um peso de ordenação da fila (-100000).
    return r ? [{ servico, independente: false, atraso: r.atrasoReal, status: r.statusReal, proximo: r.proximo }] : [];
  });

  const doCliente = agendaGrupo.filter((a) => a.clientId === cliente.id);
  const diasAte = (a: EventoAgenda) => differenceInCalendarDays(parseISO(a.date), hoje);
  const ordenados = (lista: EventoAgenda[]) => lista.sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)));

  return {
    prazos,
    ultima: ordenados(doCliente.filter((a) => ehConcluido(a) && diasAte(a) <= 0)).at(-1) ?? null,
    proxima: ordenados(doCliente.filter((a) => !ehConcluido(a) && naoCancelado(a) && !/relat/i.test(a.type || '') && diasAte(a) >= 0))[0] ?? null,
  };
}
