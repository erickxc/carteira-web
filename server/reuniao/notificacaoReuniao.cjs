// Notificação GRANDE do Windows para os insights da reunião (o toast simples de
// `server/notificacoes.cjs` corta o texto em ~4 linhas). Formato ToastGeneric:
// título, texto, "o que fazer", fontes no rodapé e botão que abre o evento.
// Fica na tela até ser dispensada (`scenario="reminder"`): o monitor está
// conversando e não pode perder o aviso em 5 s.
//
// O XML vai em base64 (UTF-8) por variável de ambiente: o PowerShell 5.1 lê
// script e argumentos em ANSI e estragava acento e símbolo ("·", "→").
const { spawn } = require('child_process');
const { ICONE } = require('../notificacoes.cjs');

const APP_ID = 'CARTEIRA 2D - monitorIA';

const esc = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// O balão mostra ~4 linhas no corpo: texto longo empurrava a ação para fora
// (visto em 23/10/2026). O texto completo fica no evento ("Ver na Carteira").
const TETO_TEXTO = 130;
const TETO_ACAO = 80;

// O modelo devolve markdown; no balão, asterisco e crase viram texto.
const semMarkdown = (t) => String(t ?? '').replace(/\*\*|__|`/g, '').replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:!?])/g, '$1$2').trim();

function cortar(t, teto) {
  return t.length <= teto ? t : `${t.slice(0, teto - 1).trimEnd()}…`;
}

function montarXmlToast({ titulo, texto, acao, fontes, link, icone = ICONE }) {
  const corpo = cortar(semMarkdown(texto), TETO_TEXTO);
  const fazer = acao ? cortar(semMarkdown(acao), TETO_ACAO) : '';
  const textos = [
    `<text hint-maxLines="2">${esc(semMarkdown(titulo))}</text>`,
    `<text>${esc(corpo)}</text>`,
    fazer ? `<text>${esc(fazer)}</text>` : '',
    fontes ? `<text placement="attribution">Fontes: ${esc(fontes)}</text>` : '',
  ].filter(Boolean).join('');
  const abrir = link ? ` launch="${esc(link)}" activationType="protocol"` : '';
  // "Dispensar" vai sempre: toast "reminder" sem nenhum botão o Windows descarta em silêncio.
  const verNaCarteira = link ? `<action content="Ver na Carteira" activationType="protocol" arguments="${esc(link)}"/>` : '';
  const acoes = `<actions>${verNaCarteira}<action content="Dispensar" activationType="system" arguments="dismiss"/></actions>`;
  return `<toast scenario="reminder"${abrir}><visual><binding template="ToastGeneric">`
    + `<image placement="appLogoOverride" src="${esc(icone)}"/>${textos}</binding></visual>${acoes}</toast>`;
}

const SCRIPT = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TOAST_XML)))
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:TOAST_APP).Show([Windows.UI.Notifications.ToastNotification]::new($doc))
`;

function notificarReuniao(dados) {
  try {
    const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
      env: { ...process.env, TOAST_XML: Buffer.from(montarXmlToast(dados), 'utf8').toString('base64'), TOAST_APP: APP_ID },
      windowsHide: true,
      stdio: 'ignore',
    });
    proc.on('error', (err) => console.warn(`reunião: notificação falhou — ${err.message}`));
  } catch (err) {
    console.warn(`reunião: notificação falhou — ${err.message}`);
  }
}

module.exports = { montarXmlToast, notificarReuniao };
