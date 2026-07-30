const express = require('express');
const crypto = require('crypto');
const { getSheetData, saveSheetData, updateSheetRow, deleteSheetRow } = require('../db.cjs');
const { validar, lembreteCreateSchema, lembreteUpdateSchema } = require('../validation.cjs');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(getSheetData('Lembretes'));
});

router.post('/', validar(lembreteCreateSchema), (req, res) => {
  const data = getSheetData('Lembretes');
  // id gerado aqui, mesma razão das rotas de Clientes/Agenda.
  const newItem = { ...req.body, id: crypto.randomUUID() };
  data.push(newItem);
  saveSheetData('Lembretes', data);
  res.json(newItem);
});

router.put('/:id', validar(lembreteUpdateSchema), (req, res) => {
  const updated = updateSheetRow('Lembretes', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Lembrete não encontrado.' });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const found = deleteSheetRow('Lembretes', req.params.id);
  if (!found) return res.status(404).json({ error: 'Lembrete não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
