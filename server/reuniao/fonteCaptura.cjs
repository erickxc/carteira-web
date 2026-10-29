// Fonte de áudio ao vivo: `captura.py` (no Python do motor) grava microfone e
// som do computador na pasta da sessão, no mesmo formato da fonte simulada.
// Para pelo arquivo `PARAR` que a sessão já cria; se não sair sozinho em 15 s,
// é encerrado e o marcador `captura.viva` é apagado para o transcritor terminar.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ESPERA_SAIDA_MS = 15_000;

function iniciarCaptura({ pasta, spawnCaptura }) {
  const proc = spawnCaptura({ pasta });
  let erroSaida = '';
  proc.stderr?.on('data', (d) => { erroSaida += String(d); });
  const concluida = new Promise((ok) => proc.on('exit', (codigo) => {
    if (codigo) console.warn(`reunião: captura saiu com ${codigo}: ${erroSaida.trim().slice(-500)}`);
    ok(codigo);
  }));

  return {
    parar() {
      fs.writeFileSync(path.join(pasta, 'PARAR'), '');
      const t = setTimeout(() => {
        try { proc.kill(); } catch { /* já saiu */ }
        fs.rmSync(path.join(pasta, 'captura.viva'), { force: true });
      }, ESPERA_SAIDA_MS);
      concluida.then(() => clearTimeout(t));
    },
    concluida,
  };
}

function spawnCapturaReal({ pasta }) {
  const { pythonDoMotor } = require('./motor.cjs');
  return spawn(pythonDoMotor(), [path.join(__dirname, 'captura.py'), '--pasta', pasta],
    { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
}

module.exports = { iniciarCaptura, spawnCapturaReal };
