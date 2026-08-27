/**
 * Ícone na bandeja do Windows enquanto o sistema está rodando.
 *
 * Sem isso o app é invisível: o launcher é GUI, o servidor roda oculto e a
 * única pista de que está no ar é o navegador aberto. Fechou a aba, não há
 * como reabrir nem encerrar sem ir no Gerenciador de Tarefas.
 *
 * Implementado com `NotifyIcon` do WinForms via PowerShell — não com um
 * módulo nativo (`systray`, `node-notifier` e afins): qualquer dependência
 * com binário próprio teria que ser compilada/embutida no pacote da release e
 * sobreviver ao `pkg`, e este projeto já apanhou disso (ver
 * `server/scripts/publicarRelease.cjs` sobre o `better-sqlite3`). O PowerShell
 * com WinForms já vem no Windows, custo zero de dependência.
 *
 * A bandeja é um processo SEPARADO, de propósito: se ela morrer, o servidor
 * segue de pé; e ela se encerra sozinha quando o servidor sai (o timer no
 * script vigia o PID) — importante no "Atualizar agora", que derruba o
 * servidor pra reabrir o `.exe`: sem isso ficaria um ícone fantasma na
 * bandeja a cada atualização.
 *
 * `-EncodedCommand` (Base64), não `-File <script.ps1 em %TEMP%>`: bug real
 * relatado — em algumas máquinas (provavelmente com antivírus/EDR corporativo
 * ou AppLocker) o ícone simplesmente não aparecia, sem pista nenhuma de por
 * quê (stdio ia todo pro vácuo). "Escrever um .ps1 em %TEMP% e rodar com
 * -ExecutionPolicy Bypass -WindowStyle Hidden" é um padrão clássico que esse
 * tipo de proteção costuma barrar — `-EncodedCommand` não grava arquivo
 * nenhum em disco, o que já evita boa parte dessas regras por caminho. E
 * agora que o stdout/stderr do PowerShell é capturado (não mais `'ignore'`),
 * se ainda assim falhar em alguma máquina, o motivo fica no `launcher.log`.
 */
const { spawn } = require('child_process');

/** Aspas simples são o escape do PowerShell dentro de string literal — dobrar. */
function aspasPs(valor) {
  return String(valor).replace(/'/g, "''");
}

/**
 * `-STA` e `Application]::Run()` não são detalhe: WinForms exige apartamento
 * STA e um laço de mensagens vivo, senão o ícone aparece e não responde a
 * clique nenhum.
 */
function gerarScript({ porta, icone, pid }) {
  const url = `http://127.0.0.1:${Number(porta)}/`;
  const linhaIcone = icone
    ? `$ni.Icon = New-Object System.Drawing.Icon('${aspasPs(icone)}')`
    : `$ni.Icon = [System.Drawing.SystemIcons]::Application`;

  return `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$url = '${aspasPs(url)}'
$pidServidor = ${Number(pid)}

$ni = New-Object System.Windows.Forms.NotifyIcon
${linhaIcone}
$ni.Text = 'CARTEIRA 2D'
$ni.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$abrir = $menu.Items.Add('Abrir CARTEIRA 2D')
$abrir.add_Click({ Start-Process $url })
$sair = $menu.Items.Add('Sair (encerra o sistema)')
$sair.add_Click({
  $ni.Visible = $false
  Stop-Process -Id $pidServidor -Force -ErrorAction SilentlyContinue
  [System.Windows.Forms.Application]::Exit()
})
$ni.ContextMenuStrip = $menu
$ni.add_MouseDoubleClick({ Start-Process $url })

# Some junto com o servidor: sem esta vigia, cada reinício (ex.: "Atualizar
# agora") deixaria um ícone morto na bandeja.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.add_Tick({
  if (-not (Get-Process -Id $pidServidor -ErrorAction SilentlyContinue)) {
    $ni.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
`;
}

/**
 * Nunca lança: bandeja é conveniência, não pode derrubar o servidor. Devolve
 * `null` quando não dá pra abrir (outro sistema operacional, PowerShell
 * bloqueado por política, antivírus barrando o processo, etc.) — nesses
 * casos o motivo vai pro `log` (stderr do PowerShell + erros do próprio
 * `spawn`), nunca falha em silêncio.
 */
function abrirBandeja({ porta, icone, pid = process.pid, log = () => {} } = {}) {
  if (process.platform !== 'win32') return null;
  try {
    // `-EncodedCommand` espera UTF-16LE em Base64 — convenção própria do
    // PowerShell (não é o UTF-8 de sempre), documentada em `powershell -?`.
    const comando = Buffer.from(gerarScript({ porta, icone, pid }), 'utf16le').toString('base64');
    const filho = spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-WindowStyle', 'Hidden', '-EncodedCommand', comando],
      { detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    filho.stdout.on('data', (d) => log(`Bandeja: ${d.toString('utf8').trim()}`));
    filho.stderr.on('data', (d) => log(`Bandeja (erro): ${d.toString('utf8').trim()}`));
    filho.on('error', (err) => log(`Bandeja: não foi possível abrir o ícone (${err.message}) — seguindo sem ele.`));
    filho.unref();
    return filho;
  } catch (err) {
    log(`Bandeja: não foi possível abrir o ícone (${err.message}) — seguindo sem ele.`);
    return null;
  }
}

module.exports = { abrirBandeja, gerarScript };
