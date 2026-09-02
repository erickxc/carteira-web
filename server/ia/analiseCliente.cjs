const { clienteLLM } = require('./provider.cjs');
const { listaJSON } = require('../dominio/cadenciaServico.cjs');

const NIVEIS_RISCO = ['baixo', 'medio', 'alto'];

// Teto técnico do dossiê: o prompt já instrui o modelo a manter o texto
// enxuto (é o controle real — sem isso, cada rodada tende a empilhar
// histórico em vez de consolidar). Isso aqui é só rede de segurança: se o
// modelo ignorar a instrução, corta e loga em vez de deixar o arquivo crescer
// sem limite a cada reunião.
const DOSSIE_MAX_CHARS = 3000;

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
  return `Você é um analista sênior de monitoria da 2D Consultores, avaliando ${identidade}${segmento}. Escreva sempre em português do Brasil, com ortografia e gramática corretas — revise o texto antes de responder, como se fosse publicado num relatório executivo.${cliente.grupo ? ` Trate isso como uma loja específica, não como "a empresa" — se mencionar a rede, deixe claro que é a rede, não esta loja.` : ''}

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
- Se não houver sinal de risco, "nivelRisco" é "baixo" e "fatores" pode ser uma lista vazia — não force um fator artificial pra preencher.
- Reunião marcada como "Motivo:" (cancelamento) ou "já foi remarcada Nx" (ver texto de cada reunião abaixo) é sinal de desengajamento, não detalhe operacional — trate 2+ ocorrências disso no MESMO cliente (nesta rodada ou já registradas no dossiê anterior) como padrão, cite o motivo concreto em "Pontos de Atenção" (ex.: "reunião já foi cancelada 2x — motivo alegado: agenda do responsável"), e pese isso no "nivelRisco" como faria com queda de venda repetida. Uma única ocorrência isolada, sem repetição, não sustenta "alto" sozinha.
- Cada bullet é 1 linha, direto ao ponto — nada de parágrafo dentro de bullet, mas também nada de fórmula mecânica repetida ("fato → consequência" em todo item soa como log, não como análise). Varie a construção da frase como um analista de verdade escreveria, mantendo evidência (data/fonte) e clareza do porquê importa. Seção sem conteúdo real fica com "— nenhum registro" em vez de bullet inventado.
- Se VÁRIAS reuniões mostram o MESMO padrão (ex.: 3 reuniões seguidas sem pauta/decisão), isso é UM fator só, citando as datas juntas ("28/05, 02/07 e 31/07: reuniões sem pauta nem decisão registrada") — não um fator por reunião. Listar cada ocorrência separada quando o padrão é repetitivo é log, não análise, e é o que mais infla "fatores" além do limite de 4.
- "dossieAtualizado" tem um limite de espaço: no máximo ${DOSSIE_MAX_CHARS} caracteres no total. Isso significa CONSOLIDAR a cada rodada, não empilhar: remova pendência já entregue, remova ponto de atenção já resolvido, mantenha só o que ainda importa para decisão futura. Nunca cole a ata da reunião nova no dossiê — extraia dela só o que é memória duradoura.`;
}

/**
 * Gera a análise de IA de um cliente a partir das reuniões novas desde a
 * última rodada + o dossiê anterior (memória acumulada). Não acessa
 * repositório nem sistema de arquivos — recebe os dados já montados e
 * devolve o resultado estruturado, para ser testável sem Ollama de verdade.
 */
// `ollama` mantido como nome do parametro (injecao usada em teste); o default
// e o provedor ATIVO, que pode ser o Ollama ou o Claude Code CLI.
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
  const fatores = Array.isArray(saida.fatores) ? saida.fatores.filter((f) => typeof f === 'string') : [];

  let dossieAtualizado = typeof saida.dossieAtualizado === 'string' && saida.dossieAtualizado.trim()
    ? saida.dossieAtualizado
    : (dossieAnterior || '');
  if (dossieAtualizado.length > DOSSIE_MAX_CHARS) {
    console.warn(`gerarAnaliseIA: dossiê de "${cliente.empresa}" excedeu ${DOSSIE_MAX_CHARS} caracteres (${dossieAtualizado.length}) mesmo com instrução de concisão — truncando.`);
    dossieAtualizado = dossieAtualizado.slice(0, DOSSIE_MAX_CHARS).trim();
  }

  return {
    nivelRisco,
    resumo: typeof saida.resumo === 'string' ? saida.resumo : '',
    fatores,
    sugestaoProximaPauta: typeof saida.sugestaoProximaPauta === 'string' ? saida.sugestaoProximaPauta : '',
    dossieAtualizado,
  };
}

module.exports = { gerarAnaliseIA, montarPrompt, textoEvento, TEMPLATE_DOSSIE, DOSSIE_MAX_CHARS };
