const crypto = require('crypto');

/**
 * Registra o consumo de UMA pergunta (um turno de `conversar()`), nos dois
 * provedores. Existe porque nem o Claude Code CLI nem o Ollama expõem
 * "quanto da cota do plano resta até resetar" — essa informação só aparece no
 * site da Anthropic, atrelada à sessão do navegador, não à credencial OAuth
 * que o CLI usa (confirmado inspecionando o log de debug do CLI: nenhum
 * cabeçalho de rate-limit/cota aparece nas chamadas HTTP dele).
 *
 * O que É real e mensurável — tokens e custo de CADA resposta — vem aqui, e
 * sustenta um painel de gasto acumulado (hoje, 7 dias, por origem/modelo).
 * Não é a mesma pergunta que "quanto falta pra resetar", mas é o dado que
 * existe de fato.
 */
function registrarUso(repo, {
  origem, provedor, modelo, turnId,
  inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0,
  custoUsd = null, duracaoMs, numFerramentas = 0, erro = false,
}) {
  const usos = repo.get('UsoIA');
  const novo = {
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
    origem, provedor, modelo: modelo || null, turnId,
    inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
    custoUsd, duracaoMs, numFerramentas, erro,
  };
  repo.save('UsoIA', [...usos, novo]);
  return novo;
}

module.exports = { registrarUso };
