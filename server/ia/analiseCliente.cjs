const { clienteLLM } = require('./provider.cjs');
const { listaJSON } = require('../dominio/cadenciaServico.cjs');

const NIVEIS_RISCO = ['baixo', 'medio', 'alto'];

// Teto técnico do dossiê: o prompt já instrui o modelo a manter o texto
// enxuto (é o controle real — sem isso, cada rodada tende a empilhar
// histórico em vez de consolidar). Isso aqui é só rede de segurança: se o
// modelo ignorar a instrução, corta e loga em vez de deixar o arquivo crescer
// sem limite a cada reunião.
// Reduzido de 3000 (Cativo grande demais) pra 1800, e agora pra 1100 — mesma
// queixa de novo (Maniacar saiu com 1872 chars: o teto não incluía o
// cabeçalho que `montarDossieCompleto` adiciona por fora, então o arquivo
// final sempre passava do limite anunciado). Reserva ~150 chars pro
// cabeçalho (nome do cliente + risco + data), então o arquivo final fica
// perto de 1100-1250 — visivelmente mais curto pra ler numa reunião de
// carteira, que era o motivo original desse teto existir.
const DOSSIE_MAX_CHARS = 1100;

/** Bloco "Produtos — Situação" (serviço Monitoria) formatado pro prompt. */
function textoProdutosSituacao(itensRaw) {
  const itens = listaJSON(itensRaw);
  if (itens.length === 0) return '';
  // `produto` é opcional (registro pode ser só de cliente final) e `tag` é a
  // classificação do cliente final (vocabulário do Ecossistema) — separada da
  // situação, que é o relato do que foi conversado.
  const linhas = itens.map((i) => {
    const quem = [i.cliente, i.produto].filter(Boolean).join(' · ') || '(sem identificação)';
    return `- ${quem}: ${i.situacao}${i.tag ? ` [tag: ${i.tag}]` : ''}${i.grupo ? ` [grupo: ${i.grupo}]` : ''}`;
  });
  return `\nRegistro da monitoria (cliente final / produto):\n${linhas.join('\n')}`;
}

/** Marcadores de produto precificado + margem (tipo de evento Precificação) formatados pro prompt. */
function textoPrecificacoes(itensRaw) {
  const itens = listaJSON(itensRaw);
  if (itens.length === 0) return '';
  const linhas = itens.map((i) => `- ${i.produto}: margem ${i.margem}`);
  return `\nProdutos precificados:\n${linhas.join('\n')}`;
}

/**
 * Texto de um evento para o prompt: prefere a ata (estruturada), cai pro
 * resumo/descrição. `produtosSituacao`/`precificacoes` são anexados sempre
 * que presentes — dado estruturado (preenchido em campo próprio do form,
 * `EventFormModal`), mais confiável que o modelo extrair o mesmo fato de
 * prosa livre.
 *
 * `motivo` (reagendamento/cancelamento) e `reagendamentos` (quantas vezes ESTE
 * evento já foi remarcado) também entram — sem isso o modelo via só "status:
 * Cancelado" sem o porquê, e não tinha como notar "esta reunião já foi
 * cancelada 2x", que é justamente o padrão de desengajamento que vale virar
 * Ponto de Atenção no dossiê (pedido do usuário).
 */
function textoEvento(ev) {
  const corpo = ev.ata?.trim() || ev.resumo?.trim() || ev.description?.trim() || '(sem registro)';
  const motivo = ev.motivo?.trim() ? `\nMotivo: ${ev.motivo.trim()}` : '';
  const reagendamentos = Number(ev.reagendamentos) > 0
    ? `\nEsta reunião já foi remarcada ${ev.reagendamentos}x antes deste registro.`
    : '';
  const extra = textoProdutosSituacao(ev.produtosSituacao) + textoPrecificacoes(ev.precificacoes);
  return `[${ev.date ?? ''} — ${ev.status ?? ''}]\n${corpo}${motivo}${reagendamentos}${extra}`;
}

// Template fixo do dossiê — decisão do usuário: nada de prosa longa, tópicos
// curtos e escaneáveis (uma reunião de carteira não tem tempo pra ler
// parágrafo). O código monta o cabeçalho (nome/risco/data) fora do prompt —
// só o corpo (as 5 seções) vem do modelo, ver `analisesAutomaticas.cjs`.
const TEMPLATE_DOSSIE = `### Perfil
Segmento, tipo de cliente, contexto que não muda com frequência — 1-2 linhas, sem repetir a cada rodada o que já é sabido.

### Pontos de Atenção
- [DD/MM/AAAA] uma linha no tom de analista explicando o fato pra um colega — cite o CLIENTE FINAL da loja se a fonte mencionar um (ex.: "Widmen zerou a compra de lubrificante em julho — segundo mês seguido, já é padrão, não pontual", não "venda de lubrificante zerada" genérico nem uma fórmula fixa "fato → consequência" repetida em todo item)

### Oportunidades
- [DD/MM/AAAA] mesma lógica: cite o cliente final se houver, escreva como analista, não como registro de log

### Pendências
- [quem] ficou de [o quê] em [DD/MM/AAAA] — status: pendente/entregue

### Próxima pauta
1-2 linhas objetivas do que tratar na próxima reunião e por quê`;

function montarPrompt({ cliente, eventosNovos, dossieAnterior }) {
  const atas = eventosNovos.map(textoEvento).join('\n\n---\n\n') || '(nenhuma reunião nova — só reorganizar o dossiê existente, sem inventar fato novo)';
  const dossie = dossieAnterior?.trim() || '(nenhum dossiê anterior — primeira análise deste cliente)';
  // Cliente com `grupo` é uma LOJA dentro de uma rede (tipoAnalise segmentado),
  // não uma empresa isolada — `empresa` guarda "Grupo - Loja". Deixa isso
  // explícito no prompt pra não sair "a empresa Altese - Recreio + Barra" como
  // se fosse um nome de bloco único, quando é "a loja Recreio + Barra da rede
  // Altese" (que pode ter outras lojas com dossiê próprio).
  const identidade = cliente.grupo
    ? `a loja "${cliente.empresa.replace(`${cliente.grupo} - `, '')}" da rede "${cliente.grupo}" (registrada como "${cliente.empresa}")`
    : `o cliente "${cliente.empresa}"`;
  // Segmento de negócio (Autopeça, Oficina, Indústria...) muda o que é sinal
  // normal — queda de compra de uma peça específica pesa diferente pra uma
  // Oficina (compra o que a demanda do dia pedir) do que pra uma Distribuidora
  // (compra por contrato/volume recorrente). Só entra no prompt quando
  // cadastrado; cliente sem o campo preenchido não deve ter isso inventado.
  const segmento = cliente.local ? ` (segmento: ${cliente.local})` : '';

  /**
   * Serviços contratados e, dentro deles, os que o cliente faz SOZINHO
   * (`servicosIndependentes`). Faltava no prompt inteiro: a análise não sabia
   * quais serviços o cliente tem, então sugeria pauta/reunião pra serviço que
   * o cliente conduz por conta própria — o monitor só acompanha os números.
   * O chat já tinha esse dado (`situacaoCadastro`) e norma pra respeitá-lo; a
   * análise automática, não.
   */
  const lista = (v) => {
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string' && v.trim()) {
      try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(Boolean) : []; } catch { return []; }
    }
    return [];
  };
  const servicos = lista(cliente.servicos);
  const independentes = lista(cliente.servicosIndependentes);
  const dependentes = servicos.filter((sv) => !independentes.includes(sv));
  const blocoServicos = servicos.length === 0 ? '' : `

SERVIÇOS CONTRATADOS: ${servicos.join(', ')}.${independentes.length ? `
SERVIÇOS QUE O CLIENTE CONDUZ SOZINHO (independentes): ${independentes.join(', ')} — para estes, o trabalho da 2D é ACOMPANHAR OS NÚMEROS, não conduzir reunião. Não trate ausência de reunião desses serviços como risco, pendência ou lacuna, e não sugira pauta/reunião pra eles.${dependentes.length ? ` Reunião/cadência vale para: ${dependentes.join(', ')}.` : ' Este cliente não depende de reunião para nenhum serviço contratado — a pauta deve tratar de acompanhamento de indicadores.'}
Se mencionar isso no "Perfil", seja EXPLÍCITO sobre qual serviço é qual — nunca uma frase ambígua tipo "Cliente de X e Y independente" (lê como se X também fosse independente). Prefira algo como "Contrata X (com reunião) e Y (acompanhamento independente, sem reunião)".` : ''}`;

  return `Você é um analista sênior de monitoria da 2D Consultores, avaliando ${identidade}${segmento}. Escreva sempre em português do Brasil, com ortografia e gramática corretas — revise o texto antes de responder, como se fosse publicado num relatório executivo.${cliente.grupo ? ` Trate isso como uma loja específica, não como "a empresa" — se mencionar a rede, deixe claro que é a rede, não esta loja.` : ''}

${blocoServicos}

DOSSIÊ ATUAL DO CLIENTE (memória acumulada de análises anteriores):
${dossie}

REUNIÕES NOVAS DESDE A ÚLTIMA ANÁLISE:
${atas}

Critério de "nivelRisco" (aplique com critério, não some sinais mecanicamente):
- "baixo": sem sinal negativo relevante, ou sinal isolado/pontual sem repetição.
- "medio": sinal negativo real mas ainda de UMA ÚNICA rodada de análise (primeira vez que aparece) — mesmo que afete vários clientes finais da loja — OU um sinal já confirmado em rodadas anteriores mas contido/estável, sem sinal de piora.
- "alto": reservado para quando o MESMO sinal negativo já apareceu confirmado em pelo menos 2 rodadas de análise (ver "DOSSIÊ ATUAL" — ele já tinha esse "Ponto de Atenção" antes?), OU quando o sinal ameaça a relação da loja com a 2D em si (loja evitando reunião, insatisfação explícita com a monitoria, queda agregada e generalizada de faturamento sem qualquer ação em curso) — não apenas queda de compra de alguns clientes finais específicos, por mais numerosos que sejam.
- Quantos clientes finais têm problema NÃO decide o nível sozinho: 4 clientes finais em queda na primeira reunião que isso aparece é "medio", não "alto" — vira "alto" se persistir/piorar na próxima rodada. Pondere também contra "Oportunidades" registradas: clientes finais crescendo ao mesmo tempo que outros caem costuma ser rotatividade normal de carteira da loja, não crise.

Responda em JSON com exatamente estes campos:
{
  "nivelRisco": "baixo" | "medio" | "alto",
  "resumo": "2-3 frases em prosa: contexto do cliente e o que mudou nas reuniões novas — não uma lista",
  "fatores": ["no máximo 4 itens, só os mais relevantes pro nível de risco — cada item cita um fato concreto observado (data/reunião) e por que ele pesa; nunca uma afirmação vaga sem evidência"],
  "sugestaoProximaPauta": "1-2 frases objetivas: o que tratar na próxima reunião e por quê",
  "dossieAtualizado": "o CORPO do dossiê em markdown, seguindo EXATAMENTE este template (mesmos títulos de seção, nesta ordem — não adicione nem remova seção, não escreva um título de cabeçalho com o nome do cliente, isso já é adicionado por fora):\\n\\n${TEMPLATE_DOSSIE}"
}

Regras:
- Não invente informação que não está nas reuniões ou no dossiê anterior; se um dado não aparece, não afirme sobre ele.
- Se a ata/registro mencionar QUAL cliente final (comprador da loja, não a rede) está associado a um fato — ex.: "Widmen: venda zerada", uma linha de "Orientações" no formato "Cliente / Produto: situação" — preserve esse nome no "Pontos de Atenção"/"Oportunidades" e em "fatores". Generalizar "vendas zeraram" sem dizer de qual cliente perde informação que já estava disponível — não faça isso.
- "fatores" só pode ser lista vazia quando "nivelRisco" é "baixo" — não force fator artificial nesse caso. Com "medio" ou "alto", "fatores" é OBRIGATÓRIO (1 a 4 itens): é o campo que a ficha do cliente usa pra explicar POR QUE o risco é esse, e vazio ali deixa o usuário sem resposta. Os fatores devem ser os mesmos fatos que você registrou em "Pontos de Atenção", não uma lista nova.
- Reunião marcada como "Motivo:" (cancelamento) ou "já foi remarcada Nx" (ver texto de cada reunião abaixo) é sinal de desengajamento, não detalhe operacional — trate 2+ ocorrências disso no MESMO cliente (nesta rodada ou já registradas no dossiê anterior) como padrão, cite o motivo concreto em "Pontos de Atenção" (ex.: "reunião já foi cancelada 2x — motivo alegado: agenda do responsável"), e pese isso no "nivelRisco" como faria com queda de venda repetida. Uma única ocorrência isolada, sem repetição, não sustenta "alto" sozinha. IMPORTANTE: antes de chamar de "padrão consolidado"/"estrutural", confira se houve reunião normal (concluída sem cancelamento/remarcação) ENTRE as ocorrências — se houve, isso é contra-evidência de que não é estrutural, e a frase deve refletir isso ("cancelamento em [data], mas reunião seguinte em [data] ocorreu normalmente — desengajamento não é constante") em vez de ignorar o intervalo bom pra forçar uma narrativa de crise contínua.
- Cada bullet é 1 linha, direto ao ponto — nada de parágrafo dentro de bullet, mas também nada de fórmula mecânica repetida ("fato → consequência" em todo item soa como log, não como análise). Varie a construção da frase como um analista de verdade escreveria, mantendo evidência (data/fonte) e clareza do porquê importa. Seção sem conteúdo real fica com "— nenhum registro" em vez de bullet inventado.
- Se VÁRIAS reuniões mostram o MESMO padrão (ex.: 3 reuniões seguidas sem pauta/decisão), isso é UM fator só, citando as datas juntas ("28/05, 02/07 e 31/07: reuniões sem pauta nem decisão registrada") — não um fator por reunião. Listar cada ocorrência separada quando o padrão é repetitivo é log, não análise, e é o que mais infla "fatores" além do limite de 4.
- "dossieAtualizado" tem um limite de espaço: no máximo ${DOSSIE_MAX_CHARS} caracteres no total. Isso significa CONSOLIDAR a cada rodada, não empilhar: remova pendência já entregue, remova ponto de atenção já resolvido, mantenha só o que ainda importa para decisão futura. Nunca cole a ata da reunião nova no dossiê — extraia dela só o que é memória duradoura.
- "Pontos de Atenção" e "Oportunidades" têm no máximo 3 bullets CADA, "Pendências" no máximo 3 — se houver mais do que isso, priorize o mais recente/relevante e descarte o resto (mesmo que fosse um ponto válido isolado). Reuniões diferentes com o MESMO padrão viram um bullet só, citando as datas juntas — nunca um bullet por reunião. Cada bullet é UMA frase curta, não um parágrafo com várias orações separadas por ";" — corte pro fato que mais pesa, não tente caber tudo.`;
}

/**
 * Gera a análise de IA de um cliente a partir das reuniões novas desde a
 * última rodada + o dossiê anterior (memória acumulada). Não acessa
 * repositório nem sistema de arquivos — recebe os dados já montados e
 * devolve o resultado estruturado, para ser testável sem Ollama de verdade.
 */
// `ollama` mantido como nome do parametro (injecao usada em teste); o default
// e o provedor ATIVO, que pode ser o Ollama ou o Claude Code CLI.
/**
 * Corta em `max` chars sem quebrar no meio de uma palavra/frase. Antes era
 * `.slice(0, max)` puro — em produção isso cortou dossiê real assim: "R$102
 * mil vs. R" e "...status: pendente par" (de "para"). Um corte que quebra a
 * frase no meio lê como texto quebrado, pior do que só passar do teto.
 *
 * Tenta, nesta ordem, manter pelo menos 60% do teto (não voltar tanto que o
 * corte vire outro problema): fim de frase (". "/"! "/"? " ou fim de linha),
 * senão quebra de linha, senão fim de palavra (espaço). Sem nenhum desses
 * dentro da margem, corta no limite mesmo (último recurso).
 */
function truncarSemQuebrarFrase(texto, max) {
  if (texto.length <= max) return texto.trim();
  const fatia = texto.slice(0, max);
  const minimo = Math.floor(max * 0.6);

  const fimDeFrase = Math.max(fatia.lastIndexOf('. '), fatia.lastIndexOf('! '), fatia.lastIndexOf('? '), fatia.lastIndexOf('.\n'));
  if (fimDeFrase >= minimo) return fatia.slice(0, fimDeFrase + 1).trim();

  const quebraLinha = fatia.lastIndexOf('\n');
  if (quebraLinha >= minimo) return fatia.slice(0, quebraLinha).trim();

  const fimDePalavra = fatia.lastIndexOf(' ');
  if (fimDePalavra >= minimo) return fatia.slice(0, fimDePalavra).trim();

  return fatia.trim();
}

/**
 * Corta o corpo pro teto SEM sacrificar a seção "Próxima pauta" inteira.
 * `truncarSemQuebrarFrase` sozinho resolve o corte no meio da palavra, mas
 * criou um problema novo em produção: quando o corte cai ANTES do título
 * "### Próxima pauta", a seção inteira desaparece do dossiê — o template
 * fica incompleto, e `sugestaoProximaPauta` (extraída dessa seção pra
 * `AnalisesIA`, o que a ficha do cliente mostra) fica vazia mesmo o modelo
 * tendo escrito uma pauta real.
 *
 * Reserva a "Próxima pauta" (cabe inteira quase sempre — é 1-2 frases) e
 * corta só o resto pra caber no que sobra.
 */
function truncarPreservandoProximaPauta(texto, max) {
  const marcador = /###\s*Pr[óo]xima pauta/i;
  const m = marcador.exec(texto);
  if (!m) return truncarSemQuebrarFrase(texto, max); // template inesperado — corte simples mesmo

  const antes = texto.slice(0, m.index);
  // A própria "Próxima pauta" também passa pelo corte de frase, caso ela
  // sozinha seja anormalmente longa (nunca deveria, mas não confia sem checar).
  const pauta = truncarSemQuebrarFrase(texto.slice(m.index), Math.max(200, Math.floor(max * 0.25)));
  const orcamentoAntes = Math.max(0, max - pauta.length - 1);
  const antesCortado = truncarSemQuebrarFrase(antes, orcamentoAntes);
  return `${antesCortado}\n\n${pauta}`;
}

async function gerarAnaliseIA({ cliente, eventosNovos, dossieAnterior, ollama = clienteLLM(), repo }) {
  const prompt = montarPrompt({ cliente, eventosNovos, dossieAnterior });
  // Medição: a análise automática (boot + cron semanal + reanálise sob pedido)
  // é provavelmente o maior consumidor de tokens do sistema e não aparecia no
  // painel de consumo — só o chat era medido. `repo` ausente (testes) só não mede.
  const uso = {};
  const t0 = Date.now();
  const saida = await ollama.gerarJSON(prompt, { coletarUso: uso });
  if (repo) {
    const crypto = require('crypto');
    const { registrarUso } = require('./uso.cjs');
    const { provedorAtivo } = require('./provider.cjs');
    registrarUso(repo, {
      origem: 'analise', provedor: provedorAtivo(), modelo: uso.modelo, turnId: crypto.randomUUID(),
      inputTokens: uso.inputTokens, outputTokens: uso.outputTokens,
      cacheCreationTokens: uso.cacheCreationTokens, cacheReadTokens: uso.cacheReadTokens,
      custoUsd: uso.custoUsd ?? 0, duracaoMs: Date.now() - t0,
      pergunta: `análise automática — ${cliente.empresa}`, resposta: uso.resposta ?? '',
    });
  }

  const nivelRisco = NIVEIS_RISCO.includes(saida.nivelRisco) ? saida.nivelRisco : 'baixo';
  let fatores = Array.isArray(saida.fatores) ? saida.fatores.filter((f) => typeof f === 'string') : [];

  // Rede de segurança: risco médio/alto SEM fatores deixa a ficha do cliente
  // sem justificativa nenhuma — e é justamente o que o agente cita quando
  // perguntam "por que o risco é médio?". O modelo já devolveu isso na
  // prática (Altese, risco médio com 5 pontos de atenção e `fatores: []`),
  // então não basta pedir no prompt. Aqui os bullets de "Pontos de Atenção"
  // do dossiê que ele mesmo acabou de escrever viram os fatores — mesmo
  // conteúdo, sem chamada extra ao modelo.
  if (fatores.length === 0 && nivelRisco !== 'baixo') {
    const corpo = typeof saida.dossieAtualizado === 'string' ? saida.dossieAtualizado : '';
    const secao = /###\s*Pontos de Aten[çc][ãa]o\s*([\s\S]*?)(?=\n###|$)/i.exec(corpo);
    const bullets = (secao?.[1] ?? '')
      .split('\n')
      .map((l) => l.replace(/^\s*[-–—*]\s*/, '').trim())
      .filter((l) => l && !/^—?\s*nenhum registro/i.test(l))
      .slice(0, 4);
    if (bullets.length > 0) {
      console.warn(`gerarAnaliseIA: "${cliente.empresa}" veio com risco "${nivelRisco}" e fatores vazios — derivando de "Pontos de Atenção".`);
      fatores = bullets;
    }
  }

  let dossieAtualizado = typeof saida.dossieAtualizado === 'string' && saida.dossieAtualizado.trim()
    ? saida.dossieAtualizado
    : (dossieAnterior || '');

  // Rede de segurança: caso real (Maniacar, 03/09) — o modelo devolveu o
  // corpo BEM abaixo do teto (então não foi corte) mas simplesmente pulou a
  // seção "### Próxima pauta" ao escrever. `sugestaoProximaPauta` é um campo
  // SEPARADO do mesmo JSON (não depende do modelo repetir dentro do corpo),
  // então dá pra completar sem chamada nova ao modelo.
  const sugestaoBruta = typeof saida.sugestaoProximaPauta === 'string' ? saida.sugestaoProximaPauta.trim() : '';
  if (!/###\s*Pr[óo]xima pauta/i.test(dossieAtualizado) && sugestaoBruta) {
    console.warn(`gerarAnaliseIA: dossiê de "${cliente.empresa}" veio sem a seção "Próxima pauta" — completando com o campo sugestaoProximaPauta.`);
    dossieAtualizado = `${dossieAtualizado.trimEnd()}\n\n### Próxima pauta\n${sugestaoBruta}`;
  }

  if (dossieAtualizado.length > DOSSIE_MAX_CHARS) {
    console.warn(`gerarAnaliseIA: dossiê de "${cliente.empresa}" excedeu ${DOSSIE_MAX_CHARS} caracteres (${dossieAtualizado.length}) mesmo com instrução de concisão — truncando.`);
    dossieAtualizado = truncarPreservandoProximaPauta(dossieAtualizado, DOSSIE_MAX_CHARS);
  }

  return {
    nivelRisco,
    resumo: typeof saida.resumo === 'string' ? saida.resumo : '',
    fatores,
    sugestaoProximaPauta: typeof saida.sugestaoProximaPauta === 'string' ? saida.sugestaoProximaPauta : '',
    dossieAtualizado,
  };
}

module.exports = {
  gerarAnaliseIA, montarPrompt, textoEvento, TEMPLATE_DOSSIE, DOSSIE_MAX_CHARS,
  truncarSemQuebrarFrase, truncarPreservandoProximaPauta,
};
