const fs = require('fs');
const { TAGS_CLIENTE_FINAL_PATH } = require('../config.cjs');

/**
 * Tags de CLIENTE FINAL lidas do arquivo COMPARTILHADO do Ecossistema-Monitoria
 * (`Bancos/tags.json`) — não é enum daqui nem categoria do app: outras
 * ferramentas da 2D leem o mesmo arquivo, então a lista precisa vir da fonte
 * única pra não divergir ("harmonizar", pedido do usuário).
 *
 * Arquivo ausente/ilegível devolve lista vazia em vez de derrubar: a
 * integração é opcional (nem toda máquina tem a pasta sincronizada), e sem
 * tags o app segue funcionando — só não oferece tag pra marcar.
 *
 * Sem cache de propósito: o arquivo é minúsculo (centenas de bytes), muda por
 * fora deste app, e cachear traria o problema clássico de "editei lá e aqui
 * continua o valor velho até reiniciar".
 */

function carregarTags(caminho = TAGS_CLIENTE_FINAL_PATH) {
  let bruto;
  try {
    bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];

  return bruto
    .filter((t) => t && typeof t.id === 'string' && t.id.trim())
    .map((t) => ({
      id: String(t.id).trim(),
      rotulo: typeof t.rotulo === 'string' && t.rotulo.trim() ? t.rotulo.trim() : String(t.id).trim(),
      // `ativa` ausente conta como ativa: o arquivo é editado à mão por fora,
      // e faltar o campo não deve esconder a tag em silêncio.
      ativa: t.ativa !== false,
      entraNaAnalise: t.entra_na_analise !== false,
      cor: typeof t.cor === 'string' ? t.cor : null,
    }));
}

/** Só as tags marcadas como ativas — é o que se oferece pra marcar na tela. */
function tagsAtivas(caminho) {
  return carregarTags(caminho).filter((t) => t.ativa);
}

/** `true` se o id existe e está ativo — usado antes de gravar (nunca grava tag crua). */
function tagValida(id, caminho) {
  return tagsAtivas(caminho).some((t) => t.id === id);
}

module.exports = { carregarTags, tagsAtivas, tagValida };
