const { execFileSync } = require('child_process');

/**
 * Fecha uma Carteira de OUTRA versão que ficou de pé na porta.
 *
 * Bug real (20/10/2026): a máquina já estava na 1.6.3, mas a tela continuava
 * a antiga. Ao abrir o `.exe`, `servidorJaNoAr()` encontrava um servidor
 * respondendo na porta e só abria o navegador NELE — se esse processo era de
 * uma versão anterior (launcher velho que sobreviveu, boot antigo, instalação
 * em outra pasta), a pessoa ficava presa nele para sempre. Agora o launcher
 * pergunta a versão de quem está no ar e, se não for a que deveria rodar,
 * encerra o servidor E o launcher dono dele (senão o launcher velho, ao ver o
 * filho cair, reiniciaria o servidor antigo — ver `subirServidor`).
 *
 * Só encerra processo que se prova da Carteira (nome do executável ou linha de
 * comando). Qualquer outra coisa na porta fica intocada: matar processo alheio
 * por engano é pior que abrir na versão velha.
 */

/** PIDs ouvindo (LISTENING) na porta, a partir da saída de `netstat -ano -p tcp`. */
function pidsNaPorta(netstatTexto, porta) {
  const pids = new Set();
  for (const linha of String(netstatTexto).split(/\r?\n/)) {
    const col = linha.trim().split(/\s+/);
    // TCP  127.0.0.1:3011  0.0.0.0:0  LISTENING  17664
    if (col.length < 5 || !/^TCP$/i.test(col[0])) continue;
    if (!col[1].endsWith(`:${porta}`)) continue;
    if (!/^LISTEN/i.test(col[3])) continue;
    const pid = Number(col[4]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/** Servidor da Carteira: o Node portátil renomeado, ou um node rodando o entrypoint dela. */
function ehServidorDaCarteira(info) {
  if (!info) return false;
  const nome = String(info.Name || '');
  if (/^2D_Carteira_Servidor\.exe$/i.test(nome)) return true;
  const cmd = String(info.CommandLine || '');
  return /^node(\.exe)?$/i.test(nome) && /(inicio|server)\.cjs/i.test(cmd) && /carteira/i.test(cmd);
}

/** Launcher da Carteira (nome atual ou o antigo, `CarteiraLauncher.exe`). */
function ehLauncherDaCarteira(info) {
  if (!info) return false;
  return /^(2D_Carteira|CarteiraLauncher)[^\\/]*\.exe$/i.test(String(info.Name || '')) && !/Servidor/i.test(String(info.Name || ''));
}

function lerNetstat() {
  return execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
}

/** Nome, linha de comando e PID do pai de um processo (via CIM, sem dependência nativa). */
function lerProcesso(pid) {
  try {
    const saida = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}" | Select-Object Name,CommandLine,ParentProcessId | ConvertTo-Json -Compress`,
    ], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    return saida.trim() ? JSON.parse(saida) : null;
  } catch {
    return null;
  }
}

function matarArvore(pid) {
  execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}

/**
 * Encerra a Carteira que está ouvindo na porta. Devolve `true` se encerrou
 * (ou se a porta já estava livre), `false` se havia algo que não se provou da
 * Carteira — nesse caso nada é encerrado.
 */
function encerrarCarteiraNaPorta(porta, { registrarLog = () => {}, meuPid = process.pid, deps = {} } = {}) {
  const netstat = deps.lerNetstat || lerNetstat;
  const processo = deps.lerProcesso || lerProcesso;
  const matar = deps.matarArvore || matarArvore;

  let pids;
  try { pids = pidsNaPorta(netstat(), porta); } catch (err) {
    registrarLog(`Launcher: não consegui listar quem usa a porta ${porta} (${err.message}).`);
    return false;
  }
  if (pids.length === 0) return true;

  for (const pid of pids) {
    if (pid === meuPid) continue;
    const info = processo(pid);
    if (!ehServidorDaCarteira(info)) {
      registrarLog(`Launcher: a porta ${porta} está com outro programa (PID ${pid}, ${info?.Name || 'desconhecido'}) — não encerro.`);
      return false;
    }
    // Mata pelo launcher pai quando ele é da Carteira: a árvore (/T) leva o
    // servidor junto, e o launcher velho não fica vivo para reiniciá-lo.
    const pai = info.ParentProcessId ? processo(info.ParentProcessId) : null;
    const alvo = pai && ehLauncherDaCarteira(pai) && info.ParentProcessId !== meuPid ? info.ParentProcessId : pid;
    try {
      matar(alvo);
      registrarLog(`Launcher: encerrei a Carteira anterior (PID ${alvo}${alvo !== pid ? `, launcher do servidor ${pid}` : ''}).`);
    } catch (err) {
      registrarLog(`Launcher: falha ao encerrar a Carteira anterior (PID ${alvo}): ${err.message}`);
      return false;
    }
  }
  return true;
}

/** Espera a porta liberar depois do encerramento (até ~6s). */
async function esperarPortaLivre(porta, { tentativas = 30, intervaloMs = 200, deps = {} } = {}) {
  const netstat = deps.lerNetstat || lerNetstat;
  for (let i = 0; i < tentativas; i++) {
    try { if (pidsNaPorta(netstat(), porta).length === 0) return true; } catch { return false; }
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return false;
}

module.exports = { pidsNaPorta, ehServidorDaCarteira, ehLauncherDaCarteira, encerrarCarteiraNaPorta, esperarPortaLivre };
