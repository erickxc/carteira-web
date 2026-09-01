import { format, parseISO } from 'date-fns';
import type { EventoAgenda } from '../types';

/**
 * Uma única fonte pra "isto é uma remarcação de reunião" — usada pelos 3
 * caminhos que podem mudar a data de um evento (arrastar no mês, mover no
 * kanban, editar pelo formulário). Antes cada um calculava `reagendamentos`
 * por conta própria e só 2 dos 3 caminhos (arrastar/kanban) de fato contavam
 * — editar a data pelo formulário nunca incrementava nada, então a mesma
 * reunião remarcada pela tela ou pelo drag tinha contagens diferentes
 * dependendo de COMO foi remarcada, não de QUANTAS vezes foi.
 *
 * Só reunião entra na conta: mover um Contato/Relatório de dia é ajuste de
 * registro, não uma reunião desmarcada com o cliente (mesma regra de antes).
 */
export function ehReuniao(ev: Pick<EventoAgenda, 'type'>): boolean {
  return /reuni/i.test(ev.type || '');
}

const diaISO = (dataISO: string) => format(parseISO(dataISO), 'yyyy-MM-dd');

/**
 * Patch pra aplicar quando a data (dia) de uma reunião muda: soma 1 no
 * contador e empilha o dia antigo em `datasAnteriores` — é isso que sustenta
 * o "realocado" na tela (ver `ghostsRealocados`). Mudar só o HORÁRIO no mesmo
 * dia não conta como remarcação (o kanban já tinha essa regra; agora vale
 * pros 3 caminhos igual).
 *
 * `{}` quando não há mudança de dia real, ou quando não é reunião — chamar
 * isto sempre e espalhar o resultado é mais seguro que decidir a bifurcação
 * em cada um dos 3 lugares que mudam data.
 */
export function registrarRemarcacao(
  ev: Pick<EventoAgenda, 'type' | 'date' | 'reagendamentos' | 'datasAnteriores'>,
  novaDataISO: string,
): Partial<EventoAgenda> {
  if (!ehReuniao(ev)) return {};
  if (diaISO(ev.date) === diaISO(novaDataISO)) return {};
  return {
    reagendamentos: (ev.reagendamentos ?? 0) + 1,
    datasAnteriores: [...(ev.datasAnteriores ?? []), ev.date],
  };
}

export interface GhostRealocado {
  /** Só pra `key` do React — nunca usado pra editar/selecionar nada de verdade. */
  id: string;
  eventoId: string;
  diaAntigo: string;
  clientName: string;
  type: string;
  subject?: string;
  /** Pra onde a reunião foi de fato (o `date` atual do evento). */
  novaData: string;
}

/**
 * Um "fantasma" por data antiga registrada em cada reunião viva — a linha do
 * tempo de onde ela JÁ esteve, não só onde está agora. Só eventos que ainda
 * existem entram aqui (`datasAnteriores` fica no evento real, não em registro
 * solto) — se o evento for excluído, os fantasmas dele somem junto, o que é o
 * comportamento certo: não sobra rastro de um evento que não existe mais.
 */
export function ghostsRealocados(eventos: EventoAgenda[]): GhostRealocado[] {
  const out: GhostRealocado[] = [];
  for (const ev of eventos) {
    for (const diaAntigo of ev.datasAnteriores ?? []) {
      out.push({
        id: `${ev.id}-realocado-${diaAntigo}`,
        eventoId: ev.id,
        diaAntigo,
        clientName: ev.clientName,
        type: ev.type,
        subject: ev.subject,
        novaData: ev.date,
      });
    }
  }
  return out;
}

/** Agrupa os fantasmas por dia (`yyyy-MM-dd`) — mesmo formato de `eventsByDay`. */
export function ghostsByDay(eventos: EventoAgenda[]): Map<string, GhostRealocado[]> {
  const map = new Map<string, GhostRealocado[]>();
  for (const g of ghostsRealocados(eventos)) {
    const key = diaISO(g.diaAntigo);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(g);
  }
  return map;
}
