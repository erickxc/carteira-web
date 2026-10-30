const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');

const router = express.Router();
const repo = repoPlanilha();

// Somente leitura: o log é escrito pelo backend (`dominio/produtosHistorico.cjs`),
// nunca pela tela.
router.get('/', (req, res) => {
  res.json(repo.get('ProdutosHistorico'));
});

module.exports = router;
