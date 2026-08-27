/**
 * Gera os rasters do ícone a partir de `public/favicon.svg` — fonte única da
 * arte (logotipo vetorial da 2D). Saídas:
 *   - public/icon-192.png, public/icon-512.png  (ícones do manifest PWA)
 *   - launcher/icone.ico                        (16/32/48/256, multi-resolução)
 *
 * A rasterização usa o Chrome/Edge já instalado em modo headless
 * (`--screenshot`), em vez de uma lib de imagem: o projeto não tem `sharp`/
 * `canvas`, e a versão anterior deste script redesenhava a seta à mão em
 * pixels — o que fazia a arte divergir do SVG a cada ajuste no logotipo.
 * O empacotamento do `.ico` continua sendo feito aqui (o formato aceita PNGs
 * completos como entradas desde o Vista).
 *
 * Uso: node scripts/gerarIconesPwa.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const SVG = path.join(RAIZ, 'public', 'favicon.svg');

const CANDIDATOS_NAVEGADOR = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

function acharNavegador() {
  const achado = CANDIDATOS_NAVEGADOR.find((p) => fs.existsSync(p));
  if (!achado) {
    throw new Error(
      'Chrome/Edge não encontrado para rasterizar o SVG. Instale um dos dois ou ' +
      'aponte CHROME_PATH para o executável.',
    );
  }
  return achado;
}

/** URL file:// do SVG (barras normalizadas e espacos escapados — o caminho de
 * producao tem espaco em "Carteira Web"). */
function urlDoSvg() {
  return 'file:///' + SVG.split(path.sep).join('/').split(' ').join('%20');
}

/** Rasteriza o SVG em N×N via headless screenshot, com fundo transparente
 * (os cantos do ícone são arredondados — sem isso viriam brancos). */
function rasterizar(navegador, tmp, n) {
  const html = path.join(tmp, `icone-${n}.html`);
  const png = path.join(tmp, `icone-${n}.png`);
  fs.writeFileSync(
    html,
    `<body style="margin:0"><img src="${urlDoSvg()}" `
    + `style="display:block;width:${n}px;height:${n}px">`,
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

/** Empacota PNGs num único `.ico` multi-resolução (entradas em PNG, aceitas
 * pelo Windows desde o Vista). */
function gerarIco(tamanhos, imagens) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo 1 = ícone
  header.writeUInt16LE(imagens.length, 4);

  let offset = 6 + imagens.length * 16;
  const entradas = imagens.map((img, i) => {
    const n = tamanhos[i];
    const entrada = Buffer.alloc(16);
    entrada[0] = n >= 256 ? 0 : n; // 0 = 256px, convenção do formato ICO
    entrada[1] = n >= 256 ? 0 : n;
    entrada.writeUInt16LE(1, 4);  // planes
    entrada.writeUInt16LE(32, 6); // bits por pixel
    entrada.writeUInt32LE(img.length, 8);
    entrada.writeUInt32LE(offset, 12);
    offset += img.length;
    return entrada;
  });
  return Buffer.concat([header, ...entradas, ...imagens]);
}

function main() {
  const navegador = acharNavegador();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-icones-'));
  try {
    for (const n of [192, 512]) {
      const destino = path.join(RAIZ, 'public', `icon-${n}.png`);
      fs.writeFileSync(destino, rasterizar(navegador, tmp, n));
      console.log(`Gerado: ${destino}`);
    }

    const tamanhosIco = [16, 32, 48, 256];
    const ico = gerarIco(tamanhosIco, tamanhosIco.map((n) => rasterizar(navegador, tmp, n)));
    const icoDestino = path.join(RAIZ, 'launcher', 'icone.ico');
    fs.writeFileSync(icoDestino, ico);
    console.log(`Gerado: ${icoDestino}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) main();

module.exports = { gerarIco };
