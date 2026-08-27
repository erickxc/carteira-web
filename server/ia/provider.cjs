const { provedorAtivo } = require('./claudeCli/estado.cjs');

/**
 * Ponto único de escolha do provedor de LLM do monitorIA. Quem consome IA no
 * projeto (`routes/analiseIA.cjs`, `analisesAutomaticas.cjs`) passa por aqui
 * e não sabe qual provedor está ativo:
 *
 *  - `ollama`     — `ollamaClient.cjs` + o loop de tool-calling em
 *                   `orquestrador.cjs` (deste lado).
 *  - `claude-cli` — `claudeCli/cliente.cjs`, que dirige o Claude Code CLI; o
 *                   loop de ferramentas é do CLI, via MCP.
 *
 * Os `require` são preguiçosos de propósito: `orquestrador.cjs` puxa
 * `tools.cjs` → repositório → SQLite, e `analiseCliente.cjs` (que só precisa
 * de `gerarJSON`) não tem por que arrastar essa cadeia inteira só por
 * importar o provedor.
 */

const impl = () => (provedorAtivo() === 'claude-cli'
  ? require('./claudeCli/cliente.cjs')
  : require('./orquestrador.cjs'));

/** Loop agêntico completo: mensagens → resposta final em texto. */
const conversar = (opts) => impl().conversar(opts);

/**
 * Objeto no formato que `analiseCliente.gerarAnaliseIA({ ollama })` espera —
 * mantém o nome do parâmetro de lá (não vale renomear em cascata em teste e
 * chamada só por cosmético) apontando pro provedor ativo.
 */
function clienteLLM() {
  if (provedorAtivo() === 'claude-cli') {
    const { gerarJSON } = require('./claudeCli/cliente.cjs');
    return { gerarJSON };
  }
  return require('./ollamaClient.cjs');
}

module.exports = { conversar, clienteLLM, provedorAtivo };
