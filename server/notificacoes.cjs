/**
 * Toast nativo do Windows via `node-notifier` — só funciona de verdade em
 * quem roda o backend localmente (ver `server/routes/sistemaLocal.cjs`,
 * mesmo critério de "Iniciar com o Windows"). Nunca lança: falhar ao mostrar
 * uma notificação não pode derrubar a ação (criar evento, salvar análise...)
 * que a disparou.
 */
const fs = require('fs');
const path = require('path');
const notifier = require('node-notifier');

// Sem `icon`, o node-notifier/SnoreToast usa um ícone placeholder genérico
// (nada a ver com a CARTEIRA 2D). SnoreToast (motor do node-notifier no
// Windows) não aceita .ico — precisa ser .png/.jpg, senão falha em silêncio
// e cai no placeholder. Usa o mesmo robô (ícone lucide "Bot") do item
// monitorIA na sidebar — rasterizado uma vez em `public/icon-notificacao-bot.svg`
// (fonte) → `.png` (ver histórico de commit; mesma técnica de
// `scripts/gerarIconesPwa.cjs`, headless Chrome/Edge).
//
// A release publicada (`server/scripts/publicarRelease.cjs`) leva `dist/`
// (build do Vite, que já copia `public/*` pra dentro) junto de `server/`,
// mas NÃO leva `public/` como pasta própria — por isso prioriza `dist/`, com
// fallback pro `public/` do repositório (caso de dev sem build ainda feito).
const ICONE_DIST = path.join(__dirname, '..', 'dist', 'icon-notificacao-bot.png');
const ICONE_PUBLIC = path.join(__dirname, '..', 'public', 'icon-notificacao-bot.png');
const ICONE = fs.existsSync(ICONE_DIST) ? ICONE_DIST : ICONE_PUBLIC;

function notificar({ titulo, mensagem }) {
  try {
    notifier.notify({ title: titulo, message: mensagem || '', appID: 'CARTEIRA 2D - monitorIA', icon: ICONE });
  } catch (err) {
    console.warn('Falha ao disparar notificação nativa:', err.message);
  }
}

module.exports = { notificar };
