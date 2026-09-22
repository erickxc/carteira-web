const crypto = require('crypto');

/** Campos rastreados no histórico — os que mudam de forma significativa pra
 *  quem acompanha a tarefa (posição/responsabilidade/prazo/prioridade).
 *  Fora de propósito: `descricao` (texto livre, mudaria a cada edição, sem
 *  valor de auditoria) e `camposPersonalizados` (por board, sem rótulo fixo). */
const CAMPOS_RASTREADOS = ['colunaId', 'titulo', 'prioridade', 'tamanho', 'responsaveis', 'dueAt', 'clientId', 'bloqueado', 'frenteId', 'iniciativaId'];

function valorParaTexto(v) {
  if (v === undefined || v === null || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

/**
 * Registra, na sheet AgilHistorico, uma linha por campo rastreado que mudou
 * entre `antes` e `patch`. Chamado de dentro de `agilTarefas.cjs::atualizar`,
 * com o MESMO repo recebido (fila ou direto) — nunca via `executarMutacao`
 * (mesma regra de sempre: isso ignoraria o repo do chamador).
 */
function registrarMudancas(repo, tarefaId, antes, patch) {
  const now = new Date().toISOString();
  const linhas = repo.get('AgilHistorico');
  let mudou = false;
  for (const campo of CAMPOS_RASTREADOS) {
    if (!(campo in patch)) continue;
    const valorAntigo = valorParaTexto(antes[campo]);
    const valorNovo = valorParaTexto(patch[campo]);
    if (valorAntigo === valorNovo) continue;
    linhas.push({ id: crypto.randomUUID(), tarefaId, campo, valorAntigo, valorNovo, createdAt: now });
    mudou = true;
  }
  if (mudou) repo.save('AgilHistorico', linhas);
}

function remover(repo, tarefaId) {
  repo.save('AgilHistorico', repo.get('AgilHistorico').filter((h) => String(h.tarefaId) !== String(tarefaId)));
}

module.exports = { registrarMudancas, remover };
