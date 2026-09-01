const express = require('express');
const { IA_PROVIDERS, CLAUDE_CLI_CWD, CLAUDE_CLI_MODELOS, CLAUDE_MCP_SERVER, CLAUDE_CLI_TIMEOUT_MS } = require('../config.cjs');
const { repoPlanilha } = require('../dominio/repo.cjs');
const estado = require('../ia/claudeCli/estado.cjs');
const login = require('../ia/claudeCli/login.cjs');
const claudeCli = require('../ia/claudeCli/cliente.cjs');
const { limparCacheLocalizacao } = require('../ia/claudeCli/localizar.cjs');
const { FERRAMENTAS } = require('../ia/tools.cjs');
const { registrarAcao } = require('../ia/orquestrador.cjs');
const { conversar } = require('../ia/provider.cjs');
const { montarSystemPrompt } = require('../ia/agente.cjs');

// Quais ferramentas MUDAM dado — a tela marca essas, porque o agente executa
// sem confirmação prévia (decisão do usuário) e quem configura precisa ver o
// que está entregando na mão dele.
const FERRAMENTAS_ESCRITA = new Set(['criar_evento', 'criar_lembrete', 'corrigir_dossie_cliente', 'registrar_memoria', 'remover_memoria']);

/**
 * Rotas de configuração do provedor de IA e do login da conta Claude, mais o
 * canal interno que o servidor MCP (`server/ia/claudeCli/mcpServidor.cjs`)
 * usa pra executar ferramenta de verdade.
 *
 * O login mora aqui, e não em `sistemaLocal.cjs`, porque é fluxo de IA e
 * porque o estado dele é uma máquina de estados viva (processo do CLI aberto
 * esperando um código) — a GUI faz polling em `GET /claude/login`.
 */

const router = express.Router();
const repo = repoPlanilha();
const FERRAMENTAS_POR_NOME = new Map(FERRAMENTAS.map((f) => [f.name, f]));

// ---------------------------------------------------------------- provedor

router.get('/provedor', async (_req, res) => {
  // `diagnostico()` e assincrono porque consulta `claude auth status` (o CLI
  // e a fonte de verdade sobre login da maquina), com cache curto em auth.cjs.
  res.json({
    provedor: estado.provedorAtivo(),
    travado: estado.provedorTravado(),
    provedores: IA_PROVIDERS,
    claude: { ...(await claudeCli.diagnostico()), login: login.statusLogin() },
  });
});

router.put('/provedor', (req, res) => {
  try {
    limparCacheLocalizacao();
    estado.definirProvedor(req.body?.provedor);
    res.json({ provedor: estado.provedorAtivo() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ------------------------------------------------------------------ login

/**
 * Inicia o `claude auth login`. Resposta e imediata (estado `iniciando`) — o
 * link chega alguns segundos depois, pelo polling do `GET`. Nao da pra
 * aguardar aqui: o fluxo inteiro depende de uma acao humana no navegador e
 * pode levar minutos.
 */
router.post('/claude/login', (_req, res) => {
  limparCacheLocalizacao();
  res.json(login.iniciarLogin({ cwd: CLAUDE_CLI_CWD }));
});

router.get('/claude/login', (_req, res) => res.json(login.statusLogin()));

router.post('/claude/login/codigo', (req, res) => {
  try {
    res.json(login.enviarCodigo(req.body?.codigo));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/claude/login', (_req, res) => res.json(login.cancelarLogin()));

/**
 * Caminho manual (token colado): valida antes de gravar com uma chamada
 * mínima ao CLI usando o token informado — sem isso, um token errado só
 * apareceria mais tarde, no meio de uma resposta do chat.
 */
router.post('/claude/token', async (req, res) => {
  try {
    await login.definirTokenManual(req.body?.token, {
      validar: async (token) => {
        const anterior = process.env.CLAUDE_CODE_OAUTH_TOKEN;
        process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
        try {
          await claudeCli.rodarCli('Responda apenas: ok', { timeoutMs: 60000 });
        } finally {
          if (anterior === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
          else process.env.CLAUDE_CODE_OAUTH_TOKEN = anterior;
        }
      },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/claude/conta', async (_req, res) => res.json(await login.logout()));

router.put('/claude/modelo', (req, res) => {
  try {
    estado.definirModelo(req.body?.modelo);
    res.json({ modelo: estado.modeloAtivo() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------------- MCP

/**
 * Painel do MCP: o que exatamente o Claude Code recebe como ferramenta.
 *
 * Existe porque esse é o pedaço invisível da integração — sem isso, "o agente
 * não achou a ferramenta" é impossível de diagnosticar pela tela. Lista o nome
 * QUALIFICADO (`mcp__carteira__x`), que é como o CLI enxerga e como o filtro de
 * `--allowed-tools` casa.
 */
router.get('/claude/mcp', (_req, res) => {
  res.json({
    servidor: CLAUDE_MCP_SERVER,
    prefixo: `mcp__${CLAUDE_MCP_SERVER}__`,
    cwd: CLAUDE_CLI_CWD,
    arquivoConfig: claudeCli.CONFIG_MCP,
    timeoutSegundos: Math.round(CLAUDE_CLI_TIMEOUT_MS / 1000),
    modelos: CLAUDE_CLI_MODELOS,
    arquivoConfigExterno: claudeCli.CONFIG_MCP_EXTERNO,
    ferramentas: FERRAMENTAS.map((f) => ({
      nome: f.name,
      qualificado: `mcp__${CLAUDE_MCP_SERVER}__${f.name}`,
      descricao: f.description,
      escreve: FERRAMENTAS_ESCRITA.has(f.name),
    })),
  });
});

/**
 * Teste real da integração inteira, num clique: backend -> CLI -> servidor MCP
 * -> ferramenta -> banco -> `AcoesIA`. Não é ping: se responder, está tudo de
 * pé de verdade.
 *
 * A pergunta é deliberadamente de LEITURA e o retorno diz quais ferramentas
 * rodaram (diff de `AcoesIA`) — um teste que criasse evento pra "provar que
 * funciona" deixaria lixo no dado real do usuário.
 */
router.post('/claude/teste', async (_req, res) => {
  const antes = new Set(repo.get('AcoesIA').map((a) => a.id));
  const t0 = Date.now();
  try {
    const resposta = await conversar({
      mensagens: [
        { role: 'system', content: montarSystemPrompt({ memorias: repo.get('MemoriaIA') }) },
        { role: 'user', content: 'Quantos clientes ativos existem na carteira? Responda em uma frase.' },
      ],
      origem: 'teste-config',
      repo,
    });
    const usadas = repo.get('AcoesIA').filter((a) => !antes.has(a.id)).map((a) => a.ferramenta);
    res.json({ ok: true, resposta, ferramentas: usadas, segundos: Math.round((Date.now() - t0) / 1000) });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message, segundos: Math.round((Date.now() - t0) / 1000) });
  }
});

// ----------------------------------------------------------------- interno

/**
 * Só o servidor MCP entra aqui: ele roda em outro processo (filho do CLI) e
 * prova identidade com o segredo do processo atual do backend. Exige loopback
 * também — a rota executa ferramenta de ESCRITA (criar evento, corrigir
 * dossiê), e o resto da API, sem autenticação, já é exposto na LAN pelo
 * Apache; isto não vai junto.
 */
function apenasMcp(req, res, next) {
  const ip = req.socket.remoteAddress || '';
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!local) return res.status(403).json({ error: 'Rota interna: só loopback.' });
  if (req.get('x-carteira-ia-segredo') !== claudeCli.SEGREDO_INTERNO) {
    return res.status(401).json({ error: 'Segredo interno inválido.' });
  }
  next();
}

router.get('/interno/ferramentas', apenasMcp, (_req, res) => {
  res.json({
    ferramentas: FERRAMENTAS.map((f) => ({ name: f.name, description: f.description, parameters: f.parameters })),
  });
});

/**
 * Executa uma ferramenta e registra em `AcoesIA` — o MESMO log que o caminho
 * do Ollama grava (`orquestrador.registrarAcao`), com a mesma legenda humana.
 * É o que faz a página do assistente e a auditoria continuarem funcionando
 * iguais nos dois provedores, sem código de log duplicado.
 */
router.post('/interno/ferramenta', apenasMcp, (req, res) => {
  const { nome, argumentos = {}, origem = 'claude-cli', turnId, monitor } = req.body ?? {};
  const ferramenta = FERRAMENTAS_POR_NOME.get(nome);
  if (!ferramenta) return res.status(404).json({ error: `Ferramenta "${nome}" não existe.` });

  let resultado;
  try {
    resultado = ferramenta.executar(repo, argumentos, { monitor });
  } catch (err) {
    resultado = { erro: err.message };
  }
  registrarAcao(repo, { ferramenta: nome, clientId: argumentos.clientId, argumentos, resultado, origem, turnId, monitor });
  res.json({ resultado });
});

/**
 * Painel de consumo — tokens/custo por pergunta, nos dois provedores. Não
 * existe "quanto falta pra resetar a cota" aqui (ver server/ia/uso.cjs pro
 * porquê); o que dá é gasto acumulado e por-pergunta.
 */
/**
 * Janela de 5h / limite de 7 dias da assinatura Claude. O Claude Code CLI não
 * expõe isso (ver `limiteConta.cjs`) — esta rota bate direto na API com a
 * mesma credencial, só pra ler os headers de rate-limit. É uma chamada REAL e
 * paga (mínima), por isso cacheada com TTL — não chame em loop.
 */
router.get('/claude/limite', async (_req, res) => {
  res.json(await consultarLimiteConta({ repo }));
});

router.get('/uso', (req, res) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 90);
  const desde = new Date(Date.now() - dias * 86400e3).toISOString();
  const usos = repo.get('UsoIA')
    .filter((u) => String(u.criadoEm) >= desde)
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));

  const acoes = repo.get('AcoesIA');
  const comFerramentas = usos.map((u) => ({
    ...u,
    ferramentas: acoes.filter((a) => a.turnId && a.turnId === u.turnId)
      .map((a) => ({ ferramenta: a.ferramenta, argumentos: a.argumentos, resultado: a.resultado, descricao: a.descricao })),
  }));

  const totais = usos.reduce((acc, u) => ({
    inputTokens: acc.inputTokens + (u.inputTokens || 0),
    outputTokens: acc.outputTokens + (u.outputTokens || 0),
    cacheCreationTokens: acc.cacheCreationTokens + (u.cacheCreationTokens || 0),
    cacheReadTokens: acc.cacheReadTokens + (u.cacheReadTokens || 0),
    custoUsd: acc.custoUsd + (u.custoUsd || 0),
    perguntas: acc.perguntas + 1,
    erros: acc.erros + (u.erro ? 1 : 0),
  }), { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, custoUsd: 0, perguntas: 0, erros: 0 });

  res.json({ dias, totais, turnos: comFerramentas });
});

module.exports = router;
