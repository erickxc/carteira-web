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
  const linhas = itens.map((i) => {
    const quem = [i?.cliente, i?.produto].filter(Boolean).join(' · ') || '(sem identificação)';
    return `- ${quem}: ${i?.situacao ?? ''}${i?.tag ? ` [tag: ${i.tag}]` : ''}${i?.grupo ? ` [grupo: ${i.grupo}]` : ''}`;
  });
  return `\n\nRegistro da monitoria (cliente final / produto):\n${linhas.join('\n')}`;
}

/**
 * Monta o prompt pro botão "Gerar ata com IA" do `EventFormModal`. Escopo
 * deliberadamente ESTREITO: só as 3 seções de conteúdo da ata (o que foi
 * tratado / decisões / próximos passos) — cabeçalho, participantes e a seção
 * de pauta continuam 100% determinísticos em `src/utils/ata.ts` (dados
 * estruturados, não há motivo pra IA "reescrever" cliente/data/monitor e
 * arriscar inventar algo ali).
 */
/**
 * Nomes REAIS do arquivo de vendas, pra IA corrigir o que a transcrição ouviu
 * errado. Caso real: o transcritor escreveu "queijo de embreagem" (e "gosto"
 * onde era "agosto") — sem a lista do cadastro, a IA não tem contra o que
 * conferir e repete o erro na ata e depois no dossiê.
 */
function textoCatalogo(produtos = [], clientes = []) {
  if (produtos.length === 0 && clientes.length === 0) return '';
  const lista = (t, xs) => (xs.length ? `\n${t}: ${xs.slice(0, 200).join(', ')}` : '');
  return `

NOMES CADASTRADOS NO ARQUIVO DE VENDAS DESTE CLIENTE (use-os para corrigir grafia da transcrição):${lista('Produtos', produtos)}${lista('Clientes finais', clientes)}`;
}

function montarPromptAta({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo = [], clientesCatalogo = [] } = {}) {
  const relato = resumo?.trim() || description?.trim() || '(nenhum resumo escrito pelo monitor)';
  const transcricaoTrim = transcricao?.trim();

  return `Você ajuda um monitor da 2D Consultores a redigir trechos da ata de uma reunião de monitoria. Escreva em português do Brasil, revisado, sem erros de ortografia/gramática.

ASSUNTO DA REUNIÃO: ${subject?.trim() || '(não informado)'}

PAUTA (o que estava planejado tratar):
${textoChecklist(checklist)}

RESUMO ESCRITO PELO MONITOR:
${relato}${textoProdutosSituacao(produtosSituacao)}

TRANSCRIÇÃO DA REUNIÃO${transcricaoTrim ? ':' : ' (não fornecida)'}
${transcricaoTrim || ''}${textoCatalogo(produtosCatalogo, clientesCatalogo)}

A partir dessas fontes, gere o CONTEÚDO de três seções de uma ata formal. Priorize a TRANSCRIÇÃO quando ela existir — é o registro mais fiel do que foi dito; use resumo/pauta como apoio, ou como única fonte quando não houver transcrição.

Responda em JSON com exatamente estes campos:
{
  "oQueFoiTratado": "UMA LINHA POR TÓPICO tratado (quebre com \\n). Cada linha é uma frase objetiva e independente — NÃO devolva um parágrafo único longo",
  "decisoes": "uma linha por decisão tomada explicitamente, sem marcador (o código adiciona) — string vazia se não houve decisão",
  "proximosPassos": "uma linha por compromisso/próximo passo NOVO identificado na transcrição/resumo que NÃO está já coberto pelos itens de pauta acima — string vazia se não houver nenhum"
}

Regras:
- Não invente fato que não está nas fontes acima.
- "proximosPassos" não deve repetir itens já listados na PAUTA — só compromissos novos que apareceram na conversa/resumo.
- Em "proximosPassos", comece CADA linha com o responsável entre colchetes, exatamente como a fonte indica: "[Luiz Guilherme] acompanhar ...", "[Daniel] verificar ...", "[2D] enviar ...". Use "[2D]" só quando a tarefa é da 2D/do monitor. Sem responsável identificável na fonte, escreva "[a definir]" — nunca atribua à 2D por padrão.
- Transcrição automática erra nome de produto e de empresa. Quando um termo da transcrição for claramente uma variação de um NOME CADASTRADO acima, use o nome cadastrado (ex.: ouviu "queijo de embreagem" e o cadastro tem "Kit Embreagem" → escreva "Kit Embreagem"). Não force: se não houver correspondência plausível, mantenha o termo como veio.
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
async function gerarAtaIA({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo, clientesCatalogo, llm = clienteLLM(), repo } = {}) {
  const prompt = montarPromptAta({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo, clientesCatalogo });
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
