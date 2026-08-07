const express = require('express');
const { identificarCliente, extrairSecoes } = require('../identificarReuniao.cjs');

const router = express.Router();

// Recebe o texto bruto da transcrição (colado pelo usuário) e devolve os
// clientes candidatos + as seções já extraídas (Resumo/Tarefas/Capítulos/Bloco
// de Notas) — extração determinística, sem IA (ver server/identificarReuniao.cjs).
router.post('/identificar', (req, res) => {
  const texto = req.body?.texto;
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'texto é obrigatório.' });
  const candidatos = identificarCliente(texto);
  const secoes = extrairSecoes(texto);
  res.json({ candidatos, secoes });
});

module.exports = router;
