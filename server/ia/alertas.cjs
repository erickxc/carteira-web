const { buscarVencendo, buscarAlertasSemAcompanhamento, isClienteAtivo } = require('../dominio/cadenciaServico.cjs');
const { lerCadencias } = require('./tools.cjs');
const { lerDossieCliente } = require('./analisesAutomaticas.cjs');

/**
 * Alertas conversáveis do monitorIA.
 *
 * O problema que isto resolve: as análises automáticas (`AnalisesIA`) já
 * rodavam e ninguém olhava — viravam relatório que ninguém lê. E as regras do
 * agente (`normas.cjs`) descrevem exatamente os casos que importam ("risco alto
 * sem nada agendado é o pior caso pra passar batido"), mas só disparavam se
 * alguém por acaso perguntasse sobre aquele cliente.
 *
 * Aqui esses mesmos casos viram cartão na tela, cada um com uma `pergunta`
 * pronta — o card não é aviso passivo, é a porta de entrada da conversa. A
 * `pergunta` é a frase LITERAL que vai pro chat, não um rótulo que o usuário
 * precise traduzir (mesma decisão das sugestões do estado vazio).
 *
 * Só leitura: nada aqui grava. E nada aqui CALCULA métrica nova — reusa as
 * funções de domínio que o dashboard e as ferramentas já usam, senão a tela
 * passaria a ter uma segunda versão da verdade sobre cadência.
 */

const SEVERIDADE = { alta: 3, media: 2, baixa: 1 };

/**
 * Sinais de deterioração que aparecem em texto livre — bullets de "Pontos de
 * Atenção" no dossiê, ou o resumo da análise. Vocabulário observado nos
 * dossiês reais da carteira (cancelamento, não-comparecimento, silêncio do
 * cliente), não uma lista teórica de "palavras de risco".
 */
const RE_SINAL_NEGATIVO = /cancel|reagend|não compareceu|nao compareceu|sem retorno|sem resposta|não respondeu|nao respondeu|adiou|insatisf|atraso|queda|caiu|zerou|perda|afastamento/i;

/** Bullets da seção "### Pontos de Atenção" de um dossiê em markdown. */
function pontosDeAtencao(dossie) {
  const bloco = dossie.match(/###\s*Pontos de Atenção([\s\S]*?)(?:\n###|$)/i);
  if (!bloco) return [];
  return bloco[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-'));
}

/** Eventos futuros por cliente — "tem alguma reunião marcada daqui pra frente?" */
function clientesComEventoFuturo(agenda, agora) {
  const hoje = agora.toISOString().slice(0, 10);
  const comFuturo = new Set();
  for (const ev of agenda) {
    if (!ev.date || String(ev.date).slice(0, 10) < hoje) continue;
    // Cancelado/reagendado não conta como compromisso de pé — mesma
    // classificação por regex do resto do app (`EventoStatus` é texto livre,
    // configurável em Categorias).
    if (/cancel|reagend/i.test(ev.status || '')) continue;
    comFuturo.add(String(ev.clientId));
  }
  return comFuturo;
}

function gerarAlertas(repo, { agora = new Date(), max = 8 } = {}) {
  const clientes = repo.get('Clientes');
  const agenda = repo.get('Agenda');
  const acoes = repo.get('Acoes');
  const analises = repo.get('AnalisesIA');

  const ativos = clientes.filter(isClienteAtivo);
  const porId = new Map(clientes.map((c) => [String(c.id), c]));
  const analisePorCliente = new Map(analises.map((a) => [String(a.clientId), a]));
  const comFuturo = clientesComEventoFuturo(agenda, agora);
  const alertas = [];

  // 1. Risco alto sem nada agendado — o gatilho que as normas chamam de "o
  // pior caso pra passar batido".
  for (const c of ativos) {
    const analise = analisePorCliente.get(String(c.id));
    if (analise?.nivelRisco !== 'alto' || comFuturo.has(String(c.id))) continue;
    alertas.push({
      id: `risco-sem-pauta:${c.id}`,
      tipo: 'risco_sem_pauta',
      severidade: 'alta',
      titulo: `${c.empresa}: risco alto e nenhuma reunião marcada`,
      detalhe: analise.resumo || 'Análise de risco classificou como alto.',
      clientId: c.id,
      cliente: c.empresa,
      monitor: c.monitor || null,
      pergunta: `A ${c.empresa} está em risco alto e sem reunião marcada. Me explica o que levou a esse risco e sugere uma pauta e uma data.`,
    });
  }

  // 2. Sem contato há muito tempo (>= 30 dias ou nunca) — a função de domínio
  // já ordena pelo pior e corta em 6.
  for (const a of buscarAlertasSemAcompanhamento(clientes, agenda, acoes, agora)) {
    const c = porId.get(String(a.id));
    if (!c) continue;
    const quanto = a.diasSemContato === null ? 'nunca teve contato registrado' : `está há ${a.diasSemContato} dias sem contato`;
    alertas.push({
      id: `sem-contato:${a.id}`,
      tipo: 'sem_contato',
      // "Nunca teve contato" é pior que 30 dias sem contato: é cliente que
      // entrou na carteira e ninguém encostou.
      severidade: a.diasSemContato === null || a.diasSemContato >= 60 ? 'alta' : 'media',
      titulo: `${a.empresa}: ${quanto}`,
      detalhe: a.ultimoContato ? `Último contato em ${String(a.ultimoContato).slice(0, 10)}.` : 'Nenhuma interação registrada desde a entrada na carteira.',
      clientId: a.id,
      cliente: a.empresa,
      monitor: c.monitor || null,
      pergunta: `A ${a.empresa} ${quanto}. O que aconteceu com esse cliente e como eu retomo?`,
    });
  }

  // 3. Cadência vencendo nos próximos dias.
  const cadencias = lerCadencias(repo);
  for (const item of buscarVencendo(clientes, agenda, cadencias, agora).itens) {
    if (!item.id) continue;
    alertas.push({
      id: `vencendo:${item.id}:${item.servico}`,
      tipo: 'vencendo',
      severidade: item.diasParaVencer <= 2 ? 'media' : 'baixa',
      titulo: `${item.empresa}: ${item.servico} vence em ${item.diasParaVencer} dia(s)`,
      detalhe: `Cadência de ${item.servico} chega ao limite em ${item.diasParaVencer} dia(s).`,
      clientId: item.id,
      cliente: item.empresa,
      monitor: porId.get(String(item.id))?.monitor || null,
      pergunta: `A cadência de ${item.servico} da ${item.empresa} vence em ${item.diasParaVencer} dia(s). Me sugere quando encaixar e qual pauta levar.`,
    });
  }

  // 4. Cliente ativo sem análise nenhuma — o agente não tem contexto pra
  // falar dele, e é melhor a tela dizer isso do que ele descobrir no meio de
  // uma resposta.
  for (const c of ativos) {
    if (analisePorCliente.has(String(c.id))) continue;
    alertas.push({
      id: `sem-analise:${c.id}`,
      tipo: 'sem_analise',
      severidade: 'baixa',
      titulo: `${c.empresa}: sem análise de risco`,
      detalhe: 'Nenhuma reunião com ata foi analisada ainda — o dossiê está vazio.',
      clientId: c.id,
      cliente: c.empresa,
      monitor: c.monitor || null,
      pergunta: `A ${c.empresa} ainda não tem análise de risco. Me mostra o histórico dela e o que dá pra concluir.`,
    });
  }

  // 5. Dossiê contradiz a classificação de risco: 2+ sinais negativos nos
  // Pontos de Atenção, mas nível de risco continua baixo. Ninguém vê isso
  // olhando cliente por cliente — o dossiê é lido em prosa, ninguém CONTA
  // quantos "cancelou"/"não compareceu" ele acumulou.
  for (const c of ativos) {
    const analise = analisePorCliente.get(String(c.id));
    if (!analise || analise.nivelRisco !== 'baixo') continue;
    const negativos = pontosDeAtencao(lerDossieCliente(c.id)).filter((l) => RE_SINAL_NEGATIVO.test(l));
    if (negativos.length < 2) continue;
    alertas.push({
      id: `contradicao:${c.id}`,
      tipo: 'contradicao_dossie',
      severidade: 'media',
      titulo: `${c.empresa}: dossiê acumula ${negativos.length} sinais negativos, mas risco está "baixo"`,
      detalhe: negativos[negativos.length - 1].replace(/^-\s*/, ''),
      clientId: c.id,
      cliente: c.empresa,
      monitor: c.monitor || null,
      pergunta: `O dossiê da ${c.empresa} tem ${negativos.length} pontos de atenção negativos, mas o risco está classificado como baixo. Analisa esses pontos comigo e me diz se a classificação ainda faz sentido.`,
    });
  }

  // 6. Pauta recomendada que não virou ação: a última análise sugeriu uma
  // próxima pauta e não há reunião futura marcada nem reunião mais nova com
  // ata desde então. Mede se a recomendação da IA é só relatório sem leitor.
  for (const c of ativos) {
    const analise = analisePorCliente.get(String(c.id));
    const pauta = String(analise?.sugestaoProximaPauta ?? '').trim();
    if (!pauta || comFuturo.has(String(c.id))) continue;
    const eventosDepois = agenda.filter((e) => String(e.clientId) === String(c.id)
      && e.date && analise.geradoEm && String(e.date) > String(analise.geradoEm).slice(0, 10)
      && String(e.ata ?? '').trim());
    if (eventosDepois.length > 0) continue;
    alertas.push({
      id: `pauta-parada:${c.id}`,
      tipo: 'pauta_parada',
      severidade: 'baixa',
      titulo: `${c.empresa}: pauta recomendada segue sem reunião marcada`,
      detalhe: pauta,
      clientId: c.id,
      cliente: c.empresa,
      monitor: c.monitor || null,
      pergunta: `A última análise da ${c.empresa} recomendou esta pauta: "${pauta}". Ainda faz sentido? Me ajuda a marcar isso.`,
    });
  }

  // Um cliente pode disparar mais de um alerta (risco alto E sem contato). Fica
  // só o mais grave: dois cartões do mesmo cliente competindo pela atenção
  // fazem a lista parecer maior do que o problema é.
  const porCliente = new Map();
  for (const a of alertas) {
    const atual = porCliente.get(String(a.clientId));
    if (!atual || SEVERIDADE[a.severidade] > SEVERIDADE[atual.severidade]) porCliente.set(String(a.clientId), a);
  }

  return [...porCliente.values()]
    .sort((a, b) => SEVERIDADE[b.severidade] - SEVERIDADE[a.severidade] || a.cliente.localeCompare(b.cliente))
    .slice(0, max);
}

/**
 * Padrões da CARTEIRA — não de um cliente. Conta tema recorrente nos "Pontos
 * de Atenção" de todos os dossiês; N+ ocorrências vira um card só, sobre
 * processo. Separado de `gerarAlertas` (que é por-cliente) porque a pergunta,
 * o agrupamento e o "clientId" não fazem sentido do mesmo jeito aqui — forçar
 * os dois na mesma função ia acoplar duas formas de alerta bem diferentes.
 */
const TEMAS_PROCESSO = [
  { chave: 'sem_ata', regex: /sem ata/i, rotulo: 'reunião sem ata de pauta' },
  { chave: 'cancelamento', regex: /cancel/i, rotulo: 'cancelamento de reunião' },
  { chave: 'reagendamento', regex: /reagend/i, rotulo: 'reagendamento' },
];
const MIN_OCORRENCIAS_PADRAO = 5;

function gerarPadroesCarteira(repo, { max = 3 } = {}) {
  const clientes = repo.get('Clientes').filter(isClienteAtivo);
  const contagem = TEMAS_PROCESSO.map((t) => ({ ...t, clientes: new Set() }));

  for (const c of clientes) {
    for (const linha of pontosDeAtencao(lerDossieCliente(c.id))) {
      for (const tema of contagem) if (tema.regex.test(linha)) tema.clientes.add(c.empresa);
    }
  }

  return contagem
    .filter((t) => t.clientes.size >= MIN_OCORRENCIAS_PADRAO)
    .sort((a, b) => b.clientes.size - a.clientes.size)
    .slice(0, max)
    .map((t) => ({
      id: `padrao:${t.chave}`,
      tipo: 'padrao_carteira',
      severidade: t.clientes.size >= MIN_OCORRENCIAS_PADRAO * 2 ? 'media' : 'baixa',
      titulo: `${t.rotulo}: ${t.clientes.size} clientes com esse registro`,
      detalhe: `Aparece nos dossiês de: ${[...t.clientes].slice(0, 5).join(', ')}${t.clientes.size > 5 ? '...' : ''}.`,
      clientId: '',
      cliente: '',
      monitor: null,
      pergunta: `${t.clientes.size} clientes têm "${t.rotulo}" registrado no dossiê. Isso é padrão de cliente ou sintoma de processo (ex.: forma como a reunião é conduzida)? Analisa comigo.`,
    }));
}

module.exports = { gerarAlertas, gerarPadroesCarteira };
