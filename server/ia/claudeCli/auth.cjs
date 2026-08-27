const { execFile } = require('child_process');
const { localizarClaudeCli } = require('./localizar.cjs');
const { comandoSpawn } = require('./spawnCli.cjs');
const { tokenSalvo, ambienteCredencial } = require('./estado.cjs');

/**
 * Estado de autenticação do Claude Code CLI nesta máquina.
 *
 * `claude auth status` devolve JSON e funciona com stdio comum (verificado na
 * máquina de produção, versão 2.1.247) — é a fonte de verdade sobre login,
 * melhor que adivinhar pela existência de arquivo de credencial.
 *
 * Por que isso importa pro provedor: existem DUAS credenciais possíveis, e o
 * app aceita as duas.
 *
 *  1. Token OAuth que a GUI guardou (`estado.cjs`), passado por
 *     `CLAUDE_CODE_OAUTH_TOKEN`.
 *  2. O login do próprio CLI nesta máquina (`~/.claude/.credentials.json`,
 *     feito por `claude auth login` / `/login` / extensão do VS Code).
 *
 * Exigir só o (1) era um bug: numa máquina onde o usuário já usa o Claude Code
 * normalmente — o caso desta aqui — o provedor recusaria funcionar com uma
 * credencial perfeitamente válida à disposição, pedindo um login redundante.
 */

const TTL_CACHE_MS = 15000;
let cache = { em: 0, valor: null };

const DESLOGADO = { loggedIn: false, email: null, plano: null, metodo: null };

function rodarAuthStatus() {
  const bin = localizarClaudeCli();
  if (!bin) return Promise.resolve(DESLOGADO);

  // Sem o token no ambiente: aqui a pergunta é "esta MÁQUINA está logada?".
  // Com `CLAUDE_CODE_OAUTH_TOKEN` setado o CLI poderia reportar o estado da
  // credencial de ambiente, e a resposta deixaria de responder isso.
  const env = ambienteCredencial();
  delete env.CLAUDE_CODE_OAUTH_TOKEN;

  const cmd = comandoSpawn(bin, ['auth', 'status']);
  return new Promise((resolve) => {
    // `execFile` pode lançar SINCRONAMENTE (visto na prática: `spawn EFTYPE`
    // quando `CLAUDE_CLI_PATH` aponta pra um arquivo que não é executável) —
    // não é só erro no callback. Sem este try, um caminho mal configurado no
    // .env derrubava a rota de status da tela de Configurações.
    let filho;
    try {
      filho = execFile(cmd.file, cmd.args, { env, timeout: 20000, windowsHide: true, ...cmd.opcoes }, (_err, stdout) => {
        try {
          const dados = JSON.parse(String(stdout).trim());
          resolve({
            loggedIn: Boolean(dados.loggedIn),
            email: dados.email ?? null,
            plano: dados.subscriptionType ?? null,
            metodo: dados.authMethod ?? null,
          });
        } catch {
          // Versão antiga do CLI (sem `auth status`), saída não-JSON ou erro de
          // execução: trata como "não sei se está logado" em vez de propagar —
          // quem chama decide com base no token, que é o outro caminho válido.
          resolve(DESLOGADO);
        }
      });
    } catch {
      return resolve(DESLOGADO);
    }
    filho.on('error', () => resolve(DESLOGADO));
  });
}

/**
 * Login da máquina, com cache curto: é consultado no `GET /api/ia/provedor`
 * (que a tela de Configurações busca) e antes de cada chamada ao CLI. Sem
 * cache, cada mensagem do chat pagaria um processo extra só pra reconfirmar
 * algo que muda de mês em mês.
 */
async function statusAuth({ forcar = false } = {}) {
  if (!forcar && cache.valor && Date.now() - cache.em < TTL_CACHE_MS) return cache.valor;
  const valor = await rodarAuthStatus();
  cache = { em: Date.now(), valor };
  return valor;
}

function limparCacheAuth() {
  cache = { em: 0, valor: null };
}

/** `true` quando existe qualquer credencial usável (token da GUI ou login da máquina). */
async function autenticado() {
  if (tokenSalvo()) return true;
  return (await statusAuth()).loggedIn;
}

module.exports = { statusAuth, limparCacheAuth, autenticado };
