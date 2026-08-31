/**
 * Extração das entidades (produto / cliente final) citadas no texto de uma ata.
 *
 * A regra que define este módulo: **só vale entidade que casa com a lista real
 * do arquivo de vendas.** Nada é inferido de prosa livre.
 *
 * Por quê, concretamente: o bloco "retorno do combinado" mede movimento de
 * receita desde a data em que algo foi decidido. Se a ata diz "kit de
 * amortecedores" e o produto no arquivo é "Kit Amortecedor", aceitar o texto
 * como veio faria o cálculo medir um produto que não existe — resultado zero,
 * lido como "não movimentou". Ou seja: um erro de nome viraria uma conclusão de
 * negócio errada, com aparência de achado. É a mesma disciplina do
 * `resolverOpcao` em server/ia/tools.cjs, que nasceu do bug real de
 * `monitores: ["Erick"]` gravado sem existir no cadastro.
 *
 * O casamento é por texto normalizado (sem acento, minúsculo) e exige limite de
 * palavra nas duas pontas, para "Pneu" não casar dentro de "Pneumático". Quando
 * dois nomes casam no mesmo trecho, vence o MAIS LONGO ("Kit Amortecedor" antes
 * de "Amortecedor") — senão a entidade medida seria a categoria mais genérica.
 */

const MIN_CARACTERES = 4;

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizar = (t) => semAcento(t).toLowerCase().replace(/\s+/g, ' ').trim();

/** Escapa o nome para uso em regex — nomes reais têm ".", "-", "&", "(", ")". */
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Um nome "casa" se aparece delimitado por não-letra (ou pelas bordas). Não uso
 * `\b` porque a normalização deixa dígitos e letras misturados em nomes de
 * cliente ("34.121.280 CRISTIAN...") e `\b` quebra em lugares errados aí.
 */
function citado(textoNormalizado, nome) {
  const alvo = normalizar(nome);
  if (alvo.length < MIN_CARACTERES) return false;
  return new RegExp(`(^|[^a-z0-9])${escapar(alvo)}($|[^a-z0-9])`).test(textoNormalizado);
}

/**
 * @param texto  ata (ou qualquer texto da reunião)
 * @param listas `{ produtos: string[], clientes: string[] }` vindas do agregado
 *               do arquivo — a fonte da verdade sobre que nomes existem.
 * @returns `[{ nome, tipo }]` sem repetição, do nome mais longo para o mais
 *          curto, já descartando nome contido em outro que também casou.
 */
function extrairEntidades(texto, listas = {}) {
  const alvo = normalizar(texto);
  if (!alvo) return [];

  const candidatos = [
    ...(listas.produtos || []).map((nome) => ({ nome, tipo: 'produto' })),
    ...(listas.clientes || []).map((nome) => ({ nome, tipo: 'cliente' })),
  ].filter((c) => citado(alvo, c.nome));

  // Do mais longo para o mais curto: é o que permite descartar o contido.
  candidatos.sort((a, b) => normalizar(b.nome).length - normalizar(a.nome).length);

  const escolhidos = [];
  for (const c of candidatos) {
    const n = normalizar(c.nome);
    const jaCoberto = escolhidos.some((e) => e.tipo === c.tipo && normalizar(e.nome).includes(n));
    if (!jaCoberto) escolhidos.push(c);
  }
  return escolhidos;
}

/**
 * Entidades citadas nas atas de vários eventos, com a data em que apareceram.
 *
 * `combinadoEm` é a data da PRIMEIRA reunião que citou a entidade, e `reunioes`
 * lista todas — é o que sustenta a frase "combinado em 12/06 e reforçado em
 * 10/07, sem reação": duas menções sem movimento dizem que a abordagem está
 * errada, uma menção só ainda não diz nada.
 */
function entidadesDosEventos(eventos, listas = {}) {
  const porChave = new Map();

  const ordenados = [...eventos]
    .filter((ev) => ev?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (const ev of ordenados) {
    // Ata é a fonte preferida; sem ela, o resumo/descrição da reunião. Sem
    // nenhum dos três não há o que extrair — e é o caso comum de evento futuro.
    const texto = ev.ata?.trim() || ev.resumo?.trim() || ev.description?.trim() || '';
    if (!texto) continue;

    for (const e of extrairEntidades(texto, listas)) {
      const chave = `${e.tipo}:${normalizar(e.nome)}`;
      const atual = porChave.get(chave);
      if (atual) {
        atual.reunioes.push(ev.date);
      } else {
        porChave.set(chave, { nome: e.nome, tipo: e.tipo, combinadoEm: ev.date, reunioes: [ev.date] });
      }
    }
  }

  return [...porChave.values()];
}

module.exports = { extrairEntidades, entidadesDosEventos, citado, normalizar, MIN_CARACTERES };
