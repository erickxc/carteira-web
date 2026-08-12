import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Acao, EventoAgenda } from '../types';

/**
 * Métricas de ATENDIMENTO (não de resultado do cliente): confiabilidade da
 * agenda, esforço para conseguir uma reunião e tempo do ciclo de atendimento.
 *
 * Convenções usadas em todo o arquivo:
 * - "Agenda importante" = Reunião ou Relatório (o que de fato entrega o serviço).
 *   Contato/Ligação são o esforço para chegar lá, não a entrega.
 * - Datas futuras nunca entram: métrica de histórico só olha o que já aconteceu.
 * - Cancelado/Reagendado não conta como realizado (o encontro não ocorreu).
 * - Match por palavra-chave (não igualdade) porque tipo/status vêm de
 *   categorias editáveis pelo usuário — mesmo padrão do resto do projeto.
 */

const ehReuniao = (e: EventoAgenda) => /reuni/i.test(e.type || '');
const ehRelatorio = (e: EventoAgenda) => /relat/i.test(e.type || '');
const ehContato = (e: EventoAgenda) => /contato|liga[çc]/i.test(e.type || '');

const foiCancelado = (e: EventoAgenda) => /cancel/i.test(e.status || '');
const foiReagendado = (e: EventoAgenda) => /reagend/i.test(e.status || '');
/** Aconteceu de fato: nem cancelado nem reagendado, e já passou. */
const aconteceu = (e: EventoAgenda, agora: Date) =>
  !foiCancelado(e) && !foiReagendado(e) && dataDe(e) !== null && dataDe(e)! <= agora;

function dataDe(e: EventoAgenda): Date | null {
  if (!e.date) return null;
  const d = parseISO(e.date);
  return isNaN(d.getTime()) ? null : d;
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

// ---------------------------------------------------------------------------
// Confiabilidade da agenda (ponto 2)
// ---------------------------------------------------------------------------

export interface Confiabilidade {
  realizadas: number;
  reagendadas: number;
  canceladas: number;
  total: number;
  /** realizadas / total, em % (0 quando não há histórico). */
  taxaRealizacao: number;
  /** Nº de reuniões que foram remarcadas ao menos uma vez. */
  reunioesRemarcadas: number;
  /** Total de remarcações (uma reunião pode ter sido movida várias vezes). */
  remarcacoes: number;
  /** reunioesRemarcadas / total, em %. */
  taxaRemarcacao: number;
}

/**
 * Conta o desfecho das reuniões passadas. O denominador é tudo que estava
 * marcado para uma data já vencida — incluindo o que foi cancelado ou
 * reagendado, porque é justamente isso que a taxa quer medir.
 */
export function calcularConfiabilidade(eventos: EventoAgenda[], agora: Date = new Date()): Confiabilidade {
  let realizadas = 0, reagendadas = 0, canceladas = 0;
  let reunioesRemarcadas = 0, remarcacoes = 0;
  for (const e of eventos) {
    if (!ehReuniao(e)) continue;
    const d = dataDe(e);
    if (!d || d > agora) continue; // ainda vai acontecer: não é desfecho
    if (foiCancelado(e)) canceladas++;
    else if (foiReagendado(e)) reagendadas++;
    else realizadas++;
    // Remarcação é ORTOGONAL ao desfecho: uma reunião pode ter sido movida
    // duas vezes e ainda assim ter acontecido. Por isso conta em separado, e
    // não como uma quarta fatia da barra de desfecho.
    const n = e.reagendamentos ?? 0;
    if (n > 0) { reunioesRemarcadas++; remarcacoes += n; }
  }
  const total = realizadas + reagendadas + canceladas;
  return {
    realizadas, reagendadas, canceladas, total,
    taxaRealizacao: total > 0 ? (realizadas / total) * 100 : 0,
    reunioesRemarcadas, remarcacoes,
    taxaRemarcacao: total > 0 ? (reunioesRemarcadas / total) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Esforço: ações por reunião (ponto 6b)
// ---------------------------------------------------------------------------

export interface EsforcoAgenda {
  /** Ações de todos os tipos (numerador). */
  totalAcoes: number;
  /** Ações de ENTREGA: Reunião + Relatório (denominador). */
  acoesEntrega: number;
  /** Ações INICIAIS: Contato + Ligação — o esforço para chegar na entrega. */
  acoesIniciais: number;
  /** Quebra por tipo, para a tela explicar de onde vem o número. */
  porTipo: { reuniao: number; relatorio: number; contato: number; price: number; outros: number };
  /**
   * Quantas ações, no total, para cada entrega (reunião ou relatório):
   *
   *   acoesPorEntrega = total de ações / (ações de Reunião + Relatório)
   *
   * Reunião e Relatório são a ENTREGA; Contato e Ligação são as ações iniciais
   * que levam até ela. Como a entrega faz parte do total, o resultado é sempre
   * >= 1 (1.0 = a entrega saiu sem nenhuma ação inicial em volta).
   *
   * Uma versão anterior dividia contatos por reuniões e podia dar menos de 1
   * (dava 0.4) — não respondia "quantas vezes preciso acionar o cliente?".
   *
   * null quando não houve entrega no período: sem denominador não há média.
   */
  acoesPorEntrega: number | null;
  /** Contatos recebidos do cliente — demanda dele, não esforço nosso. */
  contatosDoCliente: number;
}

/**
 * Esforço de agendamento sobre a MESMA base do módulo de Ações: lá "ação" é o
 * histórico unificado — eventos da agenda (Reunião/Contato/Relatório/Ligação)
 * MAIS as ações registradas na tabela Acoes (ver o memo `itens` em
 * AcoesPage.tsx). Usar só uma das duas fontes daria um número que não bate com
 * o que a tela de Ações mostra.
 *
 * Fora da conta: o que não aconteceu — evento cancelado/reagendado e ação
 * dispensada. Eventos futuros também não entram (esforço é histórico).
 */
export function calcularEsforcoAgenda(
  eventos: EventoAgenda[],
  acoes: Acao[],
  agora: Date = new Date()
): EsforcoAgenda {
  const porTipo = { reuniao: 0, relatorio: 0, contato: 0, price: 0, outros: 0 };
  let contatosDoCliente = 0;

  for (const e of eventos) {
    if (!aconteceu(e, agora)) continue;
    if (ehReuniao(e)) porTipo.reuniao++;
    else if (ehContato(e)) {
      porTipo.contato++;
      if (e.origem === 'cliente') contatosDoCliente++;
    } else if (ehRelatorio(e)) porTipo.relatorio++;
    else porTipo.outros++;
  }

  for (const a of acoes) {
    if (a.status === 'dispensado') continue;
    // Ação programada para o futuro ainda não é esforço realizado.
    const quando = a.dueAt || a.createdAt;
    const d = quando ? parseISO(quando) : null;
    if (d && !isNaN(d.getTime()) && d > agora) continue;
    if (a.tipo === 'reuniao') porTipo.reuniao++;
    else if (a.tipo === 'contato') porTipo.contato++;
    else if (a.tipo === 'relatorio') porTipo.relatorio++;
    else if (a.tipo === 'price') porTipo.price++;
    else porTipo.outros++;
  }

  const totalAcoes = porTipo.reuniao + porTipo.relatorio + porTipo.contato + porTipo.price + porTipo.outros;
  const acoesEntrega = porTipo.reuniao + porTipo.relatorio;
  return {
    totalAcoes,
    acoesEntrega,
    acoesIniciais: porTipo.contato,
    porTipo,
    acoesPorEntrega: acoesEntrega > 0 ? totalAcoes / acoesEntrega : null,
    contatosDoCliente,
  };
}

// ---------------------------------------------------------------------------
// Ciclo de atendimento (ponto 11)
// ---------------------------------------------------------------------------

export interface CicloAtendimento {
  /** Dias entre uma reunião realizada e a seguinte, na média (por cliente). */
  intervaloEntreReunioes: number | null;
  /** Dias entre a reunião e o 1º contato nosso depois dela (retomada). */
  diasParaRetomarContato: number | null;
  /** Dias entre esse 1º contato e a reunião seguinte (conversão do contato). */
  diasDoContatoAteProximaReuniao: number | null;
  /** Nº de pares de reuniões consecutivas usados no cálculo (confiança). */
  amostraIntervalos: number;
  amostraRetomadas: number;
}

/**
 * Responde às duas perguntas do ponto 11, decompondo o ciclo em três trechos:
 *
 *   Reunião A ──(1)──> 1º contato nosso ──(2)──> Reunião B
 *   └────────────────(3) intervalo total ─────────────────┘
 *
 * (1) diasParaRetomarContato — "quanto tempo levamos para voltar a falar com o
 *     cliente depois da reunião". Para cada reunião realizada, procura o
 *     primeiro Contato/Ligação NOSSO em data posterior; a diferença em dias é
 *     uma amostra. Contato recebido do cliente não conta: a pergunta é sobre
 *     a NOSSA iniciativa.
 * (2) diasDoContatoAteProximaReuniao — quanto tempo esse contato levou para
 *     virar reunião. Só conta quando existe reunião posterior ao contato.
 * (3) intervaloEntreReunioes — a cadência real praticada, medida direto entre
 *     reuniões consecutivas do mesmo cliente.
 *
 * Tudo é calculado POR CLIENTE e só depois entra na média geral — senão
 * reuniões de clientes diferentes seriam pareadas entre si e o número não
 * significaria nada.
 */
export function calcularCicloAtendimento(eventos: EventoAgenda[], agora: Date = new Date()): CicloAtendimento {
  const porCliente = new Map<string, EventoAgenda[]>();
  for (const e of eventos) {
    if (!e.clientId || !aconteceu(e, agora)) continue;
    if (!porCliente.has(e.clientId)) porCliente.set(e.clientId, []);
    porCliente.get(e.clientId)!.push(e);
  }

  const intervalos: number[] = [];
  const retomadas: number[] = [];
  const conversoes: number[] = [];

  for (const lista of porCliente.values()) {
    const ordenados = [...lista].sort((a, b) => dataDe(a)!.getTime() - dataDe(b)!.getTime());
    const reunioes = ordenados.filter(ehReuniao);
    // Contato nosso — inclui legado sem origem (ver calcularEsforcoAgenda).
    const contatos = ordenados.filter((e) => ehContato(e) && e.origem !== 'cliente');

    for (let i = 0; i < reunioes.length; i++) {
      const atual = dataDe(reunioes[i])!;

      if (i + 1 < reunioes.length) {
        intervalos.push(differenceInCalendarDays(dataDe(reunioes[i + 1])!, atual));
      }

      const primeiroContatoDepois = contatos.find((c) => dataDe(c)! > atual);
      if (!primeiroContatoDepois) continue;
      const dataContato = dataDe(primeiroContatoDepois)!;
      retomadas.push(differenceInCalendarDays(dataContato, atual));

      const reuniaoDepoisDoContato = reunioes.slice(i + 1).find((r) => dataDe(r)! > dataContato);
      if (reuniaoDepoisDoContato) {
        conversoes.push(differenceInCalendarDays(dataDe(reuniaoDepoisDoContato)!, dataContato));
      }
    }
  }

  return {
    intervaloEntreReunioes: media(intervalos),
    diasParaRetomarContato: media(retomadas),
    diasDoContatoAteProximaReuniao: media(conversoes),
    amostraIntervalos: intervalos.length,
    amostraRetomadas: retomadas.length,
  };
}

/** "12 dias" / "—" quando não há amostra. */
export function formatarDias(v: number | null): string {
  if (v === null) return '—';
  const arredondado = Math.round(v);
  return `${arredondado} ${arredondado === 1 ? 'dia' : 'dias'}`;
}
