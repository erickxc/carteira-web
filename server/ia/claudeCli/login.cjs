const { spawn } = require('child_process');
const { localizarClaudeCli } = require('./localizar.cjs');
const { salvarToken, removerToken, ambienteCredencial } = require('./estado.cjs');
const { comandoSpawn } = require('./spawnCli.cjs');
const { statusAuth, limparCacheAuth } = require('./auth.cjs');

/**
 * Login da conta Claude pela GUI, dirigindo o `claude setup-token` do
 * Claude Code CLI — sem chave de API em lugar nenhum.
 *
 * O fluxo do CLI é o mesmo de sempre: ele imprime um link de autorização,
 * o usuário aprova o acesso no navegador e o navegador devolve um código; o
 * código volta pro CLI, que imprime um token OAuth de 1 ano
 * (`CLAUDE_CODE_OAUTH_TOKEN`) e sai. O que este módulo faz é ficar no meio
 * disso: captura o link do stdout pra GUI mostrar, recebe o código pela API
 * e escreve no stdin do processo, e captura o token pra gravar em
 * `estado.cjs`.
 *
 * O comando usado e `claude auth login --claudeai`, e essa escolha foi
 * MEDIDA, nao presumida: o caminho obvio (`claude setup-token`, o comando "de
 * CI") **nao imprime nada com stdio comum** — exige terminal de verdade.
 * Verificado na maquina de producao com a versao 2.1.247: o fluxo ficou 60s em
 * silencio e estourou o timeout. O `auth login`, com os MESMOS pipes, imprime:
 *
 *     Opening browser to sign in...
 *     If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?...
 *     Paste code here if prompted >
 *
 * Ou seja: link pra GUI mostrar e prompt de codigo pra alimentar pelo stdin —
 * exatamente o fluxo pedido, sem `node-pty` (que segue suportado se estiver
 * instalado, ver `abrirProcesso`, como rede de seguranca caso alguma versao
 * futura do CLI volte a exigir TTY).
 *
 * Diferenca importante em relacao ao `setup-token`: o `auth login` guarda a
 * credencial ele mesmo (`~/.claude/.credentials.json`) e NAO imprime token
 * nenhum. Entao o fim do fluxo nao e "achei o token na saida" — e perguntar ao
 * proprio CLI se ficou logado (`auth.cjs`, que le `claude auth status`). O
 * campo de token colado a mao continua existindo pra quem preferir gerar um
 * token de 1 ano com `claude setup-token` num terminal.
 *
 * Nota de ambiente: o CLI tenta abrir o navegador NA MAQUINA DO SERVIDOR (e
 * ela que executa o processo). Usando a GUI de outra maquina da LAN, essa aba
 * abre no lugar errado e e inofensiva — o link mostrado na tela e o que vale,
 * e o codigo pode ser colado de qualquer maquina.
 */

const TIMEOUT_LINK_MS = 60_000;      // link não apareceu: CLI travou ou exige TTY
const TIMEOUT_SESSAO_MS = 600_000;   // usuário tem 10 min pra aprovar e colar o código

// Sequencias ANSI (cor, cursor, titulo de janela). Escritas com \u001b em vez
// do caractere ESC cru pra nao deixar byte de controle invisivel no fonte.
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007?/g;
const semAnsi = (t) => t.replace(ANSI, '');

// O host varia por tipo de conta (claude.ai para assinatura, console para
// Claude Console), então casa os dois em vez de fixar um.
const RE_LINK = /https:\/\/[\w.-]*claude\.(?:ai|com)\/[^\s"'`)\]]*oauth[^\s"'`)\]]*/i;
// Token do `setup-token`: prefixo `sk-ant-oat01-` hoje. O padrão aqui aceita
// qualquer `sk-ant-...` longo pra não quebrar se o prefixo mudar de versão.
const RE_TOKEN = /sk-ant-[A-Za-z0-9_-]{24,}/;

let sessao = null;

function novaSessao() {
  return {
    estado: 'iniciando',
    link: null,
    mensagem: 'Iniciando o Claude Code CLI...',
    saida: '',
    iniciadoEm: Date.now(),
    proc: null,
    escrever: null,
    timers: [],
  };
}

function encerrarProcesso(s) {
  s.timers.forEach(clearTimeout);
  s.timers = [];
  try { s.proc?.kill(); } catch { /* já morreu */ }
  s.proc = null;
  s.escrever = null;
}

function falhar(s, mensagem) {
  if (s.estado === 'concluido' || s.estado === 'erro') return;
  s.estado = 'erro';
  s.mensagem = mensagem;
  encerrarProcesso(s);
}

function concluir(s, mensagem) {
  if (s.estado === 'concluido') return;
  s.estado = 'concluido';
  s.mensagem = mensagem;
  s.saida = '';
  encerrarProcesso(s);
}

/**
 * Abre o processo. Usa `node-pty` quando disponível (terminal de verdade, o
 * caminho mais fiel ao que o CLI espera) e cai pra `child_process.spawn` com
 * pipes caso contrário. Devolve `{ onDados, onFim, escrever, kill }` pra que o
 * resto do fluxo não precise saber qual dos dois está por baixo.
 */
function abrirProcesso(bin, args, env, cwd) {
  let pty = null;
  try { pty = require('node-pty'); } catch { /* opcional — segue com pipes */ }

  if (pty) {
    const p = pty.spawn(bin, args, { cwd, env, cols: 120, rows: 40 });
    return {
      tipo: 'pty',
      onDados: (fn) => p.onData(fn),
      onFim: (fn) => p.onExit(({ exitCode }) => fn(exitCode)),
      escrever: (txt) => p.write(txt),
      kill: () => p.kill(),
    };
  }

  // `setup-token` e argumento simples, sem metacaractere — seguro no caminho
  // com shell (shim `.cmd` do npm), ver `spawnCli.cjs`.
  const cmd = comandoSpawn(bin, args);
  const p = spawn(cmd.file, cmd.args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...cmd.opcoes });
  return {
    tipo: 'pipe',
    onDados: (fn) => {
      p.stdout.on('data', (b) => fn(b.toString('utf8')));
      p.stderr.on('data', (b) => fn(b.toString('utf8')));
    },
    onFim: (fn) => {
      p.on('close', (code) => fn(code));
      p.on('error', (err) => fn(-1, err));
    },
    escrever: (txt) => p.stdin.write(txt),
    kill: () => p.kill(),
  };
}

/**
 * Começa (ou reinicia) o fluxo de login. Uma sessão por vez: um segundo
 * `claude setup-token` em paralelo disputaria o mesmo fluxo de autorização e
 * o usuário não teria como saber qual link é de qual.
 */
function iniciarLogin({ cwd } = {}) {
  if (sessao && sessao.estado !== 'concluido' && sessao.estado !== 'erro') {
    return statusLogin();
  }

  const bin = localizarClaudeCli();
  sessao = novaSessao();
  const s = sessao;

  if (!bin) {
    falhar(s, 'Claude Code CLI não encontrado nesta máquina. Instale (irm https://claude.ai/install.ps1 | iex) ou aponte CLAUDE_CLI_PATH no .env.');
    return statusLogin();
  }

  // Login SEM token: se o token salvo (possivelmente expirado) fosse pro
  // ambiente, o CLI poderia considerar a sessão já autenticada e não abrir o
  // fluxo — que é justamente o que o usuário pediu ao clicar em conectar.
  const env = { ...ambienteCredencial() };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;

  let proc;
  try {
    proc = abrirProcesso(bin, ['auth', 'login', '--claudeai'], env, cwd || process.cwd());
  } catch (err) {
    falhar(s, `Falha ao executar "${bin} auth login": ${err.message}`);
    return statusLogin();
  }

  s.proc = proc;
  s.escrever = proc.escrever;
  s.mensagem = 'Aguardando o link de autorização do CLI...';
  // Fotografa o login ANTES de começar. Sem isso, uma tentativa que falha
  // numa máquina que JÁ estava logada seria reportada como sucesso: o
  // `auth status` diria "logado" por causa da credencial antiga, não por
  // causa do fluxo que o usuário acabou de rodar.
  s.authAntes = statusAuth({ forcar: true }).catch(() => ({ loggedIn: false, email: null }));

  proc.onDados((txt) => {
    // Só o rabo da saída interessa (diagnóstico + varredura de link/token) —
    // um CLI interativo redesenha a tela e a saída cresce sem limite.
    s.saida = (s.saida + semAnsi(txt)).slice(-8000);

    if (!s.link) {
      const link = s.saida.match(RE_LINK);
      if (link) {
        s.link = link[0];
        s.estado = 'aguardando_codigo';
        s.mensagem = 'Abra o link, aprove o acesso e cole aqui o código que o navegador mostrar.';
      }
    }

    // `auth login` nao imprime token, mas `setup-token` imprime — se alguem
    // apontar `CLAUDE_CLI_PATH` pra um wrapper que faca isso, aproveita.
    const token = s.saida.match(RE_TOKEN);
    if (token && s.estado !== 'concluido') {
      salvarToken(token[0]);
      limparCacheAuth();
      concluir(s, 'Conta Claude conectada.');
    }
  });

  proc.onFim(async (code, err) => {
    if (s.estado === 'concluido') return;
    if (err) return falhar(s, `Erro ao executar o CLI: ${err.message}`);

    // O `auth login` guarda a credencial ele mesmo e sai sem imprimir token:
    // quem diz se o login funcionou e o proprio CLI.
    limparCacheAuth();
    const antes = await s.authAntes;
    const auth = await statusAuth({ forcar: true });
    const mudou = auth.loggedIn && (!antes.loggedIn || antes.email !== auth.email);
    if (mudou) {
      return concluir(s, `Conta Claude conectada${auth.email ? ` (${auth.email})` : ''}.`);
    }

    const cauda = s.saida.split('\n').map((l) => l.trim()).filter(Boolean).slice(-4).join(' | ');
    const jaLogado = auth.loggedIn
      ? ` Esta máquina continua logada como ${auth.email || 'a conta anterior'} — o monitorIA funciona com essa credencial.`
      : '';
    falhar(s, `O login não foi concluído (o CLI saiu com código ${code}).${jaLogado}${cauda ? ` Últimas linhas: ${cauda}` : ''}`);
  });

  s.timers.push(setTimeout(() => {
    if (!s.link && s.estado === 'iniciando') {
      falhar(s, 'O CLI não imprimiu o link de autorização. Rode "claude auth login" num terminal desta máquina, ou gere um token com "claude setup-token" e cole no campo abaixo.');
    }
  }, TIMEOUT_LINK_MS));

  s.timers.push(setTimeout(() => falhar(s, 'Tempo esgotado para concluir o login (10 minutos).'), TIMEOUT_SESSAO_MS));

  return statusLogin();
}

/** Repassa o código do navegador pro stdin do CLI. */
function enviarCodigo(codigo) {
  const s = sessao;
  if (!s || s.estado !== 'aguardando_codigo' || !s.escrever) {
    throw new Error('Nenhum login aguardando código. Clique em conectar novamente.');
  }
  const limpo = String(codigo || '').trim();
  if (!limpo) throw new Error('Código vazio.');
  s.escrever(`${limpo}\n`);
  s.estado = 'validando';
  s.mensagem = 'Validando o código com a Anthropic...';
  return statusLogin();
}

function cancelarLogin() {
  if (sessao) falhar(sessao, 'Login cancelado.');
  return statusLogin();
}

/** Estado público — nunca inclui token nem a saída crua do CLI. */
function statusLogin() {
  if (!sessao) return { estado: 'inativo', link: null, mensagem: '' };
  return { estado: sessao.estado, link: sessao.link, mensagem: sessao.mensagem };
}

/**
 * Caminho manual: token colado direto na GUI (usuário rodou
 * `claude setup-token` num terminal). Validado com uma chamada mínima ao CLI
 * antes de gravar — token errado precisa falhar aqui, no clique, não daqui a
 * três dias na primeira análise automática.
 */
async function definirTokenManual(token, { validar } = {}) {
  const limpo = String(token || '').trim();
  if (!RE_TOKEN.test(limpo)) throw new Error('Isso não parece um token do Claude Code (esperado algo como "sk-ant-oat01-...").');
  if (validar) await validar(limpo);
  salvarToken(limpo);
  limparCacheAuth();
  if (sessao) sessao.estado = 'concluido';
  return { ok: true };
}

/**
 * Desconecta o que e NOSSO: apaga o token que a GUI guardou.
 *
 * De proposito NAO roda `claude auth logout`: esse login e da maquina e e
 * usado pelo usuario fora daqui tambem (terminal, extensao do VS Code).
 * Derrubar isso por um botao da carteira seria efeito colateral em ferramenta
 * de terceiro. Devolve `loginDaMaquina` pra GUI poder explicar que o provedor
 * continua funcionando por essa credencial.
 */
async function logout() {
  cancelarLogin();
  removerToken();
  limparCacheAuth();
  sessao = null;
  const auth = await statusAuth({ forcar: true });
  return { ok: true, loginDaMaquina: auth.loggedIn, email: auth.email };
}

module.exports = { iniciarLogin, enviarCodigo, cancelarLogin, statusLogin, definirTokenManual, logout, RE_TOKEN };
