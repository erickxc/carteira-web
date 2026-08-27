/**
 * Como executar o binário do Claude Code CLI sem tomar `EINVAL` nem abrir
 * porta pra injeção de comando.
 *
 * O problema concreto: a instalação nativa do CLI no Windows entrega um
 * `claude.exe`, mas a instalação por npm entrega um SHIM `claude.cmd`. Desde
 * o Node 20, `child_process.spawn` recusa `.cmd`/`.bat` sem `shell: true`
 * (correção de segurança do CVE-2024-27980) — dá `spawn EINVAL`. Pego por
 * teste antes de chegar em produção, e não é caso de laboratório: metade das
 * instalações de CLI por aí é npm.
 *
 * A saída óbvia (`shell: true` sempre) é ruim: nesse modo o Node NÃO escapa os
 * argumentos, ele concatena numa linha de comando do `cmd.exe`. Um argumento
 * com `"`, `&`, `|`, `^` ou `>` — e o system prompt do monitorIA
 * (`normas.cjs`) tem aspas, `%` e setas — deixa de ser argumento e passa a ser
 * sintaxe de shell.
 *
 * Então: `shell` só quando é inevitável (shim `.cmd`/`.bat`), e nesse caso
 * quem chama é obrigado a manter todo argumento simples — ver
 * `precisaShell()`, usado por `cliente.cjs` pra mandar o system prompt pelo
 * STDIN em vez de por `--append-system-prompt`.
 */

const ehShimWindows = (bin) => process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);

/** `true` quando o binário só roda via shell e argumentos ricos são proibidos. */
const precisaShell = (bin) => ehShimWindows(bin);

/**
 * Argumento seguro pra linha de comando do `cmd.exe`. Aspas duplas em volta
 * resolvem espaço; os metacaracteres restantes precisam de `^`. Não é um
 * escape de uso geral (nada é, no `cmd.exe`) — é a rede de segurança pro caso
 * shim, onde os argumentos são flags, aliases e caminhos.
 */
function citarCmd(arg) {
  const texto = String(arg);
  if (/^[A-Za-z0-9_,.:=\-\\/]+$/.test(texto)) return texto;
  return `"${texto.replace(/(["^&|<>%!])/g, '^$1')}"`;
}

/**
 * Devolve `{ file, args, opcoes }` pra passar direto no `spawn`.
 * `opcoes.shell` só vem `true` no caso do shim.
 */
function comandoSpawn(bin, args) {
  if (!ehShimWindows(bin)) return { file: bin, args, opcoes: { shell: false } };
  return { file: citarCmd(bin), args: args.map(citarCmd), opcoes: { shell: true } };
}

module.exports = { comandoSpawn, precisaShell, citarCmd };
