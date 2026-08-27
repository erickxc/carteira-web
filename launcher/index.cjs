const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { RELEASES_DIR, PORTA, PONTEIRO_INSTALL, caminhosDe } = require('./config.cjs');
const { obterPastaInstalacao } = require('./primeiraExecucao.cjs');
const { lerVersaoInstalada, precisaAtualizar, aplicarAtualizacao } = require('./atualizar.cjs');
const telaCarregandoEmbutida = require('../server/telaCarregando.cjs');

/**
 * Arquivo de log do launcher — existe porque um `.exe` clicado no Explorer
 * (sem terminal) não deixa NENHUM rastro visível de erro: se algo falhar
 * antes do servidor subir, a pessoa só vê "não foi possível abrir o sistema"
 * na tela de carregamento, sem detalhe nenhum, e não tem como me mandar o que
 * aconteceu (bug real: precisei pedir pra alguém testar numa máquina remota
 * às cegas). Fica ao lado de `PONTEIRO_INSTALL` (pasta que já existe e é
 * fixa, fora da instalação em si — funciona mesmo se a pasta de instalação
 * estiver quebrada/vazia). Também recebe a saída do `server.cjs` filho (ver
 * `subirServidor`) — sem isso, `stdio: 'inherit'` de um processo sem console
 * simplesmente descarta a saída do servidor no vácuo.
 */
const LOG_FILE = path.join(path.dirname(PONTEIRO_INSTALL), 'launcher.log');

function registrarLog(linha) {
  const texto = `[${new Date().toISOString()}] ${linha}`;
  console.log(texto);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${texto}\n`);
  } catch {
    // Nunca deixa uma falha ao logar derrubar o launcher — sem log ainda é
    // melhor que sem app.
  }
}

/**
 * A tela de carregamento é carregada preferencialmente de DENTRO da instalação
 * (`app/server/telaCarregando.cjs`, que veio no `.zip` da release) e só cai na
 * cópia embutida no `.exe` se não achar. É o mesmo princípio do `inicio.cjs`:
 * quanto menos comportamento ficar preso dentro do binário, menos vezes o
 * `.exe` precisa ser recompilado e reenviado pra cada máquina — hoje isso é
 * manual e, na prática, não acontece.
 */
function carregarTela(appDir) {
  try {
    const daInstalacao = path.join(appDir, 'server', 'telaCarregando.cjs');
    if (fs.existsSync(daInstalacao)) return require(daInstalacao);
  } catch (err) {
    registrarLog(`Launcher: tela de carregamento da instalação falhou (${err.message}) — usando a embutida.`);
  }
  return telaCarregandoEmbutida;
}

function lerReleaseDisponivel() {
  const latestPath = path.join(RELEASES_DIR, 'latest.json');
  try {
    return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  } catch (err) {
    registrarLog(`Launcher: não foi possível ler releases/latest.json (seguindo com a versão instalada): ${err.message}`);
    return null;
  }
}

/** Atualiza a instalação local se houver uma versão mais nova no OneDrive.
 * Nunca lança — qualquer falha (rede/OneDrive fora do ar, zip corrompido) só
 * loga e segue com o que já está instalado (ver `launcher/atualizar.cjs`). */
function atualizarSeNecessario({ appDir, versaoArquivoPath }) {
  const instalada = lerVersaoInstalada(versaoArquivoPath);
  const disponivel = lerReleaseDisponivel();
  if (!disponivel) return { atualizou: false, versao: instalada };
  if (!precisaAtualizar(instalada, disponivel.versao)) {
    registrarLog(`Launcher: já na versão mais recente (${instalada}).`);
    return { atualizou: false, versao: instalada };
  }
  registrarLog(`Launcher: atualizando de ${instalada} para ${disponivel.versao}...`);
  const zipPath = path.join(RELEASES_DIR, disponivel.arquivo);
  const resultado = aplicarAtualizacao({ appDir, zipPath, novaVersao: disponivel.versao, versaoArquivoPath });
  if (resultado.ok) {
    registrarLog(`Launcher: atualizado para ${disponivel.versao}.`);
    return { atualizou: true, versao: disponivel.versao };
  }
  registrarLog(`Launcher: falha ao atualizar (${resultado.erro}) — seguindo com a versão ${instalada}.`);
  return { atualizou: false, versao: instalada };
}

/** Procura um Node instalado no sistema (`where`/`which`) — usado como último
 * recurso quando a release não tem Node portátil embutido E o launcher está
 * empacotado (não há um `process.execPath` de verdade pra usar nesse caso). */
function localizarNodeNoSistema() {
  try {
    const comando = process.platform === 'win32' ? 'where' : 'which';
    const saida = execFileSync(comando, ['node'], { encoding: 'utf8' });
    const primeira = saida.split(/\r?\n/).find((l) => l.trim());
    return primeira ? primeira.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Node portátil embutido no pacote da release (ver server/scripts/publicarRelease.cjs)
 * é a primeira opção. Se não existir:
 * - Em DEV (`node launcher/index.cjs`, `process.pkg` ausente): `process.execPath`
 *   é o Node de verdade que está executando este próprio arquivo — seguro.
 * - EMPACOTADO (`.exe` via `@yao-pkg/pkg`, `process.pkg` presente):
 *   `process.execPath` é o PRÓPRIO `.exe` do launcher, NÃO um Node de
 *   verdade — usá-lo pra rodar `server.cjs` quebra com
 *   "Pkg: Error reading from file." (bug real encontrado em produção: uma
 *   release publicada sem `NODE_PORTATIL_PATH` reproduzia isso sempre). Nesse
 *   caso, procura um Node já instalado no sistema; se não achar, falha com
 *   uma mensagem clara em vez de tentar rodar o `.exe` como se fosse Node.
 */
function caminhoNodePortavel(appDir) {
  const candidato = path.join(appDir, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  if (fs.existsSync(candidato)) return candidato;
  if (!process.pkg) return process.execPath;
  const doSistema = localizarNodeNoSistema();
  if (doSistema) return doSistema;
  throw new Error(
    'Node não encontrado: nem embutido na release (app/node/node.exe) nem instalado nesta máquina. ' +
    'Publique a release com NODE_PORTATIL_PATH configurado (server/scripts/publicarRelease.cjs), ou instale o Node.js nesta máquina.'
  );
}

/** Saída do `server.cjs` filho vai pro MESMO arquivo de log do launcher (append)
 * — é a única forma de ver o que o servidor imprimiu quando o `.exe` foi
 * aberto sem console (clique duplo no Explorer). */
/** `inicio.cjs` (bandeja + servidor) é o entrypoint desde a v1.2.0; instalações
 * mais antigas ainda não o têm no `.zip`, então cai no `server.cjs` direto —
 * sem isso, um `.exe` novo sobre uma instalação velha não subiria nada. */
function entrypointDoApp(appDir) {
  const inicio = path.join(appDir, 'inicio.cjs');
  return fs.existsSync(inicio) ? inicio : path.join(appDir, 'server.cjs');
}

/** Código de saída que o servidor usa pra pedir "aplique a atualização e me
 * suba de novo" (`POST /api/atualizacao/aplicar`, ver `server/routes/atualizacao.cjs`
 * pro porquê disso existir em vez de um processo desacoplado relançando o
 * `.exe`: Job Object do Windows mata a árvore inteira quando o launcher sai). */
const CODIGO_SAIDA_ATUALIZAR = 42;

// Falha logo na subida (`server.cjs` sai com código != 0 em poucos segundos)
// — o caso real que motivou isto: "Iniciar com o Windows" dispara o launcher
// no login, mas o cliente do OneDrive pode levar dezenas de segundos pra
// terminar de montar a pasta sincronizada; `server/config.cjs` vê
// `ONEDRIVE_ROOT` ainda inexistente e sai com `process.exit(1)` (correto pro
// caso de instalação quebrada, mas fatal demais pra essa corrida de boot).
// Sem retry aqui, o launcher morre de vez — e a tela de carregamento
// (`server/telaCarregando.cjs`) é só uma aba de navegador separada: ela fica
// testando `/api/status/base` pra sempre contra uma porta que ninguém nunca
// mais vai abrir, e nem o "Tentar de novo" da tela resolve (não existe mais
// launcher pra reabrir). Tenta de novo em vez de desistir — cobre o caso comum
// (atraso transitório) sem virar loop infinito de verdade (limite de tentativas).
const MAX_TENTATIVAS_BOOT = 15;
const INTERVALO_RETRY_BOOT_MS = 3000;

/**
 * Sobe o servidor e, se ele sair pedindo atualização (`CODIGO_SAIDA_ATUALIZAR`),
 * reinicia o ciclo completo (checa atualização de novo, sobe de novo) DENTRO
 * DESTE MESMO PROCESSO LAUNCHER — nunca abrindo um `.exe` novo nem um
 * processo desacoplado. É isso que sobrevive ao Job Object: o launcher é o
 * DONO do job, então ele — e só ele — atravessa o ciclo de vida do servidor
 * sem ser derrubado por ele mesmo.
 *
 * `installDir` só é passado quando o chamador quer esse comportamento de
 * loop (o fluxo normal do launcher, ver `main()`) — é também o que ativa o
 * retry de boot acima. Omitido, sai normal em qualquer código — é o caso de
 * quem só quer subir o servidor uma vez (ex.: testes).
 */
function subirServidor(appDir, installDir, tentativaBoot = 1) {
  const serverPath = entrypointDoApp(appDir);
  const nodePath = caminhoNodePortavel(appDir);
  registrarLog(`Launcher: subindo servidor (${nodePath} ${serverPath})...`);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(nodePath, [serverPath], {
    cwd: appDir,
    env: {
      ...process.env,
      PORT: String(PORTA),
      // `process.execPath` AQUI (no launcher, empacotado) é o caminho do
      // próprio `.exe` — é o que a rota "iniciar com o Windows"
      // (server/routes/sistemaLocal.cjs) precisa pra registrar no Windows.
      // Sem `process.pkg`, isso não é um `.exe` de verdade (dev) — não faz
      // sentido oferecer a opção nesse caso.
      ...(process.pkg ? { CARTEIRA_LAUNCHER_EXE: process.execPath } : {}),
    },
    stdio: ['ignore', logFd, logFd],
    // O launcher em si não tem console (subsystem GUI, ver marcarComoGui.cjs)
    // — mas o Node que sobe aqui (`nodePath`, seja o portátil embutido ou o
    // do sistema) É um executável console normal (todo build oficial do
    // Node.js é). Sem `windowsHide`, o Windows aloca um console NOVO pra esse
    // filho mesmo assim, porque ele não tem nenhum console de pai pra herdar
    // — é exatamente essa janela que aparecia ("terminal rodando o
    // servidor"), mesmo com o launcher já sem console nenhum.
    windowsHide: true,
  });
  child.on('exit', (code) => {
    registrarLog(`Launcher: servidor encerrado (código ${code}).`);
    try { fs.closeSync(logFd); } catch { /* já pode ter sido fechado pelo próprio spawn */ }
    if (code === CODIGO_SAIDA_ATUALIZAR && installDir) {
      registrarLog('Launcher: reiniciando pra aplicar a atualização...');
      const { APP_DIR, VERSAO_ARQUIVO } = caminhosDe(installDir);
      atualizarSeNecessario({ appDir: APP_DIR, versaoArquivoPath: VERSAO_ARQUIVO });
      subirServidor(APP_DIR, installDir);
      return;
    }
    if (code !== 0 && installDir && tentativaBoot < MAX_TENTATIVAS_BOOT) {
      registrarLog(`Launcher: falha na subida (tentativa ${tentativaBoot}/${MAX_TENTATIVAS_BOOT}) — tentando de novo em ${INTERVALO_RETRY_BOOT_MS / 1000}s (pode ser o OneDrive ainda montando no boot do Windows)...`);
      setTimeout(() => subirServidor(appDir, installDir, tentativaBoot + 1), INTERVALO_RETRY_BOOT_MS);
      return;
    }
    liberarTravaUnica();
    process.exit(code ?? 0);
  });
  child.on('error', (err) => {
    registrarLog(`Launcher: falha ao iniciar o processo do servidor — ${err.message}`);
  });
  return child;
}

/** Caminho do lockfile de instância única, ao lado de LOG_FILE (mesma pasta
 * fixa, fora da instalação — funciona mesmo se a instalação estiver
 * quebrada/vazia). Guarda o PID de quem está no meio da abertura. */
const LOCK_FILE = path.join(path.dirname(PONTEIRO_INSTALL), 'launcher.lock');

/** `true` se o PID gravado no lockfile ainda existe como processo vivo —
 * `process.kill(pid, 0)` não mata nada (sinal 0), só testa existência. */
function pidVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Trava de instância única. Sem isso, dois cliques (ou "Iniciar com o
 * Windows" no boot + um clique manual logo em seguida) sobem dois
 * launchers e dois `node.exe`: o segundo servidor não consegue nem bindar a
 * porta (o primeiro já está nela), mas os dois já mexeram no meio da
 * atualização — dá pra corromper a troca de `app/` (`launcher/atualizar.cjs`
 * espera ser o único a renomear aquela pasta). Bug real, encontrado em
 * produção depois de ligar "Iniciar com o Windows".
 *
 * Não usa um mutex nativo do Windows (exigiria dependência nova/nativa,
 * mesma cautela do resto do projeto — ver `server/scripts/publicarRelease.cjs`
 * sobre `better-sqlite3`) — um lockfile com o PID de dentro, checado via
 * `pidVivo`, resolve com zero dependência: se o dono do lock não existe mais
 * (crash, versão antiga que nunca limpou), a trava é considerada obsoleta e
 * sobrescrita, em vez de travar o app pra sempre.
 */
function obterTravaUnica() {
  try {
    const existente = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
    if (pidVivo(existente)) return false;
  } catch { /* sem lock ainda, ou ilegível — segue pra criar um novo */ }
  try {
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    return true;
  } catch (err) {
    registrarLog(`Launcher: não foi possível criar o lock de instância única (${err.message}) — seguindo mesmo assim.`);
    return true; // falha ao travar não pode ser motivo pra nunca abrir o app
  }
}

function liberarTravaUnica() {
  try {
    if (Number(fs.readFileSync(LOCK_FILE, 'utf8').trim()) === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch { /* já não existia, ou não é nosso — não mexe */ }
}

/** Servidor já respondendo nesta porta = já tem uma Carteira aberta (desta
 * sessão ou de um boot anterior). Não abre uma segunda: só leva a pessoa pro
 * app que já está no ar. Timeout curto — não pode atrasar a abertura normal
 * só por causa desta checagem. */
function servidorJaNoAr(timeoutMs = 400) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORTA}/api/status/base`, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function esperarServidor(tentativas = 40) {
  return new Promise((resolve, reject) => {
    const tentar = (restantes) => {
      http.get(`http://127.0.0.1:${PORTA}/api/status/base`, (res) => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (restantes <= 0) return reject(new Error('Servidor não respondeu a tempo.'));
        setTimeout(() => tentar(restantes - 1), 500);
      });
    };
    tentar(tentativas);
  });
}

/**
 * Ordem importa: abre a tela de carregamento JÁ, antes de checar
 * atualização/subir o servidor (que pode levar alguns segundos, ex.: copiar
 * e extrair um `.zip` de atualização) — sem isso a pessoa clica no `.exe` e
 * fica olhando pra nada até o navegador abrir. A própria tela de
 * carregamento (`server/telaCarregando.cjs`) faz o polling em
 * `/api/status/base` e se redireciona sozinha pro app real quando ele
 * responder — o launcher não precisa abrir o navegador de novo depois.
 */
async function main() {
  // Nenhuma janela de console aparece pra rodar isto — não por um truque em
  // runtime (havia uma tentativa anterior de relançamento oculto via
  // `windowsHide`, removida: dependia do Windows cooperar depois do processo
  // já ter sido criado com console, e ainda deixava um lampejo visível às
  // vezes). A garantia real é no próprio binário: `launcher/marcarComoGui.cjs`
  // troca o Subsystem do `.exe` pra GUI (2) antes do `pkg` empacotar — o
  // loader do Windows nunca aloca console pra esse tipo de processo, ponto.
  registrarLog(`Launcher: iniciado (v${process.env.npm_package_version || '?'}, ${os.hostname()}, log em ${LOG_FILE}).`);

  if (await servidorJaNoAr()) {
    registrarLog('Launcher: já há uma Carteira aberta nesta porta — abrindo o navegador nela, sem subir outra.');
    spawn('cmd', ['/c', 'start', '', `http://127.0.0.1:${PORTA}/`], { shell: false, stdio: 'ignore', windowsHide: true });
    return;
  }
  if (!obterTravaUnica()) {
    registrarLog('Launcher: outra instância já está abrindo o sistema neste exato momento — encerrando esta.');
    return;
  }

  try {
    const installDir = obterPastaInstalacao();
    const { APP_DIR, VERSAO_ARQUIVO } = caminhosDe(installDir);
    if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });
    carregarTela(APP_DIR).abrirTelaCarregando(PORTA, LOG_FILE);

    atualizarSeNecessario({ appDir: APP_DIR, versaoArquivoPath: VERSAO_ARQUIVO });
    subirServidor(APP_DIR, installDir);
  } catch (err) {
    // Sem isso, um erro aqui (ex.: Node não encontrado, ver
    // `caminhoNodePortavel`) mata o launcher em silêncio — a tela de
    // carregamento fica esperando até dar timeout, sem pista do que
    // aconteceu. Loga claro no arquivo — é a única forma de saber o que
    // houve numa máquina remota que eu não acesso.
    registrarLog(`Launcher: falha ao subir o servidor — ${err.message}`);
    process.exitCode = 1;
    liberarTravaUnica();
  }
  // Se subiu com sucesso, a trava fica até o servidor cair (o processo do
  // launcher continua vivo — `subirServidor` só sai quando o filho sai, ver
  // `child.on('exit')`) — é ela que impede um segundo clique no meio disso.
}

if (require.main === module) main();

module.exports = {
  atualizarSeNecessario, subirServidor, esperarServidor, lerReleaseDisponivel, caminhoNodePortavel,
  entrypointDoApp, carregarTela, servidorJaNoAr, obterTravaUnica, liberarTravaUnica, pidVivo,
  CODIGO_SAIDA_ATUALIZAR, LOCK_FILE, LOG_FILE,
};
