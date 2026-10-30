const express = require('express');
const { isClient } = require('../modo.cjs');
const { DW_PLATAFORMA_CONFIGURADO } = require('../config.cjs');
const { gerarRetrato, lerRetrato } = require('../dw/retratoProdutos.cjs');

const router = express.Router();

// Retrato "No DW agora" (`dados/dw-produtos.json`). `null` = DW nunca lido.
router.get('/', (req, res) => {
  try {
    res.json(lerRetrato());
  } catch (err) {
    res.status(500).json({ error: `Retrato do DW ilegível: ${err.message}` });
  }
});

// Força nova leitura. Só a servidora tem credencial do DW; as máquinas client
// leem o arquivo que ela grava no OneDrive.
router.post('/atualizar', async (req, res) => {
  if (isClient || !DW_PLATAFORMA_CONFIGURADO) {
    return res.status(409).json({ error: 'Só a máquina servidora consegue ler o DW. O retrato se atualiza lá todo dia.' });
  }
  try {
    res.json(await gerarRetrato());
  } catch (err) {
    res.status(502).json({ error: `Não foi possível ler o DW: ${err.message}` });
  }
});

module.exports = router;
