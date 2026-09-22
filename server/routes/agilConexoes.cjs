const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { validar, agilConexaoCreateSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');

const router = express.Router();
const repo = repoPlanilha();

router.get('/', (req, res) => {
  const dados = repo.get('AgilConexoes');
  res.json(isClient ? aplicarOverlay('AgilConexoes', dados) : dados);
});

router.post('/', validar(agilConexaoCreateSchema), (req, res) => {
  res.json(executarMutacao('agilConexoes', 'create', { payload: req.body }));
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('agilConexoes', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Conexão não encontrada.' });
  res.json({ success: true });
});

module.exports = router;
