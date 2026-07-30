const express = require('express');
const { getSheetData, saveSheetData } = require('../db.cjs');
const { CADENCIAS_SEED } = require('../config.cjs');

const router = express.Router();
const CADENCIAS_CHAVES = new Set(CADENCIAS_SEED.map((c) => c.chave));

// --- Cadências (prazos das recomendações) ---
router.get('/', (req, res) => {
  const rows = getSheetData('Cadencias');
  const obj = {};
  rows.forEach((r) => { obj[r.chave] = Number(r.valor); });
  res.json(obj);
});

router.put('/', (req, res) => {
  // Recebe objeto { chave: valor } e regrava a planilha inteira.
  const body = req.body || {};
  for (const [chave, valor] of Object.entries(body)) {
    if (!CADENCIAS_CHAVES.has(chave)) {
      return res.status(400).json({ error: `Chave de cadência desconhecida: "${chave}".` });
    }
    if (!Number.isFinite(Number(valor))) {
      return res.status(400).json({ error: `Valor inválido para "${chave}": ${JSON.stringify(valor)} não é um número.` });
    }
  }
  const rows = Object.entries(body).map(([chave, valor]) => ({ chave, valor: Number(valor) }));
  saveSheetData('Cadencias', rows);
  res.json({ success: true });
});

module.exports = router;
