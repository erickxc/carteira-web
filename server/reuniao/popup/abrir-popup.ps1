# Abre o popup do monitorIA no canto inferior direito, SEMPRE POR CIMA e SEM roubar o foco
# (o monitor continua no Zoom). O Windows não deixa janela de fundo vir para a frente sozinha
# (ela só pisca na barra de tarefas); HWND_TOPMOST + SWP_NOACTIVATE contorna sem tirar o foco.
#
# O Edge cria uma janela provisória e troca pela definitiva logo depois (visto em 23/10/2026:
# marcar só a primeira deixava a definitiva em segundo plano). Por isso o laço reaplica em
# toda janela com o título por até ~15 s (Edge frio demora) e só sai depois de CONFIRMAR o
# estilo topmost na final.
# O título vem em base64 (UTF-8): o PowerShell 5.1 deforma "·" e acentos vindos por argumento,
# e a busca pela janela usa o título exato — deformado, nunca acha (visto em 23/10/2026).
param([string]$Url, [string]$TituloB64, [int]$W = 436, [int]$H = 400, [int]$Indice = 0)
$Titulo = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TituloB64))

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class PopupJanela {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr depois, int x, int y, int cx, int cy, uint flags);
  public static List<IntPtr> Achar(string titulo) {
    var achadas = new List<IntPtr>();
    EnumWindows((h, p) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256);
      if (IsWindowVisible(h) && sb.ToString() == titulo) achadas.Add(h); return true; }, IntPtr.Zero);
    return achadas;
  }
  public static bool PorCima(IntPtr h) { return (GetWindowLong(h, -20) & 0x8) != 0; }
}
"@

$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$x = $area.Right - $W - 12
$y = [Math]::Max($area.Top, $area.Bottom - ($H + 10) * ($Indice + 1) - 2)
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { "edge nao encontrado"; exit 2 }
Start-Process $edge -ArgumentList "--app=$Url", "--window-size=$W,$H", "--window-position=$x,$y", "--user-data-dir=$env:LOCALAPPDATA\CarteiraWeb\popup-perfil"

$TOPMOST = [IntPtr](-1); $SEM_FOCO = 0x0010; $MOSTRAR = 0x0040; $SEM_TAMANHO = 0x0001; $SEM_MOVER = 0x0002
$confirmadas = 0
for ($i = 0; $i -lt 100; $i++) {
  Start-Sleep -Milliseconds 150
  $janelas = [PopupJanela]::Achar($Titulo)
  # Só a ordem (por cima): tamanho e posição finais são da própria página, que se ajusta ao conteúdo.
  foreach ($h in $janelas) { [void][PopupJanela]::SetWindowPos($h, $TOPMOST, 0, 0, 0, 0, $SEM_FOCO -bor $MOSTRAR -bor $SEM_MOVER -bor $SEM_TAMANHO) }
  if ($janelas.Count -gt 0 -and @($janelas | Where-Object { [PopupJanela]::PorCima($_) }).Count -eq $janelas.Count) { $confirmadas++ } else { $confirmadas = 0 }
  if ($confirmadas -ge 8) { "popup por cima ($([Math]::Round($i * 0.15, 1)) s)"; exit 0 }   # estável por ~1,2 s
}
"popup aberto, mas nao confirmado por cima"; exit 1
