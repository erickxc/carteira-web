const express = require('express');
const { getCache } = require('../ceoAgenda.cjs');

const router = express.Router();

// Somente leitura: retorna o cache já pronto, nunca busca o .ics na hora da
// requisição (não faz o usuário esperar o Google responder).
router.get('/', (req, res) => {
  res.json(getCache());
});

module.exports = router;
