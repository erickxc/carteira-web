import type { AnaliseIA, Cliente, EventoAgenda } from '../types';
import { dispararNotificacaoNativa } from '../api/client';

export type CategoriaNotificacao = 'reunioes' | 'lembretes' | 'relatorios' | 'analises_ia' | 'cliente_novo' | 'evento_novo';

export const CATEGORIA_NOTIFICACAO_LABEL: Record<CategoriaNotificacao, string> = {
  reunioes: 'Reuniões',
  lembretes: 'Lembretes',
  relatorios: 'Relatórios',
  analises_ia: 'Análises de IA atualizadas',
  cliente_novo: 'Cliente novo cadastrado',
  evento_novo: 'Novo evento',
};

export type PrefsNotificacao = Record<CategoriaNotificacao, boolean>;

export const PREFS_NOTIFICACAO_CHAVE = 'notificacoes:prefs';

export const PREFS_NOTIFICACAO_PADRAO: PrefsNotificacao = {
  reunioes: true,
  lembretes: true,
  relatorios: true,
  analises_ia: true,
  cliente_novo: true,
  evento_novo: true,
};

function lerPrefs(): PrefsNotificacao {
  try {
    const raw = window.localStorage.getItem(PREFS_NOTIFICACAO_CHAVE);
    if (!raw) return PREFS_NOTIFICACAO_PADRAO;
    return { ...PREFS_NOTIFICACAO_PADRAO, ...JSON.parse(raw) };
  } catch {
    return PREFS_NOTIFICACAO_PADRAO;
  }
}

/** Dispara o toast nativo do Windows só se a categoria estiver habilitada nas
 *  preferências desta máquina. Nunca lança — falhar aqui não pode quebrar o
 *  fluxo (criar evento, lembrete vencer...) que chamou isto. */
export function notificarSeHabilitado(categoria: CategoriaNotificacao, titulo: string, mensagem?: string): void {
  if (!lerPrefs()[categoria]) return;
  dispararNotificacaoNativa(titulo, mensagem).catch(() => {
    /* backend sem suporte (dev/LAN) ou falha de rede — sem toast nativo, segue normal */
  });
}

export interface NovidadeDetectada {
  categoria: CategoriaNotificacao;
  titulo: string;
  mensagem?: string;
}

/** Snapshot do que já foi visto — usado por `detectarNovidades` pra saber o
 *  que é realmente novo desde a última chamada. */
export interface SnapshotNovidades {
  idsClientes: Set<string>;
  idsEventos: Set<string>;
  geradoEmPorCliente: Map<string, string>;
}

export function snapshotVazio(): SnapshotNovidades {
  return { idsClientes: new Set(), idsEventos: new Set(), geradoEmPorCliente: new Map() };
}

/** Compara clientes/agenda/análises contra `snapshot` (mutado in-place com o
 *  que foi visto agora) e devolve as novidades a notificar. Função pura na
 *  entrada/saída (só o `snapshot` passado é mutado, de propósito — é o
 *  "estado visto até agora" que o chamador mantém entre chamadas), pra poder
 *  testar a detecção sem precisar montar o CarteiraContext/backend inteiro. */
export function detectarNovidades(
  snapshot: SnapshotNovidades,
  dados: { clientes: Cliente[]; agenda: EventoAgenda[]; analisesIA: AnaliseIA[] },
): NovidadeDetectada[] {
  const novidades: NovidadeDetectada[] = [];

  for (const cliente of dados.clientes) {
    if (snapshot.idsClientes.has(cliente.id)) continue;
    snapshot.idsClientes.add(cliente.id);
    novidades.push({ categoria: 'cliente_novo', titulo: 'Cliente novo cadastrado', mensagem: cliente.empresa });
  }

  for (const evento of dados.agenda) {
    if (snapshot.idsEventos.has(evento.id)) continue;
    snapshot.idsEventos.add(evento.id);
    if (evento.type === 'Relatório') {
      novidades.push({ categoria: 'relatorios', titulo: 'Relatório gerado', mensagem: evento.clientName });
    } else {
      novidades.push({ categoria: 'evento_novo', titulo: 'Novo evento na agenda', mensagem: `${evento.subject} — ${evento.clientName}` });
    }
  }

  for (const analise of dados.analisesIA) {
    const anterior = snapshot.geradoEmPorCliente.get(analise.clientId);
    if (anterior === analise.geradoEm) continue;
    snapshot.geradoEmPorCliente.set(analise.clientId, analise.geradoEm);
    novidades.push({ categoria: 'analises_ia', titulo: 'Análise de IA atualizada', mensagem: analise.resumo });
  }

  return novidades;
}
