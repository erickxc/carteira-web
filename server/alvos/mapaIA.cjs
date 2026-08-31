const { sugerir, vincular } = require('./mapa.cjs');

/**
 * Vínculo loja <-> cliente com o LLM no papel de QUEM PERGUNTA, não de quem
 * adivinha.
 *
 * O que ficou claro medindo os dados: existe um caso que nenhuma heurística e
 * nenhum modelo pode resolver. O Mineirão tem `ID_LOJA` = `0001` e `0002`, e o
 * balcão dele é "CONSUMIDOR ESPECIAL", sem cidade — não há no arquivo nenhuma
 * informação que diga qual das duas é a matriz. Só quem conhece o cliente sabe.
 *
 * Então o fluxo é: o LLM olha os dados da loja, descreve a SITUAÇÃO e, quando as
 * pistas não bastam, devolve uma PERGUNTA específica com as opções possíveis. A
 * resposta da pessoa é o que fecha o vínculo — em uma frase livre ("a 0001 é a
 * matriz") ou escolhendo uma opção.
 *
 * Quatro regras impostas pelo código, não pelo prompt:
 *
 * 1. **Escolher só dentro da lista de candidatos**, na sugestão e na
 *    interpretação da resposta. Id fora da lista é descartado. Este projeto já
 *    levou um bug de produção assim (o agente gravou `monitores: ["Erick"]`,
 *    valor inexistente no cadastro, e o campo apareceu vazio na tela); aqui um
 *    id inventado apontaria a venda de uma loja para o cliente errado.
 * 2. **Não decidir nunca vira silêncio.** Se o modelo não devolver pergunta, o
 *    código monta uma — o usuário precisa ter o que responder.
 * 3. **As opções são montadas pelo código**, a partir dos candidatos. O modelo
 *    escreve a pergunta, não o cardápio.
 * 4. **Gravar é ação de gente.** `aplicarResposta` só é chamado depois da
 *    resposta, e revalida a escolha antes de persistir.
 */

const CLIENTES_DE_CONTEXTO = 6;
const LIMITE_TEXTO = 300;

const texto = (v, limite = LIMITE_TEXTO) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);

function contextoDaLoja(agregado, loja) {
  const doLoja = (agregado.clientes || []).filter((c) => c.loja === loja);
  return doLoja.slice(0, CLIENTES_DE_CONTEXTO)
    .map((c) => `- ${c.cliente} (R$ ${Math.round(c.receita).toLocaleString('pt-BR')})`)
    .join('\n') || '- (nenhum cliente no arquivo)';
}

function montarPrompt(empresa, loja, agregado, candidatos) {
  const lista = candidatos
    .map((c) => `- clientId "${c.clientId}" = ${c.empresa}  [heurística: ${c.confianca} — ${c.motivo}]`)
    .join('\n');

  return [
    'Você liga a LOJA de um arquivo de vendas ao CLIENTE correspondente numa carteira de monitoria.',
    '',
    `Empresa (pasta do arquivo): ${empresa}`,
    `ID_LOJA no arquivo: ${loja}`,
    '',
    'Maiores clientes DESSA loja no arquivo (o nome do balcão costuma citar a cidade da loja):',
    contextoDaLoja(agregado, loja),
    '',
    'Clientes candidatos na carteira:',
    lista,
    '',
    'Regras:',
    '- Escolha APENAS um dos clientId listados acima, copiado exatamente. Nunca invente id.',
    '- Siglas no ID_LOJA costumam ser as iniciais da cidade/unidade (ex.: "_CF" = "Cabo Frio").',
    '- Se as pistas não permitirem decidir, use clientId null e escreva em "pergunta" UMA pergunta',
    '  curta e específica para quem conhece o cliente, que resolva o caso (ex.: "No Mineirão, qual',
    '  loja é a matriz: 0001 ou 0002?"). Não pergunte de forma genérica.',
    '- "situacao" descreve em uma frase o que os dados desta loja mostram.',
    '',
    'Responda SÓ com JSON: {"clientId": "<id ou null>", "confianca": "alta|media|baixa",',
    '"motivo": "<uma frase>", "situacao": "<uma frase>", "pergunta": "<pergunta ou null>"}',
  ].join('\n');
}

/**
 * Opções que a tela oferece. Montadas aqui, nunca pelo modelo — a pessoa precisa
 * poder dizer também "não é nenhum destes", senão a única saída da pergunta é
 * uma resposta errada.
 */
function opcoesDaLoja(candidatos) {
  return [
    ...candidatos.map((c) => ({ clientId: c.clientId, rotulo: c.empresa })),
    { clientId: null, rotulo: 'Nenhum destes / é outro cliente' },
  ];
}

/** Pergunta de reserva, para quando o modelo não escreve uma. */
function perguntaPadrao(loja, candidatos) {
  const nomes = candidatos.map((c) => c.empresa).join(' ou ');
  return nomes
    ? `A loja "${loja}" do arquivo corresponde a qual cliente: ${nomes}?`
    : `A qual cliente da carteira corresponde a loja "${loja}" do arquivo?`;
}

/**
 * `opts.gerarJSON` é injetável (teste e troca de provedor); o default é o Ollama,
 * exigido em `require` tardio para este módulo não arrastar a camada de IA.
 *
 * `opts.revisarTodas` faz o modelo opinar também nas lojas que a heurística já
 * resolveu. Fora disso, ele é chamado só onde não havia resposta ou havia
 * empate — é o que mantém o custo proporcional ao problema.
 */
async function validarComIA(empresa, agregado, clientes, opts = {}) {
  const gerarJSON = opts.gerarJSON || require('../ia/ollamaClient.cjs').gerarJSON;
  const base = opts.sugestoes || sugerir(empresa, agregado, clientes);

  const resultados = [];
  for (const item of base) {
    const precisa = opts.revisarTodas || !item.sugestao || item.ambiguo;

    // Sem candidato nenhum não há o que o modelo escolha — mas continua havendo
    // o que perguntar, e a pergunta é a parte que resolve o caso.
    if (item.candidatos.length === 0) {
      resultados.push({
        ...item,
        ia: precisa
          ? { clientId: null, pergunta: perguntaPadrao(item.loja, []), opcoes: opcoesDaLoja([]), origem: 'codigo' }
          : null,
      });
      continue;
    }
    if (!precisa) {
      resultados.push({ ...item, ia: null });
      continue;
    }

    const validos = new Map(item.candidatos.map((c) => [String(c.clientId), c]));
    let resposta;
    try {
      resposta = await gerarJSON(montarPrompt(empresa, item.loja, agregado, item.candidatos));
    } catch (err) {
      // Ollama fora do ar não pode travar a decisão: cai na pergunta do código.
      resultados.push({
        ...item,
        ia: {
          erro: err.message,
          clientId: null,
          pergunta: perguntaPadrao(item.loja, item.candidatos),
          opcoes: opcoesDaLoja(item.candidatos),
          origem: 'codigo',
        },
      });
      continue;
    }

    const situacao = texto(resposta?.situacao);
    const escolhido = resposta?.clientId == null ? null : String(resposta.clientId);
    const indeciso = escolhido === null || escolhido === '' || escolhido === 'null';
    const foraDaLista = !indeciso && !validos.has(escolhido);

    if (indeciso || foraDaLista) {
      resultados.push({
        ...item,
        ia: {
          clientId: null,
          situacao,
          motivo: texto(resposta?.motivo),
          // Id inventado é tratado como indecisão, não como escolha: o efeito
          // prático é o mesmo (ninguém sabe), e a pessoa ganha a pergunta.
          descartado: foraDaLista ? 'cliente fora da lista' : undefined,
          bruto: foraDaLista ? escolhido : undefined,
          pergunta: texto(resposta?.pergunta) || perguntaPadrao(item.loja, item.candidatos),
          opcoes: opcoesDaLoja(item.candidatos),
          origem: texto(resposta?.pergunta) ? 'ollama' : 'codigo',
        },
      });
      continue;
    }

    const candidato = validos.get(escolhido);
    resultados.push({
      ...item,
      ia: {
        clientId: escolhido,
        empresa: candidato.empresa,
        situacao,
        confianca: ['alta', 'media', 'baixa'].includes(resposta?.confianca) ? resposta.confianca : 'baixa',
        motivo: texto(resposta?.motivo),
        origem: 'ollama',
        // Divergência entre as duas fontes é o sinal mais valioso daqui: é onde
        // vale a pena alguém olhar antes de confirmar.
        divergeDaHeuristica: !!item.sugestao && item.sugestao.clientId !== escolhido,
      },
    });
  }
  return resultados;
}

/**
 * Traduz a resposta em texto livre da pessoa ("a 0001 é a matriz", "é a de Cabo
 * Frio") num `clientId` da lista.
 *
 * Tenta primeiro sem LLM — resposta que cita o id ou o nome de um candidato, de
 * forma não ambígua, é decidida aqui. Só cai no modelo quando o texto não casa
 * direto, e mesmo assim a saída é revalidada contra a lista.
 *
 * `naoEhNenhum` é resposta legítima e vem separada de "não entendi": uma manda
 * parar de perguntar, a outra manda perguntar de novo.
 */
async function interpretarResposta(pergunta, resposta, candidatos, opts = {}) {
  const bruta = texto(resposta, 500);
  if (!bruta) return { clientId: null, entendido: false, motivo: 'resposta vazia' };

  const alvo = bruta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const casaId = candidatos.filter((c) => alvo.includes(String(c.clientId).toLowerCase()));
  if (casaId.length === 1) {
    return { clientId: casaId[0].clientId, entendido: true, origem: 'texto', motivo: 'a resposta cita o id do cliente' };
  }

  const casaNome = candidatos.filter((c) => {
    const nome = String(c.empresa).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Compara pelo trecho da loja (depois de " - "), que é o que distingue os
    // clientes do mesmo grupo. Comparar o nome inteiro casaria "Aliança" nos
    // dois e não decidiria nada.
    const trecho = nome.includes(' - ') ? nome.split(' - ').slice(1).join(' - ') : nome;
    return trecho.length > 2 && alvo.includes(trecho);
  });
  if (casaNome.length === 1) {
    return { clientId: casaNome[0].clientId, entendido: true, origem: 'texto', motivo: 'a resposta cita o nome do cliente' };
  }
  if (/\b(nenhum|nao e|outro cliente|nao sei)\b/.test(alvo)) {
    return { clientId: null, entendido: true, naoEhNenhum: true, origem: 'texto', motivo: 'a resposta descarta os candidatos' };
  }

  const gerarJSON = opts.gerarJSON || require('../ia/ollamaClient.cjs').gerarJSON;
  const prompt = [
    'Uma pessoa respondeu a uma pergunta sobre qual cliente corresponde a uma loja.',
    '',
    `Pergunta: ${texto(pergunta)}`,
    `Resposta da pessoa: ${bruta}`,
    '',
    'Clientes possíveis:',
    ...candidatos.map((c) => `- clientId "${c.clientId}" = ${c.empresa}`),
    '',
    'Diga qual clientId a resposta indica. Se a resposta disser que não é nenhum deles, use',
    'clientId null e naoEhNenhum true. Se a resposta não permitir concluir, use clientId null e',
    'naoEhNenhum false. Nunca invente id.',
    '',
    'Responda SÓ com JSON: {"clientId": "<id ou null>", "naoEhNenhum": true|false, "motivo": "<uma frase>"}',
  ].join('\n');

  let saida;
  try {
    saida = await gerarJSON(prompt);
  } catch (err) {
    return { clientId: null, entendido: false, motivo: `não foi possível interpretar a resposta: ${err.message}` };
  }

  const escolhido = saida?.clientId == null ? null : String(saida.clientId);
  const valido = candidatos.some((c) => String(c.clientId) === escolhido);
  if (escolhido && valido) {
    return { clientId: escolhido, entendido: true, origem: 'ollama', motivo: texto(saida?.motivo) };
  }
  if (saida?.naoEhNenhum === true) {
    return { clientId: null, entendido: true, naoEhNenhum: true, origem: 'ollama', motivo: texto(saida?.motivo) };
  }
  return {
    clientId: null,
    entendido: false,
    origem: 'ollama',
    motivo: texto(saida?.motivo) || 'a resposta não indicou um dos clientes',
  };
}

/**
 * Persiste o vínculo a partir da resposta. Revalida contra os candidatos mesmo
 * quando a escolha vem da tela: é a última porta antes de gravar, e é ela que
 * garante que o arquivo de vínculos nunca contenha um id que não existe.
 */
function aplicarResposta(empresa, loja, clientId, candidatos, caminho) {
  if (clientId && !candidatos.some((c) => String(c.clientId) === String(clientId))) {
    throw new Error(`Cliente "${clientId}" não está entre os candidatos da loja "${loja}".`);
  }
  vincular(empresa, loja, clientId || null, caminho);
  return { empresa, loja, clientId: clientId || null };
}

module.exports = {
  validarComIA,
  interpretarResposta,
  aplicarResposta,
  montarPrompt,
  contextoDaLoja,
  opcoesDaLoja,
  perguntaPadrao,
};
