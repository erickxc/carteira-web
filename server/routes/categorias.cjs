const express = require('express');
const crypto = require('crypto');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, categoriaUpdateSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

// --- Categorias API (CRUD de serviços, tipos de evento, status, monitores) ---
router.get('/', (req, res) => {
  res.json(repo.get('Categorias'));
});

router.post('/', (req, res) => {
  const data = repo.get('Categorias');
  const { tipo, valor } = req.body;
  if (!tipo || !valor || !String(valor).trim()) {
    return res.status(400).json({ error: 'tipo e valor são obrigatórios.' });
  }
  const jaExiste = data.some((c) => c.tipo === tipo && String(c.valor).toLowerCase() === String(valor).trim().toLowerCase());
  if (jaExiste) return res.status(409).json({ error: 'Categoria já existe.' });
  const ordem = data.filter((c) => c.tipo === tipo).length;
  const nova = { id: crypto.randomUUID(), tipo, valor: String(valor).trim(), ordem, createdAt: new Date().toISOString() };
  data.push(nova);
  repo.save('Categorias', data);
  res.json(nova);
});

router.put('/:id', validar(categoriaUpdateSchema), (req, res) => {
  const updated = repo.update('Categorias', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = repo.delete('Categorias', req.params.id);
  if (!found) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
