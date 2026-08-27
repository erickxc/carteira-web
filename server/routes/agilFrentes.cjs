const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const frentesDominio = require('../dominio/agilFrentes.cjs');
const { validar, validarLote, agilFrenteCreateSchema, agilFrenteUpdateSchema, agilReorderFrenteItemSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  res.json(repo.get('AgilFrentes'));
});

router.post('/', validar(agilFrenteCreateSchema), (req, res) => {
  res.json(frentesDominio.criar(repo, req.body));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderFrenteItemSchema), (req, res) => {
  res.json(frentesDominio.reordenar(repo, req.body));
});

router.put('/:id', validar(agilFrenteUpdateSchema), (req, res) => {
  const updated = frentesDominio.atualizar(repo, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Frente não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = frentesDominio.remover(repo, req.params.id);
  if (!found) return res.status(404).json({ error: 'Frente não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
