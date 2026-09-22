const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');

const router = express.Router();
const repo = repoPlanilha();

// Só leitura: histórico é gravado como efeito colateral de
// `atualizarAgilTarefa` (dominio/agilHistorico.cjs), não por uma rota própria.
router.get('/', (req, res) => {
  const dados = repo.get('AgilHistorico');
  res.json(isClient ? aplicarOverlay('AgilHistorico', dados) : dados);
});

module.exports = router;
