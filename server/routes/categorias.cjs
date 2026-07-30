const express = require('express');
const crypto = require('crypto');
const { getSheetData, saveSheetData, updateSheetRow, deleteSheetRow } = require('../db.cjs');
const { validar, categoriaUpdateSchema } = require('../validation.cjs');

const router = express.Router();

// --- Categorias API (CRUD de serviços, tipos de evento, status, monitores) ---
router.get('/', (req, res) => {
  res.json(getSheetData('Categorias'));
});

router.post('/', (req, res) => {
  const data = getSheetData('Categorias');
  const { tipo, valor } = req.body;
  if (!tipo || !valor || !String(valor).trim()) {
    return res.status(400).json({ error: 'tipo e valor são obrigatórios.' });
  }
  const jaExiste = data.some((c) => c.tipo === tipo && String(c.valor).toLowerCase() === String(valor).trim().toLowerCase());
  if (jaExiste) return res.status(409).json({ error: 'Categoria já existe.' });
  const ordem = data.filter((c) => c.tipo === tipo).length;
  const nova = { id: crypto.randomUUID(), tipo, valor: String(valor).trim(), ordem, createdAt: new Date().toISOString() };
  data.push(nova);
  saveSheetData('Categorias', data);
  res.json(nova);
});

router.put('/:id', validar(categoriaUpdateSchema), (req, res) => {
  const updated = updateSheetRow('Categorias', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const found = deleteSheetRow('Categorias', req.params.id);
  if (!found) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
