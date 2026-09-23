/**
 * "Abrir pelo endereço carteira-2d.localhost" — configuração desta MÁQUINA.
 * Fica no backend (e não no localStorage do navegador) porque o navegador
 * separa o armazenamento por endereço: desmarcada no endereço novo, o antigo
 * nunca saberia e redirecionaria de volta. Em SQLITE_DIR (LOCALAPPDATA),
 * nunca no OneDrive: cada máquina decide a sua.
 */
const fs = require('fs');
const path = require('path');

function arquivoPadrao() {
  const { SQLITE_DIR } = require('./config.cjs');
  return path.join(SQLITE_DIR, 'endereco-local.json');
}

// Ligado por padrão: todo mundo abre por nome (carteira-2d.localhost); quem não quiser desmarca.
function lerAbrirPorNome(arquivo = arquivoPadrao()) {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return typeof dados.abrirPorNome === 'boolean' ? dados.abrirPorNome : true;
  } catch {
    return true;
  }
}

function gravarAbrirPorNome(abrirPorNome, arquivo = arquivoPadrao()) {
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ abrirPorNome: Boolean(abrirPorNome) }, null, 2));
  fs.renameSync(tmp, arquivo);
  return Boolean(abrirPorNome);
}

module.exports = { lerAbrirPorNome, gravarAbrirPorNome };
