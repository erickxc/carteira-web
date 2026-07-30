const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { UPLOADS_DIR } = require('../config.cjs');

// --- Anexos (upload local de arquivos, dentro do OneDrive) ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    // path.basename tira qualquer componente de diretório do nome original
    // (ex.: "../../evil.exe") — sem isso, path.join dentro do multer resolve o
    // ".." e o arquivo pode escapar de UPLOADS_DIR (path traversal).
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}-${path.basename(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = express.Router();

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  res.json({
    id: req.file.filename,
    filename: req.file.filename,
    originalName: req.file.originalname,
    uploadedAt: new Date().toISOString(),
  });
});

router.delete('/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') return res.status(500).json({ error: 'Falha ao remover arquivo.' });
    res.json({ success: true });
  });
});

// Registra tanto o CRUD (/api/uploads) quanto a rota estática de download
// (/uploads/:filename) — as duas vivem juntas aqui porque compartilham
// UPLOADS_DIR e são conceitualmente a mesma feature.
function registerUploads(app) {
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/api/uploads', router);
}

module.exports = { registerUploads };
