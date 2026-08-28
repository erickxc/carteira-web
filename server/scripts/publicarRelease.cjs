const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// `npm` no Windows é `npm.cmd` — `execFileSync` sem `shell: true` não consegue
// rodar `.cmd` (EINVAL, limitação do Node, não alternativa). `shell: true`
// gera o aviso DEP0190 (args concatenados, não escapados) porque em geral
// isso é risco de injeção — mas aqui os argumentos são sempre literais fixos
// deste próprio arquivo (nunca entrada externa/do usuário), então não há
// nada pra injetar.
const NPM_BIN = 'npm';
const AdmZip = require('adm-zip');
const { novidadesDaVersao } = require('../novidades.cjs');
const { BACKUP_ONEDRIVE_DIR } = require('../config.cjs');

const RAIZ = path.join(__dirname, '..', '..'); // raiz do projeto
const RELEASES_DIR = path.join(BACKUP_ONEDRIVE_DIR, 'releases');

function lerVersaoPackageJson(raiz = RAIZ) {
  const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  return pkg.version;
}

/**
 * Staging isolado com só as dependências de PRODUÇÃO. Copia o `node_modules`
 * JÁ instalado do projeto (com os binários nativos já compilados/baixados)
 * em vez de rodar `npm install` do zero no staging: `better-sqlite3` não tem
 * prebuild pra toda combinação de Node/arch, e uma instalação do zero cai
 * pra compilar via `node-gyp` — que exige Visual Studio Build Tools
 * instalado, o que não é garantido na máquina que publica a release (foi o
 * que quebrou na primeira tentativa real deste script). `npm prune` só
 * remove pastas, não recompila nada.
 */
/**
 * Pacotes que o SERVIDOR realmente exige em runtime. Tudo que é só de
 * frontend (React, lucide, jspdf, dnd-kit...) já está COMPILADO dentro de
 * `dist/` — mandar o pacote-fonte junto é peso puro.
 *
 * Era o caso até a v1.2.34: a release levava os 194 pacotes de
 * `dependencies`, 20.668 arquivos, ~183 MB só de `node_modules` (jspdf 28,8 MB
 * + lucide-react 28,8 MB + cache `.vite` 16,5 MB, nada disso usado pelo
 * `server.cjs`). Resultado: 85 MB de download e 274 MB / 20.820 arquivos pra
 * descompactar a cada atualização, numa pasta sincronizada pelo OneDrive —
 * daí a lentidão.
 *
 * Lista explícita, e não heurística, de propósito: um `require` novo no
 * servidor tem que aparecer aqui conscientemente. `verificarDepsDoServidor`
 * abaixo falha o build se alguém esquecer.
 */
const DEPS_SERVIDOR = [
  'adm-zip', 'better-sqlite3', 'cors', 'date-fns', 'express',
  'google-auth-library', 'multer', 'node-cron', 'xlsx', 'zod',
];

/**
 * Varre os `.cjs` do servidor e confere que todo pacote `require`ado está em
 * `DEPS_SERVIDOR`. Sem isso, adicionar um `require` novo geraria uma release
 * que quebra só na máquina de destino ("Cannot find module"), longe de quem
 * publicou.
 */
function verificarDepsDoServidor(raiz = RAIZ) {
  const todasDeps = Object.keys(JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).dependencies);
  const arquivos = [];
  (function varrer(dir) {
    for (const nome of fs.readdirSync(dir)) {
      const completo = path.join(dir, nome);
      if (fs.statSync(completo).isDirectory()) {
        if (!/^(node_modules|dist)$/.test(nome)) varrer(completo);
      } else if (nome.endsWith('.cjs')) {
        arquivos.push(completo);
      }
    }
  })(path.join(raiz, 'server'));
  arquivos.push(path.join(raiz, 'server.cjs'), path.join(raiz, 'inicio.cjs'));

  const faltando = new Set();
  for (const arquivo of arquivos) {
    const src = fs.readFileSync(arquivo, 'utf8');
    for (const dep of todasDeps) {
      if (DEPS_SERVIDOR.includes(dep)) continue;
      if (src.includes(`require('${dep}')`) || src.includes(`require('${dep}/`)) faltando.add(dep);
    }
  }
  if (faltando.size) {
    throw new Error(
      `publicarRelease: o servidor usa pacote(s) fora de DEPS_SERVIDOR: ${[...faltando].join(', ')}. `
      + 'Inclua na lista (server/scripts/publicarRelease.cjs) — senão a release quebra na máquina de destino.',
    );
  }
}

/**
 * Instala em `stagingDir` SÓ as dependências do servidor, do zero — em vez de
 * copiar o `node_modules` inteiro (com devDependencies e pacotes de frontend)
 * e podar depois. `npm prune` não removia o que estava em `dependencies`, que
 * é justamente onde os pacotes de frontend vivem (eles são necessários pro
 * `npm run build`, então não dá simplesmente pra movê-los pra devDependencies
 * sem quebrar o build de quem clona o repo).
 */
function prepararStagingComDepsDeProducao(stagingDir, raiz = RAIZ) {
  verificarDepsDoServidor(raiz);
  fs.mkdirSync(stagingDir, { recursive: true });

  const pkgOriginal = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  const deps = {};
  for (const dep of DEPS_SERVIDOR) {
    if (!pkgOriginal.dependencies[dep]) throw new Error(`publicarRelease: "${dep}" está em DEPS_SERVIDOR mas não em dependencies.`);
    deps[dep] = pkgOriginal.dependencies[dep];
  }
  // `package.json` enxuto no destino: o app instalado nunca roda build, só
  // `node inicio.cjs` — scripts e devDependencies não têm função lá.
  fs.writeFileSync(path.join(stagingDir, 'package.json'), `${JSON.stringify({
    name: pkgOriginal.name,
    version: pkgOriginal.version,
    private: true,
    type: pkgOriginal.type,
    dependencies: deps,
  }, null, 2)}\n`);

  execFileSync(NPM_BIN, ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: stagingDir, stdio: 'inherit', shell: true });
}

/** Node portátil (build oficial `node-vX.Y.Z-win-x64`, só o `.exe`) —
 * localização configurável porque não faz parte do repositório (baixado uma
 * vez manualmente, não fica no git). Sem ele, a release exige Node já
 * instalado na máquina de destino — funciona, só perde a conveniência de
 * "zero instalação". */
function localizarNodePortavel() {
  const candidato = process.env.NODE_PORTATIL_PATH;
  return candidato && fs.existsSync(candidato) ? candidato : null;
}

/**
 * Empacota o conteúdo de `pastaOrigem` (já pronta, com tudo dentro) num
 * `.zip` em `destinoZip`, com escrita atômica (`tmp` + `rename` — mesmo
 * padrão de `server/db.cjs:gravarWorkbook`, nunca deixa o OneDrive ver um
 * arquivo parcial). Separado de `publicarRelease()` pra ser testável sem
 * depender de `npm install`/`npm run build` de verdade.
 */
function empacotarPasta(pastaOrigem, destinoZip) {
  const zip = new AdmZip();
  zip.addLocalFolder(pastaOrigem);
  const tmp = `${destinoZip}.tmp`;
  zip.writeZip(tmp);
  fs.renameSync(tmp, destinoZip);
}

/** Grava/atualiza `releases/latest.json`, também com escrita atômica. */
function escreverManifesto(releasesDir, { versao, arquivo, novidades = [] }) {
  if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir, { recursive: true });
  const destino = path.join(releasesDir, 'latest.json');
  const tmp = `${destino}.tmp`;
  // `novidades` vai NO MANIFESTO (não só no .zip): a máquina que ainda não
  // atualizou precisa poder mostrar o que vem na versão nova ANTES de baixar.
  fs.writeFileSync(tmp, JSON.stringify({ versao, arquivo, publicadoEm: new Date().toISOString(), novidades }, null, 2));
  fs.renameSync(tmp, destino);
  return destino;
}

/**
 * Apaga todo `.zip` de release em `releasesDir` exceto `nomeArquivoAtual` —
 * sem retenção, cada publish deixava as anteriores pra sempre (~85MB cada,
 * ~250MB depois de só 3 publishes). Só a versão que acabou de ser publicada
 * fica; quem precisar reverter usa o `.zip` da própria máquina que já
 * instalou a versão anterior (`C:\SistemaCarteira\app`), não o backup daqui.
 */
function limparReleasesAntigas(releasesDir, nomeArquivoAtual) {
  const arquivos = fs.existsSync(releasesDir) ? fs.readdirSync(releasesDir) : [];
  for (const nome of arquivos) {
    if (nome === nomeArquivoAtual || !nome.endsWith('.zip')) continue;
    fs.rmSync(path.join(releasesDir, nome));
    console.log(`Release antiga removida: ${nome}`);
  }
}

/**
 * Publica uma release: builda o frontend, monta `dist/` + `server/` +
 * `server.cjs` + `package.json` + dependências de produção (staging isolado)
 * + Node portátil (se disponível) num `.zip`, e atualiza `releases/latest.json`
 * em `BACKUP_ONEDRIVE_DIR`. Comando manual — não roda automaticamente em
 * nenhum cron/boot, é você/eu decidindo publicar uma versão nova.
 */
function publicarRelease() {
  const versao = lerVersaoPackageJson();
  console.log(`Publicando release v${versao}...`);

  console.log('Buildando frontend (npm run build)...');
  execFileSync(NPM_BIN, ['run', 'build'], { cwd: RAIZ, stdio: 'inherit', shell: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-release-'));
  try {
    fs.cpSync(path.join(RAIZ, 'dist'), path.join(tmpDir, 'dist'), { recursive: true });
    fs.cpSync(path.join(RAIZ, 'server'), path.join(tmpDir, 'server'), { recursive: true });
    fs.copyFileSync(path.join(RAIZ, 'server.cjs'), path.join(tmpDir, 'server.cjs'));
    // Entrypoint do app instalado (bandeja + servidor) e o ícone que ela usa.
    // Ambos precisam viajar no `.zip`: é justamente por estarem aqui, e não
    // dentro do `.exe`, que dá pra corrigir a inicialização publicando uma
    // release em vez de redistribuir o binário pra cada máquina.
    fs.copyFileSync(path.join(RAIZ, 'inicio.cjs'), path.join(tmpDir, 'inicio.cjs'));
    fs.copyFileSync(path.join(RAIZ, 'launcher', 'icone.ico'), path.join(tmpDir, 'icone.ico'));
    // Viaja na release pra o app instalado mostrar as novidades da versão que
    // ELE roda, depois de atualizar (quando não há mais "disponível").
    const novidadesPath = path.join(RAIZ, 'NOVIDADES.md');
    if (fs.existsSync(novidadesPath)) fs.copyFileSync(novidadesPath, path.join(tmpDir, 'NOVIDADES.md'));

    console.log('Instalando dependências de produção (staging isolado)...');
    prepararStagingComDepsDeProducao(tmpDir);

    const nodePortavel = localizarNodePortavel();
    if (nodePortavel) {
      fs.mkdirSync(path.join(tmpDir, 'node'), { recursive: true });
      fs.copyFileSync(nodePortavel, path.join(tmpDir, 'node', 'node.exe'));
    } else {
      console.warn('NODE_PORTATIL_PATH não configurado — release vai exigir Node já instalado na máquina de destino.');
    }

    const nomeArquivo = `carteira-v${versao}.zip`;
    if (!fs.existsSync(RELEASES_DIR)) fs.mkdirSync(RELEASES_DIR, { recursive: true });
    const destinoZip = path.join(RELEASES_DIR, nomeArquivo);
    empacotarPasta(tmpDir, destinoZip);
    const manifesto = escreverManifesto(RELEASES_DIR, { versao, arquivo: nomeArquivo, novidades: novidadesDaVersao(versao, RAIZ) });
    limparReleasesAntigas(RELEASES_DIR, nomeArquivo);

    console.log(`Release publicada: ${destinoZip}`);
    console.log(`Manifesto: ${manifesto}`);
    return { versao, arquivo: nomeArquivo, destinoZip };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) publicarRelease();

module.exports = {
  publicarRelease, lerVersaoPackageJson, empacotarPasta, escreverManifesto, limparReleasesAntigas,
  verificarDepsDoServidor, DEPS_SERVIDOR,
};
