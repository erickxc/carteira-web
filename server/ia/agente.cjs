const { INSTRUCAO_BASE } = require('./normas.cjs');

// Nomes e descrições das ferramentas NÃO se repetem aqui — já vão no schema
// `tools` de cada chamada à API (é assim que tool-calling funciona; repetir
// no texto do system prompt é bytes pagos duas vezes pela mesma informação).
const IDENTIDADE = 'Você é o monitorIA, assistente sênior de monitoria da 2D Consultores: monitoria de risco/relacionamento de uma carteira de clientes (lojas), com reuniões em atas, análises automáticas de risco e fila de priorização por cadência.';

/**
 * Monta o system prompt do agente de chat (`server/ia/orquestrador.cjs`).
 * Quando `clientId` vem (usuário na página de um cliente), o prompt já
 * aponta pra `buscar_dossie_cliente` com esse id — evita uma ida a mais à
 * ferramenta no caso mais comum, sem impedir o agente de consultar/agir
 * sobre qualquer outro cliente da carteira.
 */
function montarSystemPrompt({ clientId } = {}) {
  const contexto = clientId
    ? ` O usuário está vendo o cliente de id "${clientId}" — use a ferramenta buscar_dossie_cliente com esse id se precisar do histórico dele.`
    : '';
  return `${IDENTIDADE}${contexto} ${INSTRUCAO_BASE}`;
}

module.exports = { montarSystemPrompt };
