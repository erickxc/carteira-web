/**
 * Uma linha por troca de versão, por máquina, em
 * `DATA_DIR/maquinas/<computador>.log` (data, versão, modo). Responde "quem
 * já atualizou?" sem acesso às outras máquinas — só o OneDrive é comum.
 * Um arquivo por máquina de propósito: um único arquivo escrito por 4
 * máquinas viraria cópia de conflito do OneDrive.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR } = require('./config.cjs');
const { APP_MODE } = require('./modo.cjs');
const { version } = require('../package.json');

function registrarVersao({ dir = path.join(DATA_DIR, 'maquinas'), versao = version, agora = new Date() } = {}) {
  const arquivo = path.join(dir, `${os.hostname()}.log`);
  let ultima = '';
  try { ultima = fs.readFileSync(arquivo, 'utf8').trim().split('\n').pop(); } catch { /* primeira vez */ }
  if (ultima.split('\t')[1] === versao) return false;
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(arquivo, `${agora.toISOString()}\t${versao}\t${APP_MODE}\n`);
  return true;
}

module.exports = { registrarVersao };
