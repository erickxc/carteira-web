const crypto = require('crypto');
const { clienteLLM } = require('./provider.cjs');

// Mesmo espírito de DOSSIE_MAX_CHARS (analiseCliente.cjs): rede de segurança,
// não o controle real (o prompt já pede texto enxuto).
const SECAO_MAX_CHARS = 4000;

function textoChecklist(checklist) {
  const itens = Array.isArray(checklist) ? checklist : [];
  if (itens.length === 0) return '(nenhum item de pauta registrado)';
  return itens.map((i) => `- [${i?.done ? 'x' : ' '}] ${i?.text ?? ''}`).join('\n');
}

/** Mesmo formato de `analiseCliente.textoProdutosSituacao`, sem depender de
 *  `listaJSON` (aqui os itens já chegam como array do corpo da requisição,
 *  não como coluna serializada de planilha). */
function textoProdutosSituacao(itens) {
  if (!Array.isArray(itens) || itens.length === 0) return '';
  const linhas = itens.map((i) => `- ${i?.produto ?? ''}${i?.cliente ? ` (${i.cliente})` : ''}: ${i?.situacao ?? ''}`);
  return `\n\nProdutos — situação registrada na reunião:\n${linhas.join('\n')}`;
}

/**
 * Monta o prompt pro botão "Gerar ata com IA" do `EventFormModal`. Escopo
 * deliberadamente ESTREITO: só as 3 seções de conteúdo da ata (o que foi
 * tratado / decisões / próximos passos) — cabeçalho, participantes e a seção
 * de pauta continuam 100% determinísticos em `src/utils/ata.ts` (dados
 * estruturados, não há motivo pra IA "reescrever" cliente/data/monitor e
 * arriscar inventar algo ali).
 */
function montarPromptAta({ subject, resumo, description, checklist, produtosSituacao, transcricao } = {}) {
  const relato = resumo?.trim() || description?.trim() || '(nenhum resumo escrito pelo monitor)';
  const transcricaoTrim = transcricao?.trim();

  return `Você ajuda um monitor da 2D Consultores a redigir trechos da ata de uma reunião de monitoria. Escreva em português do Brasil, revisado, sem erros de ortografia/gramática.

ASSUNTO DA REUNIÃO: ${subject?.trim() || '(não informado)'}

PAUTA (o que estava planejado tratar):
${textoChecklist(checklist)}

RESUMO ESCRITO PELO MONITOR:
${relato}${textoProdutosSituacao(produtosSituacao)}

TRANSCRIÇÃO DA REUNIÃO${transcricaoTrim ? ':' : ' (não fornecida)'}
${transcricaoTrim || ''}

A partir dessas fontes, gere o CONTEÚDO de três seções de uma ata formal. Priorize a TRANSCRIÇÃO quando ela existir — é o registro mais fiel do que foi dito; use resumo/pauta como apoio, ou como única fonte quando não houver transcrição.

Responda em JSON com exatamente estes campos:
{
  "oQueFoiTratado": "prosa objetiva do que foi discutido — pode ter múltiplas linhas, sem numeração",
  "decisoes": "uma linha por decisão tomada explicitamente, sem marcador (o código adiciona) — string vazia se não houve decisão",
  "proximosPassos": "uma linha por compromisso/próximo passo NOVO identificado na transcrição/resumo que NÃO está já coberto pelos itens de pauta acima — string vazia se não houver nenhum"
}

Regras:
- Não invente fato que não está nas fontes acima.
- "proximosPassos" não deve repetir itens já listados na PAUTA — só compromissos novos que apareceram na conversa/resumo.
- Cada linha é uma frase direta — nada de parágrafo longo dentro de uma linha.`;
}

function normalizarSecao(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto.length > SECAO_MAX_CHARS ? texto.slice(0, SECAO_MAX_CHARS).trim() : texto;
}

/**
 * Gera as 3 seções de conteúdo da ata via LLM. Não acessa repositório nem
 * sistema de arquivos — recebe os campos já montados pelo form e devolve o
 * resultado estruturado (mesmo padrão de `analiseCliente.gerarAnaliseIA`,
 * testável sem provedor de IA de verdade).
 */
async function gerarAtaIA({ subject, resumo, description, checklist, produtosSituacao, transcricao, llm = clienteLLM(), repo } = {}) {
  const prompt = montarPromptAta({ subject, resumo, description, checklist, produtosSituacao, transcricao });
  // Medição: sem isto a geração de ata gastava tokens (pagos, no provedor
  // Claude) sem aparecer no painel de consumo — só o chat era medido.
  const uso = {};
  const t0 = Date.now();
  const saida = await llm.gerarJSON(prompt, { coletarUso: uso });
  if (repo) {
    const { registrarUso } = require('./uso.cjs');
    const { provedorAtivo } = require('./provider.cjs');
    registrarUso(repo, {
      origem: 'ata', provedor: provedorAtivo(), modelo: uso.modelo, turnId: crypto.randomUUID(),
      inputTokens: uso.inputTokens, outputTokens: uso.outputTokens,
      cacheCreationTokens: uso.cacheCreationTokens, cacheReadTokens: uso.cacheReadTokens,
      custoUsd: uso.custoUsd ?? 0, duracaoMs: Date.now() - t0,
      pergunta: prompt, resposta: uso.resposta ?? '',
    });
  }
  return {
    oQueFoiTratado: normalizarSecao(saida.oQueFoiTratado),
    decisoes: normalizarSecao(saida.decisoes),
    proximosPassos: normalizarSecao(saida.proximosPassos),
  };
}

module.exports = { gerarAtaIA, montarPromptAta };
