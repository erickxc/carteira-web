const { OLLAMA_URL, OLLAMA_MODELS, OLLAMA_API_KEY } = require('../config.cjs');
// Nem todo modelo do fallback respeita `format: 'json'` a risca — alguns
// (visto na pratica com modelos do tier gratuito) envolvem a resposta em
// ```json ... ``` mesmo assim. `extrairJSON` (compartilhado com o provedor do
// Claude CLI) recorta o conteudo antes do parse.
const { extrairJSON } = require('./jsonTexto.cjs');

/**
 * Wrapper fino sobre a API HTTP do Ollama — mesma API serve tanto o Ollama
 * local (`ollama serve`) quanto o Ollama Cloud (tier gratuito, ver
 * `config.cjs`). Sem biblioteca externa — Node 18+ já tem `fetch` global.
 *
 * Cota/rate limit do tier gratuito é por modelo, não pela conta — por isso
 * `chamarComFallback` tenta os modelos de `OLLAMA_MODELS` em ordem até um
 * responder OK. Erros de conexão (Ollama local não está rodando) viram erro
 * claro em vez de derrubar quem chamou; quem orquestra
 * (`analisesAutomaticas.cjs`) decide se isola por cliente.
 */

// 404 entra aqui também: visto em produção o tier gratuito devolver 404 (não
// 429) pra modelo que ficou temporariamente indisponível/sem cota — não dá
// pra distinguir isso de "nome de modelo digitado errado" só pelo status
// HTTP. Prefere tentar o próximo da lista a falhar a chamada inteira; typo de
// config real já teria sido pego em teste antes de chegar em produção.
const ERROS_TROCA_MODELO = new Set([404, 408, 429, 500, 502, 503, 504]);

async function chamarOllama(path, body) {
  let resp;
  try {
    resp = await fetch(`${OLLAMA_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Ollama inacessível em ${OLLAMA_URL} (rodando "ollama serve"?): ${err.message}`);
  }
  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    const erro = new Error(`Ollama (${body.model}) respondeu ${resp.status}: ${texto || resp.statusText}`);
    erro.status = resp.status;
    throw erro;
  }
  return resp.json();
}

/** Tenta cada modelo de `modelos` em ordem; só propaga o erro do último se todos falharem com status de cota/indisponibilidade. */
async function chamarComFallback(path, body, modelos) {
  let ultimoErro;
  for (const model of modelos) {
    try {
      return await chamarOllama(path, { ...body, model });
    } catch (err) {
      ultimoErro = err;
      if (!ERROS_TROCA_MODELO.has(err.status)) throw err;
    }
  }
  throw ultimoErro;
}

/**
 * Gera uma resposta em JSON (modo `format: 'json'`, `/api/generate` sem
 * streaming). Usado pra extração estruturada (análise de risco). Não valida
 * schema em profundidade — quem chama confere os campos que precisa.
 */
async function gerarJSON(prompt, { modelos = OLLAMA_MODELS } = {}) {
  const data = await chamarComFallback('/api/generate', { prompt, format: 'json', stream: false }, modelos);
  try {
    return JSON.parse(extrairJSON(data.response));
  } catch (err) {
    throw new Error(`Resposta do Ollama não é JSON válido: ${err.message}`);
  }
}

/**
 * Chat multi-turno (`/api/chat`, sem streaming). `mensagens` no formato
 * `[{ role: 'system'|'user'|'assistant'|'tool', content: '...' }]`.
 *
 * Devolve a mensagem CRUA do Ollama (`{ content, tool_calls? }`), não só o
 * texto — quem orquestra tool-calling (`orquestrador.cjs`) precisa inspecionar
 * `tool_calls` pra decidir se executa uma ferramenta antes de responder ao
 * usuário. `opts.tools` é o schema JSON das ferramentas disponíveis nesta
 * chamada (formato OpenAI-style, que é o que o Ollama espera).
 */
async function chat(mensagens, { modelos = OLLAMA_MODELS, tools } = {}) {
  const body = { messages: mensagens, stream: false };
  if (tools?.length) body.tools = tools;
  const data = await chamarComFallback('/api/chat', body, modelos);
  return data.message ?? { content: '' };
}

module.exports = { gerarJSON, chat };
