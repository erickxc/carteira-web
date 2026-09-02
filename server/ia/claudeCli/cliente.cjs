const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  HOST, PORT, SQLITE_DIR, CLAUDE_CLI_TIMEOUT_MS, CLAUDE_CLI_CWD, CLAUDE_MCP_SERVER,
} = require('../../config.cjs');
const { extrairJSON } = require('../jsonTexto.cjs');
const { registrarUso } = require('../uso.cjs');
const { localizarClaudeCli, versaoClaudeCli } = require('./localizar.cjs');
const { tokenSalvo, ambienteCredencial, modeloAtivo, modeloTravado } = require('./estado.cjs');
const { statusAuth, autenticado } = require('./auth.cjs');
const { comandoSpawn, precisaShell } = require('./spawnCli.cjs');

/**
 * Provedor de IA que dirige o **Claude Code CLI** como subprocesso, em vez de
 * falar com a API da Anthropic. A credencial é o login da conta Claude
 * (assinatura), obtido pela GUI — ver `login.cjs`. Nenhuma chave de API é
 * usada; `estado.ambienteCredencial()` até remove `ANTHROPIC_API_KEY` do
 * ambiente do filho de propósito.
 *
 * Interface espelha o par que `orquestrador.cjs`/`analiseCliente.cjs` já
 * consomem — `conversar()` e `gerarJSON()` —, então trocar de provedor
 * (`server/ia/provider.cjs`) não mexe em nada de domínio.
 *
 * Diferença estrutural que vale entender: no Ollama, QUEM roda o loop de
 * ferramentas é o `orquestrador.cjs` daqui. Aqui, quem roda o loop é o CLI:
 * ele recebe as ferramentas da carteira por MCP (`mcpServidor.cjs`), decide
 * quando chamar, e devolve só a resposta final. Consequências práticas:
 *
 *  - `MAX_ITERACOES_FERRAMENTA` não se aplica; o limite é `CLAUDE_CLI_TIMEOUT_MS`.
 *  - O log `AcoesIA` é gravado pela rota interna que o MCP chama, não aqui.
 *  - O system prompt entra por `--append-system-prompt`, ou seja, ele SOMA ao
 *    prompt de agente de código do próprio CLI, que não dá pra remover. É o
 *    custo de usar o CLI em vez da API; por isso o `cwd` é uma pasta vazia
 *    dedicada (`CLAUDE_CLI_CWD`) — sem isso o CLI carregaria o `CLAUDE.md` do
 *    repositório e o contexto de monitoria disputaria espaço com regras de
 *    desenvolvimento do projeto.
 */

// Segredo do canal interno backend ↔ servidor MCP. Gerado por processo: o
// servidor MCP roda em OUTRO processo (filho do CLI) e só alcança o backend
// por loopback, então precisa provar que é ele. Não é o que protege os dados
// (a API inteira do app não tem autenticação, por decisão do usuário) — é pra
// que a rota interna, que EXECUTA ferramenta de escrita, não fique aberta a
// qualquer coisa que alcance a porta.
const SEGREDO_INTERNO = crypto.randomBytes(24).toString('hex');

// Ferramentas nativas do CLI, todas negadas. O agente de monitoria não tem o
// que fazer com arquivo, shell ou web: liberar Bash num processo que roda com
// o usuário dono do OneDrive corporativo seria dar shell pra qualquer um que
// consiga digitar no chat — e o app não tem autenticação.
const FERRAMENTAS_NATIVAS_NEGADAS = [
  'Bash', 'PowerShell', 'Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Task', 'TodoWrite',
].join(',');

const CONFIG_MCP = path.join(SQLITE_DIR, 'claude-mcp.json');

/**
 * Config paralela pra quem quiser plugar as ferramentas da carteira num
 * cliente MCP PRÓPRIO (o Claude Code do usuário, Claude Desktop).
 *
 * Existe por causa de rastreabilidade: a config interna carrega
 * `CARTEIRA_IA_ORIGEM` da chamada que a escreveu (`chat`, por exemplo), então
 * uma sessão externa apontada pro mesmo arquivo apareceria no log de auditoria
 * como se fosse o chat do app — indistinguível. Aconteceu: um agente externo
 * afirmou ter consultado a carteira e o log não tinha como confirmar nem
 * desmentir pela origem (só o número de clientes, que não batia).
 *
 * O segredo é o mesmo e ROTACIONA a cada boot do backend — uma sessão externa
 * aberta antes de um restart para de funcionar até reapontar pro arquivo.
 */
const CONFIG_MCP_EXTERNO = path.join(SQLITE_DIR, 'claude-mcp-externo.json');

function urlInterna() {
  // `HOST` pode ser 0.0.0.0 em dev (APP_HOST) — o filho tem que discar num IP
  // conectável, não no coringa de bind.
  const alvo = !HOST || HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  return `http://${alvo}:${PORT}`;
}

/**
 * Escreve o `--mcp-config` que aponta pro `mcpServidor.cjs`. Reescrito a cada
 * chamada porque carrega o segredo do processo atual: um arquivo de um boot
 * anterior tem segredo velho e a ferramenta falharia com 401.
 */
function garantirConfigMcp(origem, turnId, monitor) {
  if (process.pkg) {
    throw new Error('O provedor Claude CLI não funciona com o backend empacotado (pkg) — o servidor MCP precisa de um node.exe real.');
  }
  const config = {
    mcpServers: {
      [CLAUDE_MCP_SERVER]: {
        command: process.execPath,
        args: [path.join(__dirname, 'mcpServidor.cjs')],
        env: {
          CARTEIRA_IA_URL: urlInterna(),
          CARTEIRA_IA_SEGREDO: SEGREDO_INTERNO,
          CARTEIRA_IA_ORIGEM: origem,
          CARTEIRA_IA_TURNO: turnId || '',
          CARTEIRA_IA_MONITOR: monitor || '',
        },
      },
    },
  };
  fs.mkdirSync(path.dirname(CONFIG_MCP), { recursive: true });
  fs.writeFileSync(CONFIG_MCP, JSON.stringify(config, null, 2), { mode: 0o600 });

  // Gêmea pra uso externo, com origem própria — ver CONFIG_MCP_EXTERNO.
  const externo = JSON.parse(JSON.stringify(config));
  externo.mcpServers[CLAUDE_MCP_SERVER].env.CARTEIRA_IA_ORIGEM = 'mcp-externo';
  fs.writeFileSync(CONFIG_MCP_EXTERNO, JSON.stringify(externo, null, 2), { mode: 0o600 });

  return CONFIG_MCP;
}

function garantirCwd() {
  fs.mkdirSync(CLAUDE_CLI_CWD, { recursive: true });
  return CLAUDE_CLI_CWD;
}

/**
 * Roda o CLI em modo headless (`-p`) e devolve o objeto de resultado do
 * `--output-format json`.
 *
 * O prompt vai por STDIN, não como argumento: dossiê + histórico passam
 * fácil de alguns KB e o limite de linha de comando do Windows (~32k) já
 * estourou aqui em teste com cliente de histórico longo.
 */
async function rodarCli(prompt, { systemPrompt, mcpConfig, timeoutMs = CLAUDE_CLI_TIMEOUT_MS } = {}) {
  const bin = localizarClaudeCli();
  if (!bin) throw new Error('Claude Code CLI não encontrado nesta máquina (instale ou aponte CLAUDE_CLI_PATH no .env).');
  // Duas credenciais valem: o token que a GUI guardou e o login do proprio
  // CLI nesta maquina (`claude auth login` / extensao do VS Code). Exigir so o
  // token era um bug — numa maquina onde o usuario ja usa o Claude Code
  // normalmente, o provedor recusava funcionar com credencial valida na mao.
  if (!(await autenticado())) {
    throw new Error('Conta Claude não conectada. Vá em Configurações → monitorIA e conecte a conta (ou rode "claude auth login" nesta máquina).');
  }

  const args = [
    '-p',
    '--output-format', 'json',
    '--model', modeloAtivo(),
    '--disallowed-tools', FERRAMENTAS_NATIVAS_NEGADAS,
  ];

  // Instalacao por npm entrega um shim `claude.cmd`, que so roda via shell — e
  // nesse modo o Node nao escapa argumentos (ver `spawnCli.cjs`). O system
  // prompt (`normas.cjs`) tem aspas e `%`: como argumento, viraria sintaxe de
  // `cmd.exe`. Entao nesse caso ele vai junto do prompt, pelo STDIN, que nao
  // passa por shell nenhum. Instalacao nativa (`claude.exe`) usa a flag
  // dedicada, que e o caminho melhor pra adesao do modelo as instrucoes.
  const viaShell = precisaShell(bin);
  let promptFinal = prompt;
  if (systemPrompt) {
    if (viaShell) promptFinal = `<instrucoes_do_sistema>
${systemPrompt}
</instrucoes_do_sistema>

${prompt}`;
    else args.push('--append-system-prompt', systemPrompt);
  }
  if (mcpConfig) {
    args.push('--mcp-config', mcpConfig, '--strict-mcp-config');
    // Sem isso o CLI para e pede aprovação de cada ferramenta — em headless
    // isso é um travamento, não uma pergunta. Seguro aqui porque as únicas
    // ferramentas habilitadas são as do MCP da carteira (`--allowed-tools`),
    // com todas as nativas negadas acima.
    args.push('--allowed-tools', `mcp__${CLAUDE_MCP_SERVER}`, '--permission-mode', 'bypassPermissions');
  }

  return new Promise((resolve, reject) => {
    const cmd = comandoSpawn(bin, args);
    const proc = spawn(cmd.file, cmd.args, {
      cwd: garantirCwd(),
      env: ambienteCredencial(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...cmd.opcoes,
    });

    let saida = '';
    let erroSaida = '';
    let encerrado = false;

    const timer = setTimeout(() => {
      encerrado = true;
      try { proc.kill(); } catch { /* já morreu */ }
      reject(new Error(`Claude Code CLI não respondeu em ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    proc.stdout.on('data', (b) => { saida += b.toString('utf8'); });
    proc.stderr.on('data', (b) => { erroSaida = (erroSaida + b.toString('utf8')).slice(-4000); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Falha ao executar "${bin}": ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (encerrado) return;

      let dados;
      try {
        dados = JSON.parse(saida.trim());
        // Parse OK mas nao e um objeto de resultado: acontece quando o CLI
        // imprime outra coisa no stdout (banner, aviso de atualizacao) e o
        // trecho por acaso e JSON valido. Sem esta checagem, `dados.result`
        // sairia `undefined` e o chat responderia vazio, sem erro nenhum.
        if (!dados || typeof dados !== 'object') throw new Error('nao e objeto');
      } catch {
        const pista = (erroSaida || saida).trim().split('\n').filter(Boolean).slice(-3).join(' | ');
        return reject(new Error(traduzirErro(`Claude Code CLI saiu com código ${code} sem JSON válido.${pista ? ` ${pista}` : ''}`)));
      }
      if (dados.is_error || dados.subtype === 'error_during_execution' || dados.subtype === 'error_max_turns') {
        return reject(new Error(traduzirErro(String(dados.result || dados.error || dados.subtype))));
      }
      resolve(dados);
    });

    proc.stdin.end(promptFinal, 'utf8');
  });
}

/**
 * Erro do CLI vira mensagem acionável. Credencial expirada é o caso comum e
 * chegava como texto cru da Anthropic no meio do chat, sem dizer o que fazer
 * — o token do `setup-token` vale 1 ano, então isso acontece longe do dia em
 * que alguém configurou e ninguém lembra do fluxo.
 */
function traduzirErro(mensagem) {
  if (/login expired|invalid.*(api key|token)|unauthorized|401|oauth/i.test(mensagem)) {
    return `Credencial do Claude inválida ou expirada — reconecte em Configurações → monitorIA. (${mensagem})`;
  }
  if (/usage limit|rate limit|429/i.test(mensagem)) {
    return `Limite de uso da conta Claude atingido — tente mais tarde. (${mensagem})`;
  }
  return mensagem;
}

/**
 * Renderiza a conversa num prompt único. O CLI headless aceita um prompt por
 * chamada; multi-turno nativo seria `--session-id`/`--resume`, que amarraria
 * o chat ao estado de sessão no disco da máquina do servidor (e a rota de
 * chat é stateless hoje — o frontend manda o histórico inteiro a cada
 * mensagem). Reenviar o histórico é mais simples e não tem estado pra
 * corromper; o custo é o reenvio, absorvido pelo cache de prompt.
 */
function montarPromptConversa(mensagens) {
  const sistema = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const resto = mensagens.filter((m) => m.role !== 'system');
  const atual = resto[resto.length - 1];
  const anteriores = resto.slice(0, -1);

  const rotulo = { user: 'Usuário', assistant: 'monitorIA', tool: 'Resultado de ferramenta' };
  const historico = anteriores
    .map((m) => `${rotulo[m.role] ?? m.role}: ${m.content}`)
    .join('\n');

  const prompt = [
    historico && `<conversa_anterior>\n${historico}\n</conversa_anterior>`,
    `<pergunta_atual>\n${atual?.content ?? ''}\n</pergunta_atual>`,
  ].filter(Boolean).join('\n\n');

  return { sistema, prompt };
}

/**
 * Mesma assinatura de `orquestrador.conversar` (`{ mensagens, origem }` →
 * texto final). `repo` é aceito e ignorado: aqui as ferramentas rodam pela
 * rota interna, que usa o repositório do backend — manter o parâmetro deixa a
 * troca de provedor invisível pra quem chama.
 */
/**
 * Tokens/custo do resultado do CLI (`--output-format json`). Prefere
 * `modelUsage` (soma por modelo REAL usado) ao `usage` de topo, que reflete só
 * a ÚLTIMA iteração do turno — visto na prática: uma chamada simples trouxe
 * `usage.input_tokens: 2` mas `modelUsage` mostrava os ~54 mil tokens de
 * criação de cache da primeira iteração. Some entre modelos (ex.: um
 * classificador leve + o modelo de geração) pra refletir o custo real do
 * turno inteiro, não só do último passo.
 */
function extrairUsoCli(dados) {
  const porModelo = Object.values(dados.modelUsage || {});
  if (!porModelo.length) {
    const u = dados.usage || {};
    return {
      modelo: null,
      inputTokens: u.input_tokens || 0,
      outputTokens: u.output_tokens || 0,
      cacheCreationTokens: u.cache_creation_input_tokens || 0,
      cacheReadTokens: u.cache_read_input_tokens || 0,
      custoUsd: dados.total_cost_usd ?? null,
    };
  }
  const somado = porModelo.reduce((acc, m) => ({
    inputTokens: acc.inputTokens + (m.inputTokens || 0),
    outputTokens: acc.outputTokens + (m.outputTokens || 0),
    cacheCreationTokens: acc.cacheCreationTokens + (m.cacheCreationInputTokens || 0),
    cacheReadTokens: acc.cacheReadTokens + (m.cacheReadInputTokens || 0),
  }), { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 });
  // Modelo "principal" = o de maior output — é o que de fato gerou a
  // resposta, diferente de um classificador leve (fast-mode) que só decide
  // roteamento e produz poucos tokens de saída.
  const principal = Object.entries(dados.modelUsage).sort((a, b) => (b[1].outputTokens || 0) - (a[1].outputTokens || 0))[0];
  return { modelo: principal?.[1]?.canonicalModel || principal?.[0] || null, ...somado, custoUsd: dados.total_cost_usd ?? null };
}

async function conversar({ mensagens, origem = 'chat', repo, monitor }) {
  const { sistema, prompt } = montarPromptConversa(mensagens);
  // Última fala do usuário — o que ele de fato perguntou neste turno.
  const perguntaUsuario = [...mensagens].reverse().find((m) => m.role === 'user')?.content ?? '';
  const turnId = crypto.randomUUID();
  const t0 = Date.now();

  let dados;
  try {
    dados = await rodarCli(prompt, { systemPrompt: sistema, mcpConfig: garantirConfigMcp(origem, turnId, monitor) });
  } catch (err) {
    if (repo) {
      const numFerramentas = repo.get('AcoesIA').filter((a) => a.turnId === turnId).length;
      registrarUso(repo, { origem, provedor: 'claude-cli', turnId, duracaoMs: Date.now() - t0, numFerramentas, erro: true, pergunta: perguntaUsuario });
    }
    throw err;
  }

  if (repo) {
    const uso = extrairUsoCli(dados);
    // As ferramentas deste turno já foram gravadas em AcoesIA pela rota
    // interna (o MCP chama enquanto o CLI ainda está rodando) — conta quantas
    // têm este turnId pra saber "quantas chamadas de função esta pergunta fez".
    const numFerramentas = repo.get('AcoesIA').filter((a) => a.turnId === turnId).length;
    registrarUso(repo, { origem, provedor: 'claude-cli', turnId, duracaoMs: Date.now() - t0, numFerramentas, ...uso, pergunta: perguntaUsuario, resposta: String(dados.result ?? '') });
  }

  return String(dados.result ?? '');
}

/**
 * Extração estruturada (análise de risco / dossiê). Roda SEM MCP: essa etapa
 * recebe o contexto pronto no prompt e não deve tocar em dado nenhum — dar
 * ferramenta de escrita pra um passo automático que roda em lote por cliente
 * (`analisesAutomaticas.cjs`) é convite pra estrago silencioso.
 */
async function gerarJSON(prompt, { coletarUso } = {}) {
  const dados = await rodarCli(`${prompt}\n\nResponda APENAS com o JSON pedido, sem texto em volta e sem cercas de código.`, {
    systemPrompt: 'Você devolve exclusivamente JSON válido, sem comentário, sem explicação e sem cercas de código.',
  });
  const texto = String(dados.result ?? '');
  // Acumulador mutável, mesmo contrato do `coletarUso` do Ollama: é o que faz
  // geração de ata e análise automática aparecerem no painel de consumo (antes
  // gastavam tokens PAGOS de forma invisível — só o chat era medido).
  if (coletarUso) Object.assign(coletarUso, extrairUsoCli(dados), { resposta: texto });
  try {
    return JSON.parse(extrairJSON(texto));
  } catch (err) {
    throw new Error(`Resposta do Claude CLI não é JSON válido: ${err.message}`);
  }
}

/**
 * Diagnostico pra GUI: o que existe/falta pra este provedor funcionar.
 *
 * `autenticado` cobre as duas credenciais aceitas, e `origemCredencial` diz
 * QUAL esta valendo — sem isso a tela nao consegue explicar por que ja
 * funciona sem ninguem ter clicado em conectar (login da maquina), nem o que o
 * botao de desconectar realmente desfaz.
 */
async function diagnostico() {
  const bin = localizarClaudeCli();
  const auth = bin ? await statusAuth() : { loggedIn: false, email: null, plano: null };
  const temToken = Boolean(tokenSalvo());
  return {
    cliInstalado: Boolean(bin),
    caminho: bin,
    versao: bin ? versaoClaudeCli(bin) : null,
    autenticado: temToken || auth.loggedIn,
    origemCredencial: temToken ? 'token' : (auth.loggedIn ? 'maquina' : null),
    email: auth.email,
    plano: auth.plano,
    modelo: modeloAtivo(),
    modeloTravado: modeloTravado(),
    empacotado: Boolean(process.pkg),
  };
}

module.exports = {
  conversar, gerarJSON, diagnostico, rodarCli, montarPromptConversa,
  SEGREDO_INTERNO, CONFIG_MCP, CONFIG_MCP_EXTERNO,
};
