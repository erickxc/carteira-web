/**
 * Modo de execução deste processo — Etapa 2 do plano de fila/controller
 * (acesso remoto fora da LAN, ver plano em C:\Users\Kerol\.claude\plans\robust-wandering-sonnet.md).
 *
 * - `server` (dona do SQLite real): grava direto, roda os crons de
 *   backup/relatórios/séries/CEO agenda/controller da fila.
 * - `client` (as outras 3 máquinas): nunca escreve direto no SQLite local
 *   (guarda em `server/dbSqlite.cjs`), suprime os crons (não existe "banco
 *   real" pra fazer backup/relatório aqui), e as rotas de mutação (Etapa 3)
 *   passam a escrever na fila em vez do repo.
 *
 * O `.exe` é o MESMO pra todo mundo (mesma release, mesmo `latest.json`) —
 * não dá pra decidir o modo por variável de ambiente configurada manualmente
 * em cada máquina (fricção real pra quem não é técnico, e fácil de esquecer/
 * configurar errado). Em vez disso, o modo é decidido AUTOMATICAMENTE pelo
 * nome do computador: só a máquina "Karol-2D" (a que tem o banco real, ver
 * CLAUDE.md) é `server`; qualquer outro nome de computador é `client`. Uma
 * variável de ambiente (`APP_MODE`) ainda pode forçar um modo explícito —
 * usado nos testes/scripts e como via de escape manual — mas o caminho
 * padrão (o que a pessoa que só clica no `.exe` realmente vive) nunca depende
 * de configuração alguma.
 */
const os = require('os');

const HOSTNAME_SERVIDOR = process.env.CARTEIRA_HOSTNAME_SERVIDOR || 'Karol-2D';

function modoPorHostname() {
  return os.hostname().toLowerCase() === HOSTNAME_SERVIDOR.toLowerCase() ? 'server' : 'client';
}

const APP_MODE = process.env.APP_MODE === 'client' ? 'client'
  : process.env.APP_MODE === 'server' ? 'server'
  : modoPorHostname();
const isClient = APP_MODE === 'client';
const isServer = !isClient;

module.exports = { APP_MODE, isClient, isServer };
