// Vocabulário passado ao Whisper (`initial_prompt`/`hotwords`) em cada reunião:
// nomes do cliente primeiro (o que o modelo mais erra), depois o jargão da 2D,
// depois o catálogo do Alvos. O Whisper só aproveita ~224 tokens de prompt,
// por isso o corte em 800 caracteres — o que fica de fora é o fim do catálogo.
const fs = require('fs');
const path = require('path');
const { listaJSON } = require('../../shared/cadenciaServico.cjs');

const LIMITE = 800;
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function baseDa2D() {
  return fs.readFileSync(path.join(__dirname, 'vocabulario2D.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function montarVocabulario({ cliente, catalogo = {}, base = baseDa2D() } = {}) {
  const termos = [
    cliente?.empresa,
    ...listaJSON(cliente?.lojasCadastro).map((l) => l?.nome),
    ...listaJSON(cliente?.contatos).map((c) => c?.nome),
    ...base,
    ...(catalogo.produtos ?? []),
    ...(catalogo.clientes ?? []),
  ];
  const vistos = new Set();
  let saida = '';
  for (const t of termos) {
    const termo = String(t ?? '').trim();
    const chave = semAcento(termo);
    if (!termo || vistos.has(chave)) continue;
    const proximo = saida ? `${saida}, ${termo}` : termo;
    if (proximo.length > LIMITE) break;
    vistos.add(chave);
    saida = proximo;
  }
  return saida;
}

function vocabularioDoEvento(repo, evento) {
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(evento?.clientId));
  let catalogo = {};
  if (cliente) {
    try {
      const { catalogoDoCliente } = require('../alvos/consulta.cjs');
      catalogo = catalogoDoCliente(cliente.id);
    } catch {
      catalogo = {};
    }
  }
  return montarVocabulario({ cliente, catalogo });
}

module.exports = { montarVocabulario, vocabularioDoEvento };
