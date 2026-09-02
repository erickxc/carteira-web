const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { CLAUDE_CLI_PATH } = require('../../config.cjs');
const { comandoSpawn } = require('./spawnCli.cjs');

/**
 * Localiza o executável do Claude Code CLI nesta máquina.
 *
 * Existe porque `claude` NO PATH não é garantia nenhuma no ambiente real de
 * produção: o backend sobe pelo launcher (`.exe` do `pkg`, registrado em
 * `HKCU\\...\\Run`), que herda um ambiente enxuto — o mesmo motivo de
 * `NODE_PORTATIL_PATH` existir pro Node portátil. Além disso a instalação
 * nativa do CLI grava em `%USERPROFILE%\\.local\\bin`, que só entra no PATH
 * depois de reabrir a sessão.
 *
 * Ordem: `CLAUDE_CLI_PATH` do `.env` → `where`/`which` → caminhos conhecidos
 * de cada método de instalação. Resultado é cacheado só quando encontrado —
 * assim instalar o CLI com o backend de pé passa a funcionar sem reiniciar.
 */

const CANDIDATOS = () => {
  const home = os.homedir();
  const win = process.platform === 'win32';
  const nomes = win ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const bases = [
    path.join(home, '.local', 'bin'),
    ...(win
      ? [
        path.join(process.env.LOCALAPPDATA || home, 'Programs', 'claude'),
        path.join(process.env.APPDATA || home, 'npm'),
        'C:\\Program Files\\Anthropic\\Claude Code',
      ]
      : ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin']),
  ];
  return bases.flatMap((base) => nomes.map((nome) => path.join(base, nome)));
};

function noPath() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const saida = execFileSync(cmd, ['claude'], {
      encoding: 'utf8', timeout: 5000, windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const linhas = saida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // No Windows, a instalação por npm grava 3 arquivos no mesmo diretório:
    // `claude` (script Bash, pra Git Bash/WSL), `claude.cmd` (shim do
    // cmd.exe) e `claude.ps1`. O `where claude` lista os três, e nada garante
    // que `claude.cmd` vem primeiro — já visto na prática o Bash sem extensão
    // na frente. `spawn` (sem `shell: true`) não sabe executar um script Bash
    // direto no Windows: falha com ENOENT mesmo o arquivo existindo no disco.
    // Por isso prioriza extensão executável reconhecida (.exe/.cmd/.bat);
    // só cai pra primeira linha crua se nada bater (ex.: ambiente Git Bash
    // puro, sem where.exe do Windows envolvido).
    const escolhida = process.platform === 'win32'
      ? linhas.find((l) => /\.(exe|cmd|bat)$/i.test(l)) || linhas[0]
      : linhas[0];
    return escolhida && fs.existsSync(escolhida) ? escolhida : null;
  } catch {
    return null;
  }
}

let cache = null;

function localizarClaudeCli() {
  if (cache) return cache;
  if (CLAUDE_CLI_PATH) {
    // Caminho explícito não cai em fallback: se o usuário apontou e está
    // errado, o erro tem que aparecer, não virar "achei outro por sorte".
    if (!fs.existsSync(CLAUDE_CLI_PATH)) return null;
    cache = CLAUDE_CLI_PATH;
    return cache;
  }
  const achado = noPath() || CANDIDATOS().find((c) => fs.existsSync(c)) || null;
  if (achado) cache = achado;
  return achado;
}

/**
 * Versão instalada (`claude --version`), ou `null` se não der pra executar.
 * Passa por `comandoSpawn` (mesma lógica de `cliente.cjs`) porque `bin` pode
 * ser um shim `.cmd` — sem `shell: true` nesse caso, o Node recusa com
 * `EINVAL` (Node 20+, CVE-2024-27980) e isto voltaria `null` mesmo com o CLI
 * instalado e funcional.
 */
function versaoClaudeCli(bin = localizarClaudeCli()) {
  if (!bin) return null;
  try {
    const { file, args, opcoes } = comandoSpawn(bin, ['--version']);
    return execFileSync(file, args, { encoding: 'utf8', timeout: 15000, windowsHide: true, shell: opcoes.shell }).trim() || null;
  } catch {
    return null;
  }
}

function limparCacheLocalizacao() {
  cache = null;
}

module.exports = { localizarClaudeCli, versaoClaudeCli, limparCacheLocalizacao };
