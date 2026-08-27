const fs = require('fs');
const AdmZip = require('adm-zip');

/** Compara duas versões "x.y.z" numericamente por segmento (não usa semver
 * completo de propósito — só precisamos saber "é mais nova ou não"). */
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

function lerVersaoInstalada(versaoArquivoPath) {
  try { return fs.readFileSync(versaoArquivoPath, 'utf8').trim(); } catch { return '0.0.0'; }
}

function precisaAtualizar(versaoInstalada, versaoDisponivel) {
  return versaoMaiorQue(versaoDisponivel, versaoInstalada);
}

/**
 * Extrai `zipPath` numa pasta temporária e só então faz o swap atômico
 * (`rename`) pra `appDir` — nunca escreve direto em `appDir`. Se qualquer
 * passo falhar (zip corrompido, disco cheio, etc.), limpa o que sobrou e
 * DEVOLVE `appDir` intacto — a pessoa nunca fica sem app funcionando por
 * causa de uma atualização que deu problema.
 */
function aplicarAtualizacao({ appDir, zipPath, novaVersao, versaoArquivoPath }) {
  const tmpDir = `${appDir}-novo`;
  const oldDir = `${appDir}-antigo`;

  try {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpDir, true);
  } catch (err) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return { ok: false, erro: `Falha ao extrair a atualização: ${err.message}` };
  }

  try {
    if (fs.existsSync(oldDir)) fs.rmSync(oldDir, { recursive: true, force: true });
    if (fs.existsSync(appDir)) fs.renameSync(appDir, oldDir);
    fs.renameSync(tmpDir, appDir);
    if (fs.existsSync(oldDir)) fs.rmSync(oldDir, { recursive: true, force: true });
    fs.writeFileSync(versaoArquivoPath, novaVersao, 'utf8');
    return { ok: true };
  } catch (err) {
    // A troca falhou no meio: se `appDir` foi movido pra `oldDir` mas o
    // rename do `tmpDir` não completou, restaura pra não ficar sem app.
    try {
      if (!fs.existsSync(appDir) && fs.existsSync(oldDir)) fs.renameSync(oldDir, appDir);
    } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return { ok: false, erro: `Falha ao trocar a instalação: ${err.message}` };
  }
}

module.exports = { versaoMaiorQue, precisaAtualizar, lerVersaoInstalada, aplicarAtualizacao };
