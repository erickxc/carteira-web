const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const tarefasDominio = require('../dominio/agilTarefas.cjs');
const { validar, validarLote, agilTarefaCreateSchema, agilTarefaUpdateSchema, agilReorderTarefaItemSchema } = require('../validation.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  res.json(repo.get('AgilTarefas'));
});

router.post('/', validar(agilTarefaCreateSchema), (req, res) => {
  res.json(tarefasDominio.criar(repo, req.body));
});

// Precisa vir antes de '/:id' — senão o Express tentaria casar "reorder" como id.
router.put('/reorder', validarLote(agilReorderTarefaItemSchema), (req, res) => {
  res.json(tarefasDominio.reordenar(repo, req.body));
});

router.put('/:id', validar(agilTarefaUpdateSchema), (req, res) => {
  const updated = tarefasDominio.atualizar(repo, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const found = tarefasDominio.remover(repo, req.params.id);
  if (!found) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
