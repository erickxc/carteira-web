// Fonte de áudio de teste: toca um arquivo (gravação de reunião) como se fosse
// a captura ao vivo, soltando pedaços de 30 s na pasta da sessão no ritmo real
// (ou acelerado). Grava em `.tmp` e renomeia: o transcritor nunca lê pedaço pela metade.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PEDACO_SEG = 30;

const rodar = (cmd, args) => new Promise((ok, falha) =>
  execFile(cmd, args, (err, stdout) => (err ? falha(err) : ok(String(stdout).trim()))));

function iniciarFonteSimulada({ arquivo, pasta, faixa = 'sistema', velocidade = 1, inicioSeg = 0 }) {
  let parado = false;
  let acordar = null;
  const esperar = (ms) => new Promise((ok) => { acordar = ok; setTimeout(ok, ms); });

  const concluida = (async () => {
    const duracao = Number(await rodar('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo]));
    for (let n = 1, t = inicioSeg; t < duracao && !parado; n++, t += PEDACO_SEG) {
      const nome = `${faixa}-${String(n).padStart(4, '0')}.wav`;
      const tmp = path.join(pasta, `${nome}.tmp`);
      await rodar('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-t', String(PEDACO_SEG), '-i', arquivo,
        '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
      fs.renameSync(tmp, path.join(pasta, nome));
      if (t + PEDACO_SEG < duracao) await esperar((PEDACO_SEG / velocidade) * 1000);
    }
  })();

  return {
    parar() { parado = true; acordar?.(); },
    concluida,
  };
}

module.exports = { iniciarFonteSimulada };
