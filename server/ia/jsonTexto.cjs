/**
 * Extração de JSON de resposta de modelo. Modelo instruído a devolver JSON
 * puro ainda embrulha em ```json ... ``` com frequência — visto tanto nos
 * modelos do tier gratuito do Ollama quanto no Claude via CLI (que é um
 * agente de terminal, treinado pra formatar saída pra humano).
 *
 * Compartilhado por `ollamaClient.cjs` e `claudeCli/cliente.cjs` pra não ter
 * duas versões da mesma heurística divergindo.
 */
function extrairJSON(texto) {
  const bruto = String(texto ?? '');
  const bloco = bruto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloco) return bloco[1].trim();
  // Sem cerca: recorta do primeiro `{`/`[` até o fechamento correspondente
  // mais externo, descartando texto de conversa em volta ("Aqui está o
  // JSON:"). Só age quando há delimitador — texto sem nada disso passa
  // inteiro e o `JSON.parse` de quem chamou dá o erro claro.
  const i = bruto.search(/[{[]/);
  if (i === -1) return bruto.trim();
  const abre = bruto[i];
  const fecha = abre === '{' ? '}' : ']';
  const j = bruto.lastIndexOf(fecha);
  return j > i ? bruto.slice(i, j + 1).trim() : bruto.trim();
}

module.exports = { extrairJSON };
