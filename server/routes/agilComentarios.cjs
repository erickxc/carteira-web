const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const comentariosDominio = require('../dominio/agilComentarios.cjs');
const { validar, agilComentarioCreateSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  res.json(repo.get('AgilComentarios'));
});

router.post('/', validar(agilComentarioCreateSchema), (req, res) => {
  res.json(comentariosDominio.criar(repo, req.body));
});

router.delete('/:id', (req, res) => {
  const found = comentariosDominio.remover(repo, req.params.id);
  if (!found) return res.status(404).json({ error: 'Comentário não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
