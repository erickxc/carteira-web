const express = require('express');
const crypto = require('crypto');
const { getSheetData, saveSheetData, updateSheetRow, deleteSheetRow } = require('../db.cjs');
const { validar, acaoCreateSchema, acaoUpdateSchema } = require('../validation.cjs');

const router = express.Router();

// --- Ações (recomendações tratadas: programado/concluído/dispensado) ---
router.get('/', (req, res) => {
  res.json(getSheetData('Acoes'));
});

router.post('/', validar(acaoCreateSchema), (req, res) => {
  const data = getSheetData('Acoes');
  const now = new Date().toISOString();
  const nova = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...req.body };
  data.push(nova);
  saveSheetData('Acoes', data);
  res.json(nova);
});

router.put('/:id', validar(acaoUpdateSchema), (req, res) => {
  const updated = updateSheetRow('Acoes', req.params.id, req.body, (row) => ({ ...row, updatedAt: new Date().toISOString() }));
  if (!updated) return res.status(404).json({ error: 'Ação não encontrada.' });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const found = deleteSheetRow('Acoes', req.params.id);
  if (!found) return res.status(404).json({ error: 'Ação não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
