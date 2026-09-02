/**
 * Atualização AUTOMÁTICA: procura versão nova sozinho e aplica quando a
 * máquina está ociosa — sem ninguém apertar "Atualizar agora".
 *
 * Como aplica: exatamente o mesmo caminho do botão manual
 * (`server/routes/atualizacao.cjs`) — este processo sai com o código 42 e o
 * LAUNCHER, que continua vivo, troca os arquivos e sobe a versão nova. Nada é
 * baixado aqui: quem baixa/extrai o `.zip` da release é `launcher/atualizar.cjs`,
 * na abertura. Por isso "baixar sozinho" e "reiniciar" são o mesmo evento.
 *
 * Por que esperar ociosidade: reiniciar derruba a API por alguns segundos. Se
 * alguém estiver no meio de um cadastro (ou de uma pergunta ao monitorIA, que
 * leva ~30-120s), perde o que estava fazendo. O app é usado por várias pessoas
 * na LAN ao mesmo tempo, e nenhuma delas pediu a atualização — então o
 * reinício só pode acontecer quando não há ninguém usando.
 *
 * O que conta como "usando": qualquer requisição da API que não seja
 * POLLING de tela (ver `EH_POLLING`). O frontend revalida os dados a cada 60s
 * com a aba VISÍVEL, então, na prática, uma aba aberta na frente de alguém
 * mantém a máquina "em uso" e o reinício fica pra depois — normalmente à
 * noite. É o comportamento desejado, mas tem um efeito colateral honesto: uma
 * aba esquecida aberta e visível adia a atualização indefinidamente. Por isso
 * existe `TETO_ESPERA_MS`: passado esse tempo com versão nova pendente, basta
 * uma janela curta sem ESCRITA nenhuma pra aplicar.
 */
const fs = require('fs');
const path = require('path');
const { BACKUP_ONEDRIVE_DIR } = require('./config.cjs');

const RELEASES_DIR = path.join(BACKUP_ONEDRIVE_DIR, 'releases');

const CODIGO_SAIDA_ATUALIZAR = 42;

const LIGADA = process.env.AUTO_ATUALIZACAO !== '0';
/** De quanto em quanto tempo procura versão nova no OneDrive. */
const INTERVALO_CHECAGEM_MS = Number(process.env.AUTO_ATUALIZACAO_CHECAGEM_MS) || 30 * 60_000;
/** De quanto em quanto tempo reavalia se já pode reiniciar. */
const INTERVALO_OCIOSO_MS = 60_000;
/** Tempo sem atividade nenhuma pra considerar a máquina ociosa. */
const OCIOSO_MS = Number(process.env.AUTO_ATUALIZACAO_OCIOSO_MIN || 10) * 60_000;
/** Depois disso esperando, aceita aplicar só com ausência de ESCRITA. */
const TETO_ESPERA_MS = Number(process.env.AUTO_ATUALIZACAO_TETO_HORAS || 12) * 3_600_000;
/** Janela sem escrita exigida no modo "esperei demais". */
const SEM_ESCRITA_MS = 15 * 60_000;

/** Rotas que a tela consulta em laço fixo — presença delas não é "alguém usando". */
const EH_POLLING = (url) => /^\/api\/(status\/base|fila\/status|atualizacao\/status)/.test(url);

const estado = {
  ultimaAtividade: Date.now(),
  ultimaEscrita: Date.now(),
  emVoo: 0,
  aguardandoDesde: null,
  versaoPendente: null,
};

/**
 * Middleware de atividade. Precisa vir ANTES das rotas e registrar tanto o
 * início quanto o fim: `emVoo` é o que impede reiniciar no meio de uma
 * requisição longa (uma pergunta ao monitorIA passa de 1 minuto).
 */
function middlewareAtividade(req, res, next) {
  if (!EH_POLLING(req.originalUrl || req.url || '')) {
    const agora = Date.now();
    estado.ultimaAtividade = agora;
    if (req.method !== 'GET') estado.ultimaEscrita = agora;
  }
  estado.emVoo += 1;
  res.on('finish', () => { estado.emVoo = Math.max(0, estado.emVoo - 1); });
  res.on('close', () => { estado.emVoo = Math.max(0, estado.emVoo - 1); });
  next();
}

function lerVersaoInstalada() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

function lerVersaoPublicada() {
  try {
    return JSON.parse(fs.readFileSync(path.join(RELEASES_DIR, 'latest.json'), 'utf8')).versao ?? null;
  } catch {
    return null;
  }
}

/** Mesma comparação de `routes/atualizacao.cjs` e `launcher/atualizar.cjs`. */
function versaoMaiorQue(a, b) {
  const pa = String(a || '0.0.0').split('.').map(Number);
  const pb = String(b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

/** `null` quando não há versão nova; a versão, quando há. */
function versaoNovaDisponivel() {
  const instalada = lerVersaoInstalada();
  const publicada = lerVersaoPublicada();
  if (!instalada || !publicada) return null;
  return versaoMaiorQue(publicada, instalada) ? publicada : null;
}

/**
 * Pode reiniciar agora? Duas portas:
 *  - ocioso de verdade (ninguém tocou na API por `OCIOSO_MS`);
 *  - esperando há muito tempo (`TETO_ESPERA_MS`) e sem ESCRITA por
 *    `SEM_ESCRITA_MS` — evita adiar pra sempre por causa de aba esquecida.
 * Requisição em andamento bloqueia nos dois casos.
 */
function podeAplicar(agora = Date.now()) {
  if (estado.emVoo > 0) return false;
  if (agora - estado.ultimaAtividade >= OCIOSO_MS) return true;
  const esperando = estado.aguardandoDesde ? agora - estado.aguardandoDesde : 0;
  return esperando >= TETO_ESPERA_MS && agora - estado.ultimaEscrita >= SEM_ESCRITA_MS;
}

/** Diagnóstico pra `GET /api/atualizacao/status` (e pros testes). */
function statusAuto() {
  const agora = Date.now();
  return {
    ligada: LIGADA,
    versaoPendente: estado.versaoPendente,
    aguardandoOcioso: Boolean(estado.versaoPendente),
    ociosoSegundos: Math.round((agora - estado.ultimaAtividade) / 1000),
    ociosoNecessarioSegundos: Math.round(OCIOSO_MS / 1000),
    requisicoesEmVoo: estado.emVoo,
  };
}

/**
 * Liga os dois laços. Só faz sentido quando o app foi aberto pelo `.exe`
 * (`CARTEIRA_LAUNCHER_EXE`): é o launcher que aplica a troca de arquivos.
 * Rodando pela pasta do projeto (dev, ou `npm start` na máquina servidora),
 * atualizar é `git pull` + build — não há `.zip` pra instalar, então nem
 * agenda a checagem.
 */
function iniciarAutoAtualizacao({ aplicar = () => process.exit(CODIGO_SAIDA_ATUALIZAR), log = console.log } = {}) {
  if (!LIGADA) {
    log('Auto-atualização desligada (AUTO_ATUALIZACAO=0).');
    return null;
  }
  if (!process.env.CARTEIRA_LAUNCHER_EXE) {
    log('Auto-atualização inativa: app não foi aberto pelo .exe (nada a instalar por aqui).');
    return null;
  }

  const checar = () => {
    const nova = versaoNovaDisponivel();
    if (!nova) {
      if (estado.versaoPendente) log(`Auto-atualização: versão ${estado.versaoPendente} não está mais pendente.`);
      estado.versaoPendente = null;
      estado.aguardandoDesde = null;
      return;
    }
    if (estado.versaoPendente !== nova) {
      estado.versaoPendente = nova;
      estado.aguardandoDesde = Date.now();
      log(`Auto-atualização: versão ${nova} disponível — aplicando quando a máquina ficar ociosa (${Math.round(OCIOSO_MS / 60_000)} min sem uso).`);
    }
  };

  const tentar = () => {
    if (!estado.versaoPendente) return;
    if (!podeAplicar()) return;
    log(`Auto-atualização: máquina ociosa — reiniciando para instalar a versão ${estado.versaoPendente}.`);
    aplicar();
  };

  checar();
  const timerChecagem = setInterval(checar, INTERVALO_CHECAGEM_MS);
  const timerOcioso = setInterval(tentar, INTERVALO_OCIOSO_MS);
  // `unref`: um timer pendente não deve segurar o processo vivo na saída.
  timerChecagem.unref?.();
  timerOcioso.unref?.();
  return { timerChecagem, timerOcioso };
}

module.exports = {
  middlewareAtividade, iniciarAutoAtualizacao, statusAuto, podeAplicar,
  versaoNovaDisponivel, versaoMaiorQue, _estado: estado, EH_POLLING,
  CODIGO_SAIDA_ATUALIZAR,
};
