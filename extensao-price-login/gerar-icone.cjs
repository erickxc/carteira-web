/**
 * Gera o ícone da extensão (16/32/48/128) a partir de `logo-2d.svg` — mesma
 * arte da 2D Consultores usada no resto do app (cópia de
 * `src/assets/logo-2d.svg`; copiar de novo aqui se o original mudar). O SVG
 * não é quadrado (viewBox 347x215, plate + seta), então o `<img>` é
 * centralizado dentro de um quadro quadrado por flexbox em vez de esticado —
 * esticar deformaria a placa arredondada numa oval.
 *
 * Mesma técnica de `scripts/gerarIconesPwa.cjs` (Chrome/Edge headless
 * `--screenshot`, sem depender de `sharp`/`canvas`).
 *
 * Uso: node gerar-icone.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SVG = path.join(__dirname, 'logo-2d.svg');

const CANDIDATOS_NAVEGADOR = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

function acharNavegador() {
  const achado = CANDIDATOS_NAVEGADOR.find((p) => fs.existsSync(p));
  if (!achado) throw new Error('Chrome/Edge não encontrado. Aponte CHROME_PATH pro executável.');
  return achado;
}

function urlDoSvg() {
  return 'file:///' + SVG.split(path.sep).join('/').split(' ').join('%20');
}

function rasterizar(navegador, tmp, n) {
  const html = path.join(tmp, `icone-${n}.html`);
  const png = path.join(tmp, `icone-${n}.png`);
  fs.writeFileSync(
    html,
    `<body style="margin:0"><div style="width:${n}px;height:${n}px;display:flex;align-items:center;`
    + `justify-content:center;overflow:hidden"><img src="${urlDoSvg()}" style="width:100%;height:auto">`
    + `</div></body>`,
  );
  execFileSync(navegador, [
    '--headless', '--disable-gpu', '--allow-file-access-from-files',
    '--default-background-color=00000000',
    `--window-size=${n},${n}`,
    `--screenshot=${png}`,
    html,
  ], { stdio: 'ignore' });
  return fs.readFileSync(png);
}

function main() {
  const navegador = acharNavegador();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-icone-'));
  try {
    for (const n of [16, 32, 48, 128]) {
      const destino = path.join(__dirname, `icone-${n}.png`);
      fs.writeFileSync(destino, rasterizar(navegador, tmp, n));
      console.log(`Gerado: ${destino}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
