/** Campos opcionais que o card da tarefa pode mostrar sem abrir — configurável
 *  por quadro (`AgilBoard.camposCard`, JSON string). Ausente/vazio = todos
 *  visíveis (comportamento de sempre, nenhum quadro existente muda ao subir
 *  essa versão). */
export const CAMPOS_CARD_OPCOES = [
  { key: 'responsaveis', label: 'Responsáveis' },
  { key: 'prioridade', label: 'Prioridade' },
  { key: 'dueAt', label: 'Prazo' },
  { key: 'frente', label: 'Frente' },
  { key: 'iniciativa', label: 'Iniciativa' },
  { key: 'subtarefas', label: 'Subtarefas' },
] as const;

export type CampoCard = (typeof CAMPOS_CARD_OPCOES)[number]['key'];

const TODOS: CampoCard[] = CAMPOS_CARD_OPCOES.map((c) => c.key);

export function parseCamposCard(json: string | undefined): CampoCard[] {
  if (!json) return TODOS;
  try {
    const lista = JSON.parse(json);
    return Array.isArray(lista) && lista.length > 0 ? lista : TODOS;
  } catch {
    return TODOS;
  }
}

export function serializeCamposCard(campos: CampoCard[]): string | undefined {
  // Todos selecionados = mesmo efeito que "ausente" — não grava JSON à toa.
  if (campos.length === 0 || campos.length === TODOS.length) return undefined;
  return JSON.stringify(campos);
}
