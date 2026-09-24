const fs = require('fs');
const path = require('path');
const { DATA_DIR, DB_FILE } = require('./config.cjs');

// O OneDrive tem histórico de versões, mas ele sincroniza também o arquivo
// corrompido — e restaurar por lá, sob pressão, depende de alguém saber o
// caminho. Um snapshot local diário dá um ponto de retorno óbvio e imediato.
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 2;

/** Data local no formato YYYY-MM-DD (não UTC: um backup feito às 21h no
 *  Brasil cairia no dia seguinte se usássemos toISOString). */
function hojeLocal(agora = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
}

function nomeSnapshot(dia) {
  const base = path.basename(DB_FILE, path.extname(DB_FILE));
  return `${base}-${dia}${path.extname(DB_FILE)}`;
}

/** Mantém só os MAX_BACKUPS mais recentes, pelo nome do arquivo (a data no
 *  nome ordena cronologicamente como string — não usa mtime: o OneDrive
 *  reescreve mtime ao sincronizar). */
function limparAntigos() {
  const padrao = /-(\d{4}-\d{2}-\d{2})\.xlsx$/;
  const arquivos = fs.readdirSync(BACKUP_DIR).filter((f) => padrao.test(f)).sort();
  const excedentes = arquivos.slice(0, Math.max(0, arquivos.length - MAX_BACKUPS));

  for (const arquivo of excedentes) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, arquivo));
    } catch (err) {
      console.warn(`Backup: não foi possível remover ${arquivo}: ${err.message}`);
    }
  }
}

/**
 * Cria o snapshot do dia, se ainda não existir, e roda a retenção.
 * Idempotente: chamar várias vezes no mesmo dia não faz nada além da limpeza.
 * Devolve o caminho do snapshot criado, ou null se já existia / não havia banco.
 */
function backupDiario() {
  if (!fs.existsSync(DB_FILE)) return null;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const destino = path.join(BACKUP_DIR, nomeSnapshot(hojeLocal()));
  const jaExiste = fs.existsSync(destino);
  if (!jaExiste) {
    // COPYFILE_EXCL: se outra instância criou o arquivo entre o existsSync e
    // aqui, falha em vez de sobrescrever um snapshot já bom.
    fs.copyFileSync(DB_FILE, destino, fs.constants.COPYFILE_EXCL);
  }
  limparAntigos();
  return jaExiste ? null : destino;
}

module.exports = { backupDiario, BACKUP_DIR };
