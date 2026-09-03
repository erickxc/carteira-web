const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const clientesDominio = require('../dominio/clientes.cjs');
const { syncClienteColumns } = require('../db.cjs');
const { validar, validarLote, clienteCreateSchema, clienteUpdateSchema, clienteBulkItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');
const { cifrar, decifrar } = require('../crypto.cjs');

const router = express.Router();
const repo = repoPlanilha();

/**
 * `senhaPriceCifrada` NUNCA sai daqui pra um browser — nem o texto cifrado.
 * Ciphertext solto pela rede não é segredo nenhum se um dia a chave vazar
 * junto (ou for a mesma chave fraca), então não tem por que expor à toa.
 * `temSenhaPrice` (derivado, sem valor nenhum) é o suficiente pra tela saber
 * se já existe senha cadastrada e mostrar "•••• (definida)" em vez de vazio.
 * O único jeito de obter o texto puro é `POST /:id/price-credenciais/revelar`.
 */
function semSegredo(cliente) {
  if (!cliente) return cliente;
  const { senhaPriceCifrada, ...resto } = cliente;
  return { ...resto, temSenhaPrice: Boolean(senhaPriceCifrada) };
}

/**
 * `senhaPrice` (texto puro, só na REQUISIÇÃO) vira `senhaPriceCifrada` antes
 * de qualquer gravação — em nenhum momento o texto puro toca o repositório.
 * Ausente ou string vazia no corpo = "não mexer na senha já salva" (editar
 * outro campo do cadastro não pode apagar a senha do Price sem querer);
 * pra apagar de propósito, o corpo tem que mandar `senhaPrice: null`.
 */
function prepararPatchPrice(body) {
  if (!('senhaPrice' in body)) return body;
  const { senhaPrice, ...resto } = body;
  if (senhaPrice === null) return { ...resto, senhaPriceCifrada: '' };
  if (typeof senhaPrice === 'string' && senhaPrice.trim()) return { ...resto, senhaPriceCifrada: cifrar(senhaPrice) };
  return resto; // string vazia/whitespace: ignora, não apaga a senha atual
}

router.get('/', (req, res) => {
  const dados = repo.get('Clientes');
  const visiveis = (isClient ? aplicarOverlay('Clientes', dados) : dados).map(semSegredo);
  res.json(visiveis);
});

router.post('/', validar(clienteCreateSchema), (req, res) => {
  const criado = executarMutacao('clientes', 'create', { payload: prepararPatchPrice(req.body) });
  res.json(semSegredo(criado));
});

// Bulk (segmentação em várias lojas) ainda não passa pela fila — exceção já
// documentada no plano (confia no id do corpo, usado hoje só pelo modo
// server). Em modo cliente, isso continua bloqueado pela guarda de escrita
// direta em dbSqlite.cjs até essa exceção ser resolvida.
router.post('/bulk', validarLote(clienteBulkItemSchema), (req, res) => {
  const data = repo.get('Clientes');
  const newClients = req.body.map(syncClienteColumns);
  repo.save('Clientes', [...data, ...newClients]);
  newClients.forEach((c) => clientesDominio.gerarRelatorioSeConfigurado(c.id, c.relatorioCadencia));
  res.json({ success: true, count: newClients.length });
});

router.put('/:id', validar(clienteUpdateSchema), (req, res) => {
  const updated = executarMutacao('clientes', 'update', { id: req.params.id, patch: prepararPatchPrice(req.body) });
  if (!updated) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json(semSegredo(updated));
});

router.delete('/:id', (req, res) => {
  const found = executarMutacao('clientes', 'delete', { id: req.params.id });
  if (!found) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json({ success: true });
});

/**
 * Único lugar do sistema onde a senha do Price sai em texto puro — pro
 * helper local (Selenium, ainda não construído) preencher o login. Sem
 * autenticação própria: segue o mesmo modelo de confiança do resto do app
 * (LAN, sem login), documentado no CLAUDE.md — não é uma lacuna desta rota
 * em particular, é a decisão já existente pra tudo aqui.
 */
router.post('/:id/price-credenciais/revelar', (req, res) => {
  // Mesmo overlay do GET / (linha 45): numa máquina cliente, uma senha do
  // Price recém-cadastrada pode ainda estar só na fila, não aplicada no
  // SQLite local — sem isso, revelar lia o estado antigo e respondia 404
  // ("sem senha cadastrada") logo depois do usuário ter acabado de salvar.
  const dados = repo.get('Clientes');
  const cliente = (isClient ? aplicarOverlay('Clientes', dados) : dados).find((c) => String(c.id) === String(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!cliente.senhaPriceCifrada) return res.status(404).json({ error: 'Este cliente não tem senha do Price cadastrada.' });
  try {
    res.json({ loginPrice: cliente.loginPrice || '', senhaPrice: decifrar(cliente.senhaPriceCifrada) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
