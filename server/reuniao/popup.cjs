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
  const { PORT, SQLITE_DIR } = require('../config.cjs');
  const url = `${urlBase || `http://127.0.0.1:${PORT}`}/api/reuniao/popup/${id}`;
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, 'popup', 'popup-host.ps1'),
    '-Url', url, '-Indice', String(indice), '-DirWebView2', dir, '-DadosWebView2', path.join(SQLITE_DIR, 'popup-webview')];
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
 * Um popup por vez: o próximo abre quando o anterior fecha (X ou Feito e fechar). Três
 * popups juntos se sobrepunham e nem cabem na tela (visto em 23/10/2026).
 */
function abrirFila(ids, opcoes = {}) {
  if (!ids.length) return;
  const filho = abrir(ids[0], opcoes);
  if (filho) filho.on('exit', () => abrirFila(ids.slice(1), opcoes));
  else abrirFila(ids.slice(1), opcoes); // sem janela (reserva já notificou): segue a fila
}

module.exports = { registrar, obter, marcarFeito, abrir, abrirFila, dirWebView2 };
