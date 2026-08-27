const express = require('express');
const { statusFila } = require('../fila/status.cjs');

const router = express.Router();

// Funciona nos dois modos: em "server" sempre devolve zerado (nada fica
// pendente — a máquina dona do banco escreve direto). Em "client" reflete o
// que ainda está esperando o controller confirmar.
router.get('/status', (req, res) => {
  res.json(statusFila());
});

module.exports = router;
