const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const boardsDominio = require('../dominio/agilBoards.cjs');
const { validar, agilBoardCreateSchema, agilBoardUpdateSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  res.json(repo.get('AgilBoards'));
});

router.post('/', validar(agilBoardCreateSchema), (req, res) => {
  res.json(boardsDominio.criar(repo, req.body));
});

router.put('/:id', validar(agilBoardUpdateSchema), (req, res) => {
  const updated = boardsDominio.atualizar(repo, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Board não encontrado.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = boardsDominio.remover(repo, req.params.id);
  if (!found) return res.status(404).json({ error: 'Board não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
