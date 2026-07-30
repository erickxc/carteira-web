const express = require('express');
const crypto = require('crypto');
const { getSheetData, saveSheetData, updateSheetRow, deleteSheetRow } = require('../db.cjs');
const { validar, modeloCreateSchema, modeloUpdateSchema } = require('../validation.cjs');

const router = express.Router();

// --- Modelos/materiais por segmento ---
router.get('/', (req, res) => {
  res.json(getSheetData('Modelos'));
});

router.post('/', validar(modeloCreateSchema), (req, res) => {
  const data = getSheetData('Modelos');
  const nova = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...req.body };
  data.push(nova);
  saveSheetData('Modelos', data);
  res.json(nova);
});

router.put('/:id', validar(modeloUpdateSchema), (req, res) => {
  const updated = updateSheetRow('Modelos', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Modelo não encontrado.' });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const found = deleteSheetRow('Modelos', req.params.id);
  if (!found) return res.status(404).json({ error: 'Modelo não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
