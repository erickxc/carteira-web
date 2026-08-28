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
// Teto do bloco de memória no prompt. Ele é reenviado a CADA chamada ao
// modelo, então uma lista que cresce sem limite vira custo fixo crescente em
// toda pergunta. Se estourar, as mais antigas ficam de fora — e a ferramenta
// `buscar_memoria` continua enxergando tudo.
const MAX_MEMORIAS_PROMPT = 25;
const MAX_CHARS_MEMORIAS = 2000;

/**
 * Regras gerais que o usuário mandou guardar entram DIRETO no system prompt,
 * não só como ferramenta. Memória que só existe atrás de uma chamada é memória
 * que o modelo esquece de consultar — e o ponto de "a ata só é preenchida ao
 * final da reunião" é justamente valer sem ninguém pedir.
 */
function blocoMemoria(memorias = []) {
  if (!memorias.length) return '';
  const linhas = [];
  let total = 0;
  for (const m of memorias.slice(-MAX_MEMORIAS_PROMPT)) {
    const linha = `- ${String(m.texto ?? '').trim()}`;
    if (total + linha.length > MAX_CHARS_MEMORIAS) break;
    linhas.push(linha);
    total += linha.length;
  }
  if (!linhas.length) return '';
  return ` REGRAS DO PROCESSO registradas pelo usuário (valem sempre, trate como fato desta operação):\n${linhas.join('\n')}\n`;
}

function montarSystemPrompt({ clientId, memorias } = {}) {
  const contexto = clientId
    ? ` O usuário está vendo o cliente de id "${clientId}" — use a ferramenta buscar_dossie_cliente com esse id se precisar do histórico dele.`
    : '';
  return `${IDENTIDADE}${contexto}${blocoMemoria(memorias)} ${INSTRUCAO_BASE}`;
}

module.exports = { montarSystemPrompt, blocoMemoria };
