const crypto = require('crypto');
const { isClient } = require('../modo.cjs');

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
// Mesma guarda de `orquestrador.registrarAcao` — `UsoIA` também não está na
// fila (server/fila/entidades.cjs). Nas máquinas cliente, o consumo dessa
// máquina simplesmente não fica registrado até isso ser resolvido; não pode
// derrubar a resposta do chat/análise por causa disso.
function registrarUso(repo, {
  origem, provedor, modelo, turnId,
  inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0,
  custoUsd = null, duracaoMs, numFerramentas = 0, erro = false, pergunta = '', resposta = '',
}) {
  if (isClient) return null;
  const usos = repo.get('UsoIA');
  const novo = {
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
    origem, provedor, modelo: modelo || null, turnId,
    inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
    custoUsd, duracaoMs, numFerramentas, erro,
    // Truncado: é pra diagnóstico ("o que ele respondeu aqui?"), não
    // arquivo da conversa — o histórico do chat vive no navegador de quem
    // conversou (localStorage), de propósito (ver privacidade).
    pergunta: String(pergunta).slice(0, 500),
    resposta: String(resposta).slice(0, 1000),
  };
  repo.save('UsoIA', [...usos, novo]);
  return novo;
}

module.exports = { registrarUso };
