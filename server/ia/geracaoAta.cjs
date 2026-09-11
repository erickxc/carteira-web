const crypto = require('crypto');
const { clienteLLM, provedorAtivo } = require('./provider.cjs');
const { textoDirecaoOuLegado } = require('./formatoRegistroMonitoria.cjs');

// Mesmo espírito de DOSSIE_MAX_CHARS (analiseCliente.cjs): rede de segurança,
// não o controle real (o prompt já pede texto enxuto).
const SECAO_MAX_CHARS = 4000;

// Teto da TRANSCRIÇÃO enviada ao modelo. Dois tetos:
//  - COM Registro da Monitoria preenchido, os fatos por cliente/produto já
//    estão cobertos ali (fonte de maior confiança, ver prompt abaixo) — a
//    transcrição vira só contexto/nuance, então corta bem mais curto.
//  - SEM registro, a transcrição é a ÚNICA fonte dos fatos — o teto aqui é só
//    uma rede de segurança pra reunião de HORAS não estourar o prompt, não um
//    controle de velocidade: bug real (Guscar, 10/09) — um teto de 12000
//    (pensado pra "gerar mais rápido") cortou o MEIO de uma transcrição de
//    22794 chars, e a única decisão real da reunião estava a 47% do texto —
//    nem no início nem no fim, cortada pelo `truncarTranscricao` mesmo esse
//    já mantendo início+fim. Decisão pode estar em QUALQUER ponto da reunião;
//    não tem posição "seguro cortar" sem uma extração mais esperta (fora de
//    escopo agora). 40000 chars cobre reuniões de até ~1h30-2h sem cortar.
const TRANSCRICAO_MAX_CHARS_COM_REGISTROS = 3000;
const TRANSCRICAO_MAX_CHARS_SEM_REGISTROS = 40000;

/**
 * Corta MANTENDO INÍCIO + FIM, descartando o meio — bug real: cortar só do
 * início (`.slice(0, teto)`) perdia decisões/próximos passos, que tipicamente
 * são ditos no FECHAMENTO da reunião, no fim da transcrição. "Decisões" e
 * "Próximos passos" voltavam vazios mesmo quando a transcrição os tinha,
 * porque a parte final nunca chegava no prompt.
 */
function truncarTranscricao(transcricaoTrim, temRegistros) {
  if (!transcricaoTrim) return '';
  const teto = temRegistros ? TRANSCRICAO_MAX_CHARS_COM_REGISTROS : TRANSCRICAO_MAX_CHARS_SEM_REGISTROS;
  if (transcricaoTrim.length <= teto) return transcricaoTrim;
  const motivo = temRegistros ? 'os registros estruturados acima já cobrem os fatos por cliente/produto' : 'reunião muito longa';
  const metadeInicio = Math.floor(teto * 0.55); // um pouco mais de espaço pro início (contexto costuma precisar de mais texto que o fechamento)
  const metadeFim = teto - metadeInicio;
  const inicio = transcricaoTrim.slice(0, metadeInicio).trim();
  const fim = transcricaoTrim.slice(-metadeFim).trim();
  return `${inicio}\n\n[...transcrição truncada no meio — ${motivo}...]\n\n${fim}`;
}

function textoChecklist(checklist) {
  const itens = Array.isArray(checklist) ? checklist : [];
  if (itens.length === 0) return '(nenhum item de pauta registrado)';
  return itens.map((i) => `- [${i?.done ? 'x' : ' '}] ${i?.text ?? ''}`).join('\n');
}

/** Uma linha por registro (cliente final/produto/situação) — sem cabeçalho
 *  próprio, quem chama decide o título da seção no prompt. Mesmo formato de
 *  `analiseCliente.textoProdutosSituacao`, sem depender de `listaJSON` (aqui
 *  os itens já chegam como array do corpo da requisição, não como coluna
 *  serializada de planilha). */
function textoProdutosSituacao(itens) {
  if (!Array.isArray(itens) || itens.length === 0) return '(nenhum)';
  return itens.map((i) => {
    const quem = [i?.cliente, i?.produto].filter(Boolean).join(' · ') || '(sem identificação)';
    return `- ${quem}: ${textoDirecaoOuLegado(i || {})}${i?.grupo ? ` [grupo: ${i.grupo}]` : ''}`;
  }).join('\n');
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

function montarPromptAta({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo = [], clientesCatalogo = [], monitores = [] } = {}) {
  const relato = resumo?.trim() || description?.trim() || '(nenhum resumo escrito pelo monitor)';
  // Nome de quem responde pelo lado da 2D. O modelo escrevia "[2D]" /
  // "[Negócios 2D]" nas tarefas internas, e o usuário quer o NOME da pessoa —
  // "2D" é a própria casa, não identifica responsável.
  const responsavelInterno = (Array.isArray(monitores) ? monitores.filter(Boolean) : []).join(', ') || '2D';
  const temRegistros = Array.isArray(produtosSituacao) && produtosSituacao.length > 0;
  const transcricaoTrim = truncarTranscricao(transcricao?.trim(), temRegistros);

  return `Você ajuda um monitor da 2D Consultores a redigir trechos da ata de uma reunião de monitoria. Escreva em português do Brasil, revisado, sem erros de ortografia/gramática.

ASSUNTO DA REUNIÃO: ${subject?.trim() || '(não informado)'}

PAUTA (o que estava planejado tratar):
${textoChecklist(checklist)}

REGISTROS ESTRUTURADOS DA MONITORIA${temRegistros ? ' (o monitor já apurou e confirmou estes fatos, cliente final/produto por produto — trate como VERDADE ESTABELECIDA, não como algo a confirmar de novo)' : ' (nenhum registrado nesta reunião)'}:
${textoProdutosSituacao(produtosSituacao)}

RESUMO ESCRITO PELO MONITOR:
${relato}

TRANSCRIÇÃO DA REUNIÃO${transcricaoTrim ? ':' : ' (não fornecida)'}
${transcricaoTrim || ''}${textoCatalogo(produtosCatalogo, clientesCatalogo)}

Você tem três fontes. Antes de escrever, CRUZE-AS — não trate como blocos independentes a colar em sequência:
1. Os REGISTROS ESTRUTURADOS são o fato confirmado pra cada cliente final/produto (o monitor já verificou isso, é a fonte de maior confiança sobre O QUE aconteceu com aquele cliente/produto específico).
2. A TRANSCRIÇÃO é o registro mais fiel de COMO/POR QUE aquilo foi discutido — use-a pra dar contexto e nuance ao mesmo fato, não pra repeti-lo.
3. Se um cliente final/produto aparece TANTO num registro estruturado QUANTO na transcrição, funda as duas informações numa linha SÓ em "oQueFoiTratado" (o fato do registro + o contexto/motivo da transcrição) — nunca escreva a mesma informação duas vezes (uma vinda do registro, outra "descoberta" de novo na transcrição). Onde não há registro estruturado, use resumo/transcrição normalmente.

A partir dessas fontes já cruzadas, gere o CONTEÚDO de três seções de uma ata formal.

Responda em JSON com exatamente estes campos:
{
  "oQueFoiTratado": "UMA LINHA POR TÓPICO tratado (quebre com \\n). Cada linha é uma frase objetiva e independente, no máximo ~20 palavras — NÃO devolva um parágrafo único longo",
  "decisoes": "uma linha por decisão tomada explicitamente, sem marcador (o código adiciona), no máximo ~20 palavras por linha — string vazia se não houve decisão",
  "proximosPassos": "uma linha por compromisso/próximo passo NOVO identificado na transcrição/resumo que NÃO está já coberto pelos itens de pauta acima, no máximo ~20 palavras por linha — string vazia se não houver nenhum"
}

Regras:
- Não invente fato que não está nas fontes acima.
- Seja DIRETO: cada linha é o fato em si, sem repetir contexto que outra linha já deu, sem "explicar o óbvio", sem floreio nem transição ("além disso", "vale destacar que"). Prefira frase curta e específica a frase longa e genérica — isso vale pra TODAS as seções, o tamanho da ata deve refletir quantos tópicos/decisões/passos existem de verdade, não o quanto se pode escrever sobre cada um.
- "proximosPassos" não deve repetir itens já listados na PAUTA — só compromissos novos que apareceram na conversa/resumo.
- Em "proximosPassos", comece CADA linha com o responsável entre colchetes, exatamente como a fonte indica: "[Luiz Guilherme] acompanhar ...", "[Daniel] verificar ...". Quando a tarefa é do lado da 2D (do monitor da reunião), escreva o NOME DO MONITOR: "[${responsavelInterno}] enviar ...". NUNCA escreva "[2D]", "[Negócios 2D]", "[Monitoria]" ou qualquer nome de área — sempre o nome de uma pessoa. Sem responsável identificável na fonte, escreva "[a definir]" — nunca atribua ao monitor por padrão.
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
async function gerarAtaIA({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo, clientesCatalogo, monitores, llm = clienteLLM(), repo } = {}) {
  const prompt = montarPromptAta({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo, clientesCatalogo, monitores });
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

/**
 * Igual a `gerarAtaIA`, com progresso ao vivo via `onDelta(textoBrutoAcumulado)`
 * — pedido real do usuário: gerar ata media 106s (medido em UsoIA), e o
 * spinner parado por até 2,5 minutos parecia travado. `--effort` do CLI não
 * ajuda aqui (tokens de "pensamento" são uma fração desprezível do total
 * nos casos lentos) — o que dá pra fazer é mostrar o texto crescendo.
 *
 * Só streama de verdade no provedor `claude-cli` (`gerarJSONStream` só
 * existe ali); no Ollama cai pra `gerarAtaIA` normal, sem quebrar nada — não
 * vale duplicar esforço num provedor que não é o de produção.
 */
async function gerarAtaIAStream({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo, clientesCatalogo, monitores, onDelta, llm = clienteLLM(), repo } = {}) {
  if (typeof llm.gerarJSONStream !== 'function') {
    return gerarAtaIA({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo, clientesCatalogo, monitores, llm, repo });
  }

  const prompt = montarPromptAta({ subject, resumo, description, checklist, produtosSituacao, transcricao, produtosCatalogo, clientesCatalogo, monitores });
  const uso = {};
  const t0 = Date.now();
  let acumulado = '';
  const saida = await llm.gerarJSONStream(prompt, {
    coletarUso: uso,
    onDelta: (pedaco) => { acumulado += pedaco; onDelta?.(acumulado); },
  });
  if (repo) {
    const { registrarUso } = require('./uso.cjs');
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

module.exports = { gerarAtaIA, gerarAtaIAStream, montarPromptAta };
