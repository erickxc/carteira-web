// Popups do monitorIA: registro em memória (o backend desta máquina serve a página) e
// abertura numa janela própria, sempre por cima e sem tirar o foco (popup-host.ps1 + WebView2).
// Sem WebView2 nesta máquina, cai na notificação curta do Windows — nunca some o aviso.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MAX = 50; // o que passar disso é de reunião antiga; o mais velho sai primeiro
const registro = new Map();

function registrar(popup) {
  const id = crypto.randomBytes(4).toString('hex');
  registro.set(id, { ...popup, id, feito: false, criadoEm: new Date().toISOString() });
  while (registro.size > MAX) registro.delete(registro.keys().next().value);
  return id;
}

const obter = (id) => registro.get(String(id));

function marcarFeito(id) {
  const p = registro.get(String(id));
  if (p) p.feito = true;
  return p;
}

function dirWebView2() {
  return path.join(require('./motor.cjs').dirMotor(), 'webview2');
}

function abrir(id, { indice = 0, urlBase, notificarReserva, spawnar, temWebView2 } = {}) {
  const p = obter(id);
  if (!p) return null;
  const dir = dirWebView2();
  const tem = temWebView2 ? temWebView2() : fs.existsSync(path.join(dir, 'Microsoft.Web.WebView2.WinForms.dll'));
  if (!tem) {
    notificarReserva?.({ titulo: p.titulo, texto: p.numeros?.map((n) => `${n.valor} ${n.rotulo}`).join(' · ') ?? '', acao: p.acao?.titulo });
    return null;
  }
  const { PORT } = require('../config.cjs');
  return abrirJanela(`${urlBase || `http://127.0.0.1:${PORT}`}/api/reuniao/popup/${id}`, ['-Indice', String(indice)], { spawnar });
}

/** Janela própria (popup-host.ps1 + WebView2) com `url`; `extras` são argumentos do host. */
function abrirJanela(url, extras, { spawnar } = {}) {
  const { SQLITE_DIR } = require('../config.cjs');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'popup', 'popup-host.ps1'),
    '-Url', url, ...extras, '-DirWebView2', dirWebView2(), '-DadosWebView2', path.join(SQLITE_DIR, 'popup-webview')];
  if (spawnar) return spawnar('powershell', args);
  // Erro da janela vai para um log: sem isso, um popup que não abre some sem rastro.
  // Sem `detached`: no Windows ele inicia o PowerShell sem console e o PowerShell sai em
  // silêncio, sem rodar o script (visto em 23/10/2026). O filho sobrevive ao pai mesmo assim.
  const log = fs.openSync(path.join(SQLITE_DIR, 'popup-host.log'), 'a');
  const filho = spawn('powershell', args, { stdio: ['ignore', log, log], windowsHide: true });
  fs.closeSync(log); // o filho tem o próprio handle
  filho.on('error', (err) => console.warn(`popup: não abriu — ${err.message}`));
  filho.unref();
  return filho;
}

/**
 * Painel da reunião (tempo, pausar, encerrar, sugestões já enviadas): uma janela só.
 * Abrir de novo com ele aberto não duplica; sem WebView2, não abre (o painel do
 * evento na Carteira faz o mesmo papel).
 */
let painel = null;
function abrirPainel({ urlBase, spawnar } = {}) {
  if (painel && painel.exitCode === null) return painel;
  if (!fs.existsSync(path.join(dirWebView2(), 'Microsoft.Web.WebView2.WinForms.dll'))) return null;
  const { PORT } = require('../config.cjs');
  painel = abrirJanela(`${urlBase || `http://127.0.0.1:${PORT}`}/api/reuniao/painel`, ['-Painel'], { spawnar });
  return painel;
}

/**
 * Um popup por vez: o próximo abre quando o anterior fecha (X ou Feito e fechar). Três
 * popups juntos se sobrepunham e nem cabem na tela (visto em 23/10/2026).
 */
function abrirFila(ids, opcoes = {}) {
  if (!ids.length) return;
  const filho = abrir(ids[0], opcoes);
  if (filho) filho.on('exit', () => abrirFila(ids.slice(1), opcoes));
  else abrirFila(ids.slice(1), opcoes); // sem janela (reserva já notificou): segue a fila
}

// Sugestão de texto da reunião no formato aprovado: título-conclusão + uma ação, sem texto
// corrido (o texto inteiro fica na janela da reunião e na ata).
function popupDeInsight(n) {
  const texto = String(n.mensagem ?? n.texto ?? '').trim();
  const titulo = String(n.manchete ?? '').trim() || (texto.length <= 60 ? texto : `${texto.slice(0, 59).trimEnd()}…`);
  return {
    tipo: 'insight', titulo, numeros: [],
    cliente: [n.rotulo, n.cliente].filter(Boolean).join(' · '),
    acao: { icone: 'perguntar', titulo: String(n.acao ?? '').trim() || 'Detalhe na janela da reunião', sub: '' },
  };
}

// Fila da sessão: um popup por vez, inclusive entre checagens diferentes.
const fila = [];
let aberto = null;
function proximo(opcoes) {
  if ((aberto && aberto.exitCode === null) || !fila.length) return;
  const { id, notificarReserva } = fila.shift();
  aberto = abrir(id, { ...opcoes, notificarReserva });
  if (aberto) aberto.on('exit', () => { aberto = null; proximo(opcoes); });
  else proximo(opcoes);
}

function mostrarInsight(n, { notificarReserva, ...opcoes } = {}) {
  fila.push({ id: registrar(popupDeInsight(n)), notificarReserva });
  proximo(opcoes);
}

module.exports = { registrar, obter, marcarFeito, abrir, abrirFila, abrirPainel, dirWebView2, popupDeInsight, mostrarInsight };
