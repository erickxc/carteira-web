import { addMinutes, format, parseISO } from 'date-fns';
import type { Cliente, EventoAgenda } from '../types';

/** Contexto opcional: sem ele a ata ainda sai, só perde participantes do cliente. */
export interface AtaContexto {
  cliente?: Cliente;
  /** Nomes de quem participou pelo cliente. Sem isso, cai nos contatos cadastrados. */
  participantesCliente?: string[];
}

const TRACO = '—';

/** "14:30–16:00" a partir de hora + duração. Só a hora se não houver duração. */
function faixaHoraria(time?: string, duracao?: number): string {
  if (!time) return '';
  if (!duracao || duracao <= 0) return time;
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h)) return time;
  const inicio = new Date(2000, 0, 1, h, isNaN(m) ? 0 : m);
  return `${time}–${format(addMinutes(inicio, duracao), 'HH:mm')}`;
}

/** Divide texto livre em itens: uma linha por item, tirando marcador manual. */
function itens(texto?: string): string[] {
  if (!texto?.trim()) return [];
  return texto
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•—]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Gera a ata da reunião a partir do que já foi preenchido no evento.
 *
 * A versão anterior era uma concatenação de pré-análise + checklist + descrição:
 * saía sem participantes, sem separar o que foi decidido do que ainda é
 * pendência, e misturava preparação (pré-análise, que é anterior à reunião) com
 * registro do que aconteceu. Aqui a ata é estruturada em seções fixas para
 * servir como documento de reunião:
 *
 *   cabeçalho (cliente, data, faixa horária, sala, monitor, serviços, participantes)
 *   1. PAUTA            <- checklist, marcando o que foi cumprido
 *   2. O QUE FOI TRATADO<- resumo (fallback: descrição)
 *   3. DECISÕES         <- itens do resumo/descrição marcados como decisão
 *   4. PRÓXIMOS PASSOS  <- itens do checklist NÃO cumpridos + tarefas anotadas
 *
 * Seção sem conteúdo entra com um marcador explícito ("a preencher") em vez de
 * desaparecer: numa ata, seção ausente é indistinguível de "nada a registrar",
 * e quem lê depois não sabe se a reunião não teve decisão ou se ninguém anotou.
 */
export function gerarAta(ev: Partial<EventoAgenda>, ctx: AtaContexto = {}): string {
  const L: string[] = [];
  const data = ev.date ? format(parseISO(ev.date), 'dd/MM/yyyy') : '';
  const horario = faixaHoraria(ev.time, ev.duracao);
  const tipo = /reuni/i.test(ev.type ?? '') ? 'ATA DE REUNIÃO' : `ATA ${TRACO} ${(ev.type ?? 'EVENTO').toUpperCase()}`;

  // --- Cabeçalho ---
  L.push(`${tipo} ${TRACO} ${ev.clientName ?? ''}`.trim());
  L.push([data, horario, ev.sala ? `Sala ${ev.sala}` : ''].filter(Boolean).join(' · '));
  const monitores = ev.monitores ?? [];
  if (monitores.length > 0) L.push(`Monitor${monitores.length > 1 ? 'es' : ''}: ${monitores.join(', ')}`);
  const servicos = ev.servicos ?? [];
  if (servicos.length > 0) L.push(`Serviços tratados: ${servicos.join(', ')}`);
  if (ev.subject?.trim()) L.push(`Assunto: ${ev.subject.trim()}`);

  // Participantes: informados > contatos do serviço tratado > todos os contatos.
  const doCliente = ctx.participantesCliente?.filter(Boolean) ?? (() => {
    const contatos = ctx.cliente?.contatos ?? [];
    if (contatos.length === 0) return [];
    const doServico = servicos.length > 0
      ? contatos.filter((c) => (c.servicos ?? []).length === 0 || (c.servicos ?? []).some((s) => servicos.includes(s)))
      : contatos;
    return doServico.map((c) => (c.cargo ? `${c.nome} (${c.cargo})` : c.nome));
  })();
  const participantes = [
    ...doCliente.map((p) => `${p} ${TRACO} ${ev.clientName ?? 'cliente'}`),
    ...monitores.map((m) => `${m} ${TRACO} 2D Consultores`),
  ];
  if (participantes.length > 0) {
    L.push('', 'PARTICIPANTES');
    participantes.forEach((p) => L.push(`  ${TRACO} ${p}`));
  }

  // --- 1. Pauta (checklist) ---
  const checklist = ev.checklist ?? [];
  L.push('', '1. PAUTA');
  if (checklist.length === 0) {
    L.push('   (sem pauta registrada)');
  } else {
    checklist.forEach((i) => L.push(`   [${i.done ? 'x' : ' '}] ${i.text}${i.done ? '' : '   (não tratado)'}`));
  }

  // --- 2. O que foi tratado ---
  L.push('', '2. O QUE FOI TRATADO');
  const relato = ev.resumo?.trim() || ev.description?.trim() || '';
  if (relato) relato.split('\n').forEach((l) => L.push(`   ${l.trim()}`));
  else L.push('   (a preencher)');

  // --- 3. Decisões ---
  // Heurística deliberadamente simples: linhas do relato que começam com um
  // marcador de decisão. Nada de "adivinhar" decisão em texto corrido — ata
  // errada é pior que ata incompleta, e o campo é editável.
  const decisoes = itens(relato).filter((l) => /^(decis|decidid|ficou\s+(definido|acordado)|acordad)/i.test(l));
  L.push('', '3. DECISÕES');
  if (decisoes.length > 0) decisoes.forEach((d) => L.push(`   ${TRACO} ${d}`));
  else L.push('   (a preencher)');

  // --- 4. Próximos passos ---
  // Item de pauta não cumprido é, por definição, pendência: vira próximo passo
  // automaticamente em vez de só ficar desmarcado na seção 1.
  const pendentes = checklist.filter((i) => !i.done).map((i) => i.text);
  L.push('', '4. PRÓXIMOS PASSOS');
  if (pendentes.length > 0) pendentes.forEach((p) => L.push(`   [2D]      ${p}`));
  else L.push('   (a preencher)');

  L.push('', `Ata gerada automaticamente pela Carteira de Monitoria ${TRACO} revise antes de enviar.`);
  return L.join('\n');
}
