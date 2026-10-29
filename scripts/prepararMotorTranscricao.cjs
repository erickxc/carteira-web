/**
 * Prepara o motor de transcrição do monitorIA nas reuniões nesta máquina:
 * venv Python com faster-whisper, numa pasta da MÁQUINA (não de dados) —
 * `MOTOR_TRANSCRICAO_DIR` ou `%LOCALAPPDATA%\CarteiraWeb\motor-transcricao`.
 * O modelo (~800 MB) baixa sozinho na primeira transcrição, para dentro da
 * mesma pasta (HF_HOME, definido por quem sobe o transcritor).
 *
 *   node scripts/prepararMotorTranscricao.cjs
 *
 * Entrega 1 (dev): usa o Python instalado na máquina. O download sob demanda
 * em Configurações (Python embutido) é de uma entrega futura.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const { dirMotor, pythonDoMotor } = require('../server/reuniao/motor.cjs');

const dir = dirMotor();
fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(pythonDoMotor())) {
  console.log(`Criando venv em ${dir}...`);
  execFileSync('python', ['-m', 'venv', `${dir}/venv`], { stdio: 'inherit' });
}
execFileSync(pythonDoMotor(), ['-m', 'pip', 'install', '-q', 'faster-whisper==1.2.1', 'numpy', 'duckdb', 'soundcard', 'sounddevice'], { stdio: 'inherit' });
console.log(pythonDoMotor());
