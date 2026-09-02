const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, agilComentarioCreateSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilComentarios');
  res.json(isClient ? aplicarOverlay('AgilComentarios', dados) : dados);
});

router.post('/', validar(agilComentarioCreateSchema), (req, res) => {
  res.json(executarMutacao('agilComentarios', 'create', { payload: req.body }));
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilComentarios', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Comentário não encontrado.' });
  res.json({ success: true });
});

module.exports = router;
