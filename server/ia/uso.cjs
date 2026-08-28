const { executarMutacao } = require('../fila/mutacao.cjs');
const { isClient } = require('../modo.cjs');
const usoIADominio = require('../dominio/usoIA.cjs');

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
// Grava PELA FILA (`fila/mutacao.cjs`), igual `orquestrador.registrarAcao` —
// ver o comentário lá sobre o bug de "escrita direta no SQLite bloqueada" em
// APP_MODE=client. Falha aqui nunca derruba a resposta: é medição.
function registrarUso(repo, {
  origem, provedor, modelo, turnId,
  inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0,
  custoUsd = null, duracaoMs, numFerramentas = 0, erro = false, pergunta = '', resposta = '',
}) {
  const novo = {
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
  // Mesma separação de `orquestrador.registrarAcao`: no servidor grava sobre o
  // `repo` recebido (respeita injeção nos testes); no cliente vai pra fila.
  try {
    return isClient
      ? executarMutacao('usoIA', 'create', { payload: novo, userName: null })
      : usoIADominio.criar(repo, novo);
  } catch (err) {
    console.warn(`registrarUso: não foi possível gravar o consumo — ${err.message}`);
    return null;
  }
}

module.exports = { registrarUso };
