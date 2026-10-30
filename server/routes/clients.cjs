const express = require('express');
const { repoPlanilha } = require('../dominio/repo.cjs');
const clientesDominio = require('../dominio/clientes.cjs');
const { syncClienteColumns } = require('../db.cjs');
const { validar, validarLote, clienteCreateSchema, clienteUpdateSchema, clienteBulkItemSchema } = require('../validation.cjs');
const { isClient } = require('../modo.cjs');
const { aplicarOverlay } = require('../fila/pendentes.cjs');
const { executarMutacao } = require('../fila/mutacao.cjs');
const { cifrar, decifrar } = require('../crypto.cjs');
const { renomearProduto } = require('../../shared/produtos.cjs');

const router = express.Router();
const repo = repoPlanilha();

/**
 * `senhaPriceCifrada` NUNCA sai daqui pra um browser — nem o texto cifrado.
 * Ciphertext solto pela rede não é segredo nenhum se um dia a chave vazar
 * junto (ou for a mesma chave fraca), então não tem por que expor à toa.
 * `temSenhaPrice` (derivado, sem valor nenhum) é o suficiente pra tela saber
 * se já existe senha cadastrada e mostrar "•••• (definida)" em vez de vazio.
 * O único jeito de obter o texto puro é `POST /:id/price-credenciais/revelar`
 * (ou a de produto, abaixo).
 * Produtos (1.7.0): mesma regra pra `senhaCifrada` de CADA produto (vira
 * `temSenha`). Cliente ainda não migrado recebe `produtos` montado do formato
 * antigo, só na resposta — nada é gravado (`produtosDoCliente`).
 */
function semSegredo(cliente) {
  if (!cliente) return cliente;
  const { senhaPriceCifrada, ...resto } = cliente;
  const produtos = clientesDominio.produtosDoCliente(cliente).map(({ senhaCifrada, ...p }) => ({ ...p, temSenha: Boolean(senhaCifrada) }));
  return { ...resto, produtos, temSenhaPrice: Boolean(senhaPriceCifrada) };
}

/**
 * `senhaPrice` (texto puro, só na REQUISIÇÃO) vira `senhaPriceCifrada` antes
 * de qualquer gravação — em nenhum momento o texto puro toca o repositório.
 * Ausente ou string vazia no corpo = "não mexer na senha já salva" (editar
 * outro campo do cadastro não pode apagar a senha do Price sem querer);
 * pra apagar de propósito, o corpo tem que mandar `senhaPrice: null`.
 * Mesma regra por produto: `produtos[i].senha` vira `senhaCifrada` (null =
 * apagar; ausente/vazia = o domínio mantém a salva).
 */
function prepararPatchPrice(body) {
  let out = body;
  if (Array.isArray(body.produtos)) {
    out = { ...out, produtos: body.produtos.map(cifrarSenhaProduto) };
  }
  if (body.produtoAlterado && typeof body.produtoAlterado === 'object') {
    out = { ...out, produtoAlterado: cifrarSenhaProduto(body.produtoAlterado) };
  }
  if (!('senhaPrice' in out)) return out;
  const { senhaPrice, ...resto } = out;
  if (senhaPrice === null) return { ...resto, senhaPriceCifrada: '' };
  if (typeof senhaPrice === 'string' && senhaPrice.trim()) return { ...resto, senhaPriceCifrada: cifrar(senhaPrice) };
  return resto; // string vazia/whitespace: ignora, não apaga a senha atual
}

function cifrarSenhaProduto(item) {
  if (!item || typeof item !== 'object') return item;
  // `senhaCifrada` vinda do corpo é descartada: só o servidor a produz.
  const { senha, senhaCifrada: _ignorada, temSenha: _derivado, ...resto } = item;
  if (senha === null) return { ...resto, senhaCifrada: '' };
  if (typeof senha === 'string' && senha.trim()) return { ...resto, senhaCifrada: cifrar(senha) };
  return resto;
}

/** Erro de validação do domínio (400) ou conflito (409) vira resposta JSON; o resto segue pro Express. */
function responderErroDominio(res, err) {
  if (err && (err.status === 400 || err.status === 409)) return res.status(err.status).json({ error: err.message });
  throw err;
}

/** Leitura com o overlay da fila (ver comentário de `price-credenciais/revelar`). */
function acharCliente(id) {
  const dados = repo.get('Clientes');
  return (isClient ? aplicarOverlay('Clientes', dados) : dados).find((c) => String(c.id) === String(id));
}

router.get('/', (req, res) => {
  const dados = repo.get('Clientes');
  const visiveis = (isClient ? aplicarOverlay('Clientes', dados) : dados).map(semSegredo);
  res.json(visiveis);
});

router.post('/', validar(clienteCreateSchema), (req, res) => {
  try {
    const criado = executarMutacao('clientes', 'create', { payload: prepararPatchPrice(req.body) });
    res.json(semSegredo(criado));
  } catch (err) {
    responderErroDominio(res, err);
  }
});

// Bulk (segmentação em várias lojas) ainda não passa pela fila — exceção já
// documentada no plano (confia no id do corpo, usado hoje só pelo modo
// server). Em modo cliente, isso continua bloqueado pela guarda de escrita
// direta em dbSqlite.cjs até essa exceção ser resolvida.
router.post('/bulk', validarLote(clienteBulkItemSchema), (req, res) => {
  const data = repo.get('Clientes');
  const newClients = req.body.map((c) => syncClienteColumns(prepararPatchPrice(c)));
  repo.save('Clientes', [...data, ...newClients]);
  newClients.forEach((c) => clientesDominio.gerarRelatorioSeConfigurado(c.id, c.relatorioCadencia));
  res.json({ success: true, count: newClients.length });
});

router.put('/:id', validar(clienteUpdateSchema), (req, res) => {
  let updated;
  try {
    updated = executarMutacao('clientes', 'update', { id: req.params.id, patch: prepararPatchPrice(req.body) });
  } catch (err) {
    return responderErroDominio(res, err);
  }
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
  // Mesmo overlay do GET /: numa máquina cliente, uma senha do
  // Price recém-cadastrada pode ainda estar só na fila, não aplicada no
  // SQLite local — sem isso, revelar lia o estado antigo e respondia 404
  // ("sem senha cadastrada") logo depois do usuário ter acabado de salvar.
  // Com `produtos`, `senhaPriceCifrada` já é derivado do produto 2D Price
  // (syncClienteColumns); sem, é o campo legado — a mesma leitura cobre os dois.
  const cliente = acharCliente(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!cliente.senhaPriceCifrada) return res.status(404).json({ error: 'Este cliente não tem senha do Price cadastrada.' });
  try {
    res.json({ loginPrice: cliente.loginPrice || '', senhaPrice: decifrar(cliente.senhaPriceCifrada) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Login/senha de qualquer produto (1.7.0) — mesmo modelo de confiança da rota do Price acima. */
router.post('/:id/produtos/:produto/credenciais/revelar', (req, res) => {
  const cliente = acharCliente(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  const nome = renomearProduto(req.params.produto);
  const produto = clientesDominio.produtosDoCliente(cliente).find((p) => renomearProduto(p.produto) === nome);
  if (!produto || !produto.senhaCifrada) return res.status(404).json({ error: `Este cliente não tem senha cadastrada para ${nome}.` });
  try {
    res.json({ login: produto.login || '', senha: decifrar(produto.senhaCifrada) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
