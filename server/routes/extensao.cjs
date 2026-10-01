/**
 * Download da extensão de acessos, sempre na versão mais recente.
 *
 * A extensão em uso é editada direto na pasta do OneDrive do Ecossistema
 * (`EXTENSAO_DIR`), não no repositório. O botão de Configurações → Sistema
 * apontava pra um .zip estático gerado no build, que só mudava a cada release
 * e ficou preso numa versão antiga. Agora o zip é montado NA HORA do clique a
 * partir da pasta — como todas as máquinas sincronizam o OneDrive, cada uma
 * entrega o que estiver lá naquele momento.
 *
 * `api/` e `.env*` ficam de fora: são o backend da extensão (com credencial
 * do banco), nunca vão pra máquina de quem instala.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const AdmZip = require('adm-zip');
const { EXTENSAO_DIR } = require('../config.cjs');

const NOME_PASTA_NO_ZIP = '2D Acessos';
const FORA_DO_ZIP = /(^|[\\/])(api([\\/]|$)|\.env)/;

/** Zip da pasta da extensão, sem o backend dela. Devolve null se a pasta não existe. */
function montarZipExtensao(dir = EXTENSAO_DIR) {
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) return null;
  const zip = new AdmZip();
  // Pasta única dentro do zip: "Carregar sem compactação" espera apontar pra uma pasta.
  zip.addLocalFolder(dir, NOME_PASTA_NO_ZIP, (arquivo) => !FORA_DO_ZIP.test(arquivo));
  return zip.toBuffer();
}

const router = express.Router();

router.get('/download', (_req, res) => {
  const buffer = montarZipExtensao();
  if (!buffer) return res.status(404).json({ error: `Pasta da extensão não encontrada: ${EXTENSAO_DIR}` });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="extensao-2d-acessos.zip"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

module.exports = router;
module.exports.montarZipExtensao = montarZipExtensao;
