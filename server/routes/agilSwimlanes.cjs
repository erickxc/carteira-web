const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const swimlanesDominio = require('../dominio/agilSwimlanes.cjs');
const { validar, validarLote, agilSwimlaneCreateSchema, agilSwimlaneUpdateSchema, agilReorderSwimlaneItemSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  res.json(repo.get('AgilSwimlanes'));
});

router.post('/', validar(agilSwimlaneCreateSchema), (req, res) => {
  res.json(swimlanesDominio.criar(repo, req.body));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderSwimlaneItemSchema), (req, res) => {
  res.json(swimlanesDominio.reordenar(repo, req.body));
});

router.put('/:id', validar(agilSwimlaneUpdateSchema), (req, res) => {
  const updated = swimlanesDominio.atualizar(repo, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Swimlane não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = swimlanesDominio.remover(repo, req.params.id);
  if (!found) return res.status(404).json({ error: 'Swimlane não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
