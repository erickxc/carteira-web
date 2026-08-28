const { buscarVencendo, buscarAlertasSemAcompanhamento, isClienteAtivo } = require('../dominio/cadenciaServico.cjs');
const { lerCadencias } = require('./tools.cjs');

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
      pergunta: `A ${c.empresa} ainda não tem análise de risco. Me mostra o histórico dela e o que dá pra concluir.`,
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

module.exports = { gerarAlertas };
