# Janela do popup do monitorIA: janela PRÓPRIA, sempre por cima e sem ativar, com o popup
# (HTML aprovado) dentro de um WebView2. Por que não o Edge --app: o Windows não deixa um
# processo em segundo plano pôr a janela de OUTRO programa por cima (testado em 23/10/2026:
# ficava atrás, só piscando na barra de tarefas); janela própria criada como topmost aparece
# na frente sem tirar o foco do Zoom — como o aviso de chamada do Teams.
#
# A página manda pelo WebView2: { altura } -> a janela se ajusta e aparece; { fechar } -> fecha.
# Links (Ver na Carteira) abrem no navegador padrão.
param([string]$Url, [int]$Indice = 0, [string]$DirWebView2, [string]$DadosWebView2)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Path (Join-Path $DirWebView2 'Microsoft.Web.WebView2.Core.dll')
Add-Type -Path (Join-Path $DirWebView2 'Microsoft.Web.WebView2.WinForms.dll')
[Microsoft.Web.WebView2.Core.CoreWebView2Environment]::SetLoaderDllFolderPath($DirWebView2)

$refs = @('System.Windows.Forms', 'System.Drawing', (Join-Path $DirWebView2 'Microsoft.Web.WebView2.Core.dll'), (Join-Path $DirWebView2 'Microsoft.Web.WebView2.WinForms.dll'))
Add-Type -ReferencedAssemblies $refs @"
using System; using System.Diagnostics; using System.Drawing; using System.Runtime.InteropServices; using System.Windows.Forms;
using Microsoft.Web.WebView2.Core; using Microsoft.Web.WebView2.WinForms;
public class PopupMonitorIA : Form {
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int v, int size);
  const int LARGURA = 436, MARGEM = 12, ESPACO = 10;
  readonly int indice; readonly string url, dados; readonly WebView2 web = new WebView2(); bool carregou;
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams { get {
    var cp = base.CreateParams; cp.ExStyle |= 0x8 | 0x08000000 | 0x80; return cp; } } // TOPMOST | NOACTIVATE | TOOLWINDOW
  public PopupMonitorIA(string url, int indice, string dados) {
    this.url = url; this.indice = indice; this.dados = dados;
    FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual;
    BackColor = Color.FromArgb(11, 11, 13); Opacity = 0; Width = LARGURA; Height = 360; Posicionar();
    web.Dock = DockStyle.Fill; web.DefaultBackgroundColor = Color.FromArgb(11, 11, 13); Controls.Add(web);
    Load += async (o, e) => {
      int redondo = 2; DwmSetWindowAttribute(Handle, 33, ref redondo, 4);   // cantos arredondados (Windows 11)
      try {
        var env = await CoreWebView2Environment.CreateAsync(null, dados);
        await web.EnsureCoreWebView2Async(env);
        var c = web.CoreWebView2.Settings; c.AreDefaultContextMenusEnabled = false; c.AreDevToolsEnabled = false; c.IsZoomControlEnabled = false; c.IsStatusBarEnabled = false;
        web.CoreWebView2.NewWindowRequested += (s, a) => { a.Handled = true; Abrir(a.Uri); };
        // A 1ª navegação é o próprio popup (o WebView2 normaliza o endereço; comparar exato bloqueava). Depois, link abre no navegador.
        web.CoreWebView2.NavigationStarting += (s, a) => { if (carregou) { a.Cancel = true; Abrir(a.Uri); } };
        web.CoreWebView2.NavigationCompleted += (s, a) => { carregou = true; };
        web.CoreWebView2.WebMessageReceived += (s, a) => Mensagem(a.WebMessageAsJson);
        web.CoreWebView2.Navigate(this.url);
        var reserva = new Timer { Interval = 3000 }; reserva.Tick += (s, a) => { reserva.Stop(); if (Opacity == 0) Opacity = 1; }; reserva.Start();
      } catch (Exception ex) { Console.Error.WriteLine("webview2: " + ex.Message); Environment.ExitCode = 3; Close(); }
    };
  }
  void Abrir(string uri) { try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true }); } catch { } }
  void Posicionar() {
    var a = Screen.PrimaryScreen.WorkingArea;
    Left = a.Right - Width - MARGEM;
    Top = Math.Max(a.Top + MARGEM, a.Bottom - MARGEM - (Height + ESPACO) * (indice + 1) + ESPACO);
  }
  void Mensagem(string json) {
    if (json.Contains("\"fechar\"")) { Close(); return; }
    var i = json.IndexOf("\"altura\"");
    if (i < 0) return;
    int altura; var resto = json.Substring(i + 9).Trim(' ', ':', '}');
    if (int.TryParse(resto.Split(',', '}')[0].Trim(), out altura) && altura > 80 && altura < 1200) { Height = altura; Posicionar(); Opacity = 1; }
  }
}
"@

$janela = New-Object PopupMonitorIA($Url, $Indice, $DadosWebView2)
[System.Windows.Forms.Application]::Run($janela)
exit $LASTEXITCODE
