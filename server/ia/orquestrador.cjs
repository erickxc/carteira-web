const crypto = require('crypto');
const { repoPlanilha } = require('../dominio/repo.cjs');
const ollamaClient = require('./ollamaClient.cjs');
const { FERRAMENTAS } = require('./tools.cjs');
const { MAX_ITERACOES_FERRAMENTA } = require('./normas.cjs');
const { registrarUso } = require('./uso.cjs');
const { isClient } = require('../modo.cjs');

const FERRAMENTAS_POR_NOME = new Map(FERRAMENTAS.map((f) => [f.name, f]));

const TOOLS_SCHEMA = FERRAMENTAS.map((f) => ({
  type: 'function',
  function: { name: f.name, description: f.description, parameters: f.parameters },
}));

/**
 * Rede de segurança: modelo do tier gratuito às vezes "inventa" uma chamada
 * de ferramenta como TEXTO em `content` (ex.: `{"name": "buscar_x", ...}`)
 * em vez de usar o mecanismo real de tool-calling da API — sem isso, esse
 * JSON cru vazava direto pro usuário como se fosse a resposta final (bug
 * real, visto em produção). Detecta o padrão e trata como uma tool_call de
 * verdade — se o nome existir, executa normalmente; se não existir, cai no
 * mesmo erro "ferramenta não existe" que uma tool_call estruturada teria,
 * em vez de aparecer como texto pro usuário.
 */
function extrairPseudoToolCall(texto) {
  if (!texto) return null;
  const m = texto.match(/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:parameters|arguments)"\s*:\s*(\{[\s\S]*?\})\s*\}/);
  if (!m) return null;
  try {
    return { function: { name: m[1], arguments: JSON.parse(m[2]) } };
  } catch {
    return null;
  }
}

/**
 * Legenda humana do que a ferramenta está fazendo — usada no frontend tanto
 * pro progresso ao vivo do chat (gerúndio, "Verificando...") quanto pro log
 * de auditoria. Monta aqui (backend, que tem `argumentos`/`resultado` de
 * verdade) em vez de deixar o frontend adivinhar a partir só do nome da
 * ferramenta — assim a legenda carrega contexto real (qual cliente, qual
 * filtro), não um rótulo genérico igual pra toda chamada da mesma ferramenta.
 */
function descreverAcao(ferramenta, argumentos, resultado) {
  const nomeCliente = resultado?.empresa || resultado?.loja;
  switch (ferramenta) {
    case 'buscar_clientes': {
      const filtros = [
        argumentos.grupo && `rede "${argumentos.grupo}"`,
        argumentos.nivelRisco && `risco ${argumentos.nivelRisco}`,
        argumentos.servico && `serviço ${argumentos.servico}`,
        argumentos.status && `status ${argumentos.status}`,
      ].filter(Boolean);
      return filtros.length ? `Buscando clientes (${filtros.join(', ')})...` : 'Buscando clientes na carteira...';
    }
    case 'buscar_dossie_cliente':
      return `Consultando dossiê${nomeCliente ? ` de ${nomeCliente}` : ''}...`;
    case 'buscar_registros_produto':
      return `Verificando registros de produto${nomeCliente ? ` de ${nomeCliente}` : ''}...`;
    case 'corrigir_dossie_cliente':
      return `Corrigindo dossiê${nomeCliente ? ` de ${nomeCliente}` : ''}...`;
    case 'criar_evento':
      return `Criando evento${argumentos.subject ? `: ${argumentos.subject}` : ''}...`;
    case 'criar_lembrete':
      return `Criando lembrete${argumentos.title ? `: ${argumentos.title}` : ''}...`;
    case 'buscar_memoria':
      return 'Consultando as regras do processo...';
    case 'registrar_memoria':
      return `Guardando regra${argumentos.texto ? `: "${String(argumentos.texto).slice(0, 60)}"` : ''}...`;
    case 'remover_memoria':
      return `Apagando regra${resultado?.removido ? `: "${String(resultado.removido).slice(0, 60)}"` : ''}...`;
    case 'gerar_relatorio_executivo':
      return 'Calculando relatório executivo da carteira...';

    // Métricas da carteira (as mesmas da Visão Geral).
    case 'buscar_fila_priorizacao':
      return argumentos.servico ? `Calculando aderência de ${argumentos.servico}...` : 'Calculando aderência da carteira...';
    case 'buscar_vencendo':
      return 'Verificando quem vence nos próximos dias...';
    case 'buscar_cobertura':
      return 'Calculando cobertura de atendimento...';
    case 'buscar_cobertura_servicos':
      return 'Calculando atendimento por serviço contratado...';
    case 'buscar_alertas_acompanhamento':
      return 'Verificando quem está sem acompanhamento...';
    case 'buscar_config_cadencias':
      return 'Consultando as regras de cadência...';

    // Contexto de cliente.
    case 'buscar_historico_eventos':
      return `Lendo histórico de eventos${nomeCliente ? ` de ${nomeCliente}` : ''}...`;
    case 'buscar_lembretes_cliente':
      return `Verificando lembretes${nomeCliente ? ` de ${nomeCliente}` : ''}...`;
    case 'buscar_tarefas_cliente':
      return `Verificando tarefas internas${nomeCliente ? ` de ${nomeCliente}` : ''}...`;
    case 'buscar_contatos_cliente':
      return `Consultando contatos${nomeCliente ? ` de ${nomeCliente}` : ''}...`;
    case 'buscar_cobertura_contatos':
      return `Checando responsável por serviço${nomeCliente ? ` em ${nomeCliente}` : ''}...`;

    // Busca e agendamento.
    case 'buscar_contatos': {
      const f = [argumentos.nome && `"${argumentos.nome}"`, argumentos.cargo && `cargo "${argumentos.cargo}"`, argumentos.servico].filter(Boolean);
      return f.length ? `Buscando contatos (${f.join(', ')})...` : 'Buscando contatos na carteira...';
    }
    case 'sugerir_encaixes_agenda':
      return 'Montando sugestões de encaixe na agenda...';
    case 'buscar_agenda_ceo':
      return 'Consultando a agenda do Marco...';
    case 'verificar_disponibilidade':
      return `Checando disponibilidade${argumentos.date ? ` em ${argumentos.date}` : ''}...`;

    default:
      return `Chamando ${ferramenta}...`;
  }
}

/**
 * Grava o log de auditoria. Máquina em `APP_MODE=client` (as 3 remotas) não
 * tem escrita direta no SQLite pra NENHUMA sheet fora da fila (Etapa 3+, ver
 * `server/fila/entidades.cjs`) — e `AcoesIA` não está nela. Sem esta guarda,
 * TODA chamada de ferramenta (ou seja, toda pergunta ao monitorIA que usa
 * qualquer dado da carteira) derrubava o processo com "escrita direta no
 * SQLite bloqueada" nas máquinas cliente — bug real, achado em produção.
 * Até `AcoesIA` entrar na fila de verdade, auditoria de IA só persiste na
 * máquina servidora (Karol-2D); nas remotas, silenciosamente não grava — a
 * resposta ao usuário não pode depender disso.
 */
function registrarAcao(repo, { ferramenta, clientId, argumentos, resultado, origem, turnId, monitor }) {
  if (isClient) return;
  const acoes = repo.get('AcoesIA');
  acoes.push({
    id: crypto.randomUUID(),
    ferramenta,
    clientId: clientId || '',
    argumentos,
    resultado,
    descricao: descreverAcao(ferramenta, argumentos, resultado),
    origem,
    criadoEm: new Date().toISOString(),
    // Correlaciona com a pergunta que disparou a chamada (server/ia/uso.cjs)
    // — vazio em contexto sem turno (chamada avulsa, MCP externo sem token).
    turnId: turnId || '',
    monitor: monitor || '',
  });
  repo.save('AcoesIA', acoes);
}

/**
 * Loop de tool-calling: manda as mensagens pro Ollama junto do schema das
 * ferramentas disponíveis; se ele pedir uma `tool_call`, executa de verdade
 * (`tools.cjs`), registra em `AcoesIA` (log revisável — o agente
 * executa direto, sem confirmação prévia, por decisão do usuário) e devolve
 * o resultado como mensagem `role: 'tool'` pro modelo continuar. Repete até
 * o modelo responder só texto ou até `MAX_ITERACOES`.
 */
async function conversar({ mensagens, origem = 'chat', repo = repoPlanilha(), ollama = ollamaClient, monitor }) {
  const historico = [...mensagens];
  const turnId = crypto.randomUUID();
  const uso = { modelo: null, inputTokens: 0, outputTokens: 0 };
  const t0 = Date.now();
  let numFerramentas = 0;

  const finalizarUso = (extra = {}) => registrarUso(repo, {
    origem, provedor: 'ollama', modelo: uso.modelo, turnId,
    inputTokens: uso.inputTokens, outputTokens: uso.outputTokens,
    custoUsd: 0, // Ollama é local/gratuito — sem custo por token, diferente do Claude CLI.
    duracaoMs: Date.now() - t0, numFerramentas, ...extra,
  });

  try {
    for (let i = 0; i < MAX_ITERACOES_FERRAMENTA; i++) {
      const resposta = await ollama.chat(historico, { tools: TOOLS_SCHEMA, coletarUso: uso });
      const pseudo = !resposta.tool_calls?.length ? extrairPseudoToolCall(resposta.content) : null;
      const toolCalls = resposta.tool_calls?.length ? resposta.tool_calls : (pseudo ? [pseudo] : null);

      if (!toolCalls) {
        finalizarUso();
        return resposta.content ?? '';
      }

      // Pseudo tool-call: não repassa o texto cru (o JSON vazado) pro histórico
      // como se fosse fala do assistente — só a intenção de chamar ferramenta.
      historico.push(pseudo ? { role: 'assistant', content: '', tool_calls: toolCalls } : resposta);

      for (const chamada of toolCalls) {
        const nome = chamada.function?.name;
        const ferramenta = FERRAMENTAS_POR_NOME.get(nome);
        const argumentos = chamada.function?.arguments ?? {};

        let resultado;
        try {
          resultado = ferramenta ? ferramenta.executar(repo, argumentos) : { erro: `Ferramenta "${nome}" não existe.` };
        } catch (err) {
          resultado = { erro: err.message };
        }

        if (ferramenta) {
          registrarAcao(repo, { ferramenta: nome, clientId: argumentos.clientId, argumentos, resultado, origem, turnId, monitor });
          numFerramentas += 1;
        }

        historico.push({ role: 'tool', content: JSON.stringify(resultado) });
      }
    }
  } catch (err) {
    finalizarUso({ erro: true });
    throw err;
  }

  finalizarUso({ erro: true });
  throw new Error('monitorIA excedeu o limite de chamadas de ferramenta sem concluir a resposta.');
}

module.exports = { conversar, registrarAcao, descreverAcao, FERRAMENTAS_POR_NOME, TOOLS_SCHEMA };
