// Onde mora o motor de transcrição nesta máquina. É da MÁQUINA, não dos dados:
// fica fora de SQLITE_DIR para a cópia de dev (.dev/sqlite) não duplicar ~1 GB.
const path = require('path');
const os = require('os');

function dirMotor() {
  return process.env.MOTOR_TRANSCRICAO_DIR
    || path.join(process.env.LOCALAPPDATA || os.homedir(), 'CarteiraWeb', 'motor-transcricao');
}

function pythonDoMotor() {
  return process.env.TRANSCRICAO_PYTHON || path.join(dirMotor(), 'venv', 'Scripts', 'python.exe');
}

module.exports = { dirMotor, pythonDoMotor };
