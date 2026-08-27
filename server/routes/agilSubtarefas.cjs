const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const subtarefasDominio = require('../dominio/agilSubtarefas.cjs');
const { validar, agilSubtarefaCreateSchema, agilSubtarefaUpdateSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  res.json(repo.get('AgilSubtarefas'));
});

router.post('/', validar(agilSubtarefaCreateSchema), (req, res) => {
  res.json(subtarefasDominio.criar(repo, req.body));
});

router.put('/:id', validar(agilSubtarefaUpdateSchema), (req, res) => {
  const updated = subtarefasDominio.atualizar(repo, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Subtarefa não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = subtarefasDominio.remover(repo, req.params.id);
  if (!found) return res.status(404).json({ error: 'Subtarefa não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
