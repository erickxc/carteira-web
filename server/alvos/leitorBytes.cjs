const AdmZip = require('adm-zip');

/**
 * Leitura de planilha ALÉM do limite que o `xlsx` (SheetJS) consegue abrir.
 *
 * Causa raiz medida em produção: o Node/V8 não cria uma string com mais de
 * `0x1fffffe8` caracteres (~512 MB). O SheetJS precisa converter o XML de cada
 * aba pra uma string ANTES de parsear — quando a aba passa disso, essa
 * conversão lança `RangeError: Cannot create a string longer than...`, e o
 * SheetJS **engole esse erro em silêncio** (só com `{WTF: true}` ele
 * repropaga): `wb.Sheets[nome]` fica `undefined`, sem aviso nenhum. Já
 * causou dado ERRADO em produção — `escolherAba()` aceitava calado a aba
 * pequena de fallback como se fosse a única, ou usava uma aba menor e
 * desatualizada quando havia duas (medido em Altese, Gomec, Motobras: a aba
 * "Dados", com o dado real, ficava de fora; "Dados (2)", um subconjunto
 * pequeno e antigo, era usada como se fosse tudo).
 *
 * A saída daqui NUNCA converte o buffer inteiro pra string: varre os BYTES
 * procurando `<row>...</row>`, e só a fatia de UMA linha (poucos KB) vira
 * string por vez. Isso também é ~1000x mais rápido que o SheetJS pra esse
 * caso (medido: 555 MB em 3s aqui contra 30+ min sem terminar no SheetJS —
 * a diferença não é só o limite de string, é que o SheetJS monta uma árvore
 * de objetos por célula; aqui só extraímos os campos que a coluna precisa).
 *
 * Célula de texto aparece de 3 formas no OOXML, e as três precisam de
 * tratamento diferente — confirmado batendo contra os arquivos REAIS
 * (Ecossistema-Monitoria usa `inlineStr`) e contra o que o próprio `xlsx`
 * escreve por padrão nos testes (`t="str"`, texto literal dentro de `<v>`,
 * SEM `sharedStrings.xml`) — o teste cruzado deste módulo já pegou essa
 * segunda forma uma vez, por isso as três ficam suportadas:
 *   - `t="inlineStr"`: texto dentro de `<is><t>...</t></is>`.
 *   - `t="s"`: `<v>` é um ÍNDICE pra `sharedStrings.xml` (resolvido aqui).
 *   - `t="str"` (ou sem `t`, célula numérica): `<v>` já é o valor final.
 *
 * Limitação deliberada, documentada pra não ser redescoberta como bug: texto
 * rico (`<r>` fatiado dentro de `<si>`) além do primeiro `<t>`, fórmulas e
 * mesclagem de célula não são tratados — não aparecem nos arquivos desta
 * fonte, e não vale complicar o parser por um caso hipotético.
 */

/**
 * Limite pra decidir "usa o parser por bytes" — não é só sobre não estourar o
 * limite físico do V8 (~512 MiB). A DLemos mede 495,8 MB (< 512 MiB, então o
 * SheetJS não trava por causa DESSE limite) e mesmo assim levou 30+ minutos
 * sem terminar via SheetJS — o problema real ali é o VOLUME de linhas (862 mil)
 * combinado com texto solto por célula (`inlineStr`), que o SheetJS aloca
 * célula por célula. 400 MB fica com folga dos dois lados: bem abaixo do
 * limite físico, e acima de toda empresa medida que lê rápido pelo caminho
 * normal (a maior confirmada rápida foi a Mega, 217 MB).
 */
const LIMITE_SEGURO_BYTES = 400 * 1024 * 1024;

const ROW_ABRE = Buffer.from('<row ');
const ROW_FECHA = Buffer.from('</row>');
const RE_CELULA = /<c r="([A-Z]+)\d+"[^>]*?(?:\st="([a-z]+)")?[^>]*>(?:<is>((?:<r>.*?<\/r>)+|<t[^>]*>[^<]*<\/t>)<\/is>|<v>([^<]*)<\/v>)?<\/c>/g;
const RE_TEXTO_INLINE = /<t[^>]*>([^<]*)<\/t>/g;

// XML escapa &<>"' — nomes reais da fonte usam todos ("MATOS & FILHAS",
// "D'LEMOS"). Sem isto o texto voltaria com `&amp;` literal.
const ENTIDADES_XML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodificarXml(texto) {
  return texto.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, cod) => {
    if (cod[0] === '#') {
      const codigo = cod[1] === 'x' ? parseInt(cod.slice(2), 16) : parseInt(cod.slice(1), 10);
      return String.fromCodePoint(codigo);
    }
    return ENTIDADES_XML[cod] ?? m;
  });
}

/** Tamanho (descomprimido) da maior aba do zip — 0 se não achar nenhuma. */
function maiorAbaBytes(zip) {
  return zip.getEntries()
    .filter((e) => e.entryName.startsWith('xl/worksheets/'))
    .reduce((max, e) => Math.max(max, e.header.size), 0);
}

/** true = alguma aba deste arquivo provavelmente estoura o limite de string do Node. */
function precisaFallback(caminho, limite = LIMITE_SEGURO_BYTES) {
  const zip = new AdmZip(caminho);
  return maiorAbaBytes(zip) > limite;
}

function mapaRels(zip) {
  const entry = zip.getEntry('xl/_rels/workbook.xml.rels');
  if (!entry) return new Map();
  const xml = entry.getData().toString('utf8'); // pequeno, sempre seguro
  return new Map([...xml.matchAll(/<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map(([, rid, alvo]) => [rid, alvo]));
}

function listaSheets(zip) {
  const entry = zip.getEntry('xl/workbook.xml');
  const xml = entry.getData().toString('utf8'); // pequeno, sempre seguro
  return [...xml.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map(([, nome, rid]) => ({ nome, rid }));
}

/**
 * `sharedStrings.xml` (quando existe): concatena os `<t>` de cada `<si>` —
 * cobre tanto texto direto quanto texto "rico" fatiado em `<r><t>` runs.
 * Ausente é normal (arquivo todo em `inlineStr`), não erro.
 */
function tabelaDeStrings(zip) {
  const entry = zip.getEntry('xl/sharedStrings.xml');
  if (!entry) return [];
  const xml = entry.getData().toString('utf8');
  if (xml.length > LIMITE_SEGURO_BYTES) {
    throw new Error('sharedStrings.xml também excede o limite de string — sem suporte nesse caso.');
  }
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map(([, corpo]) => {
    let texto = '';
    for (const m of corpo.matchAll(RE_TEXTO_INLINE)) texto += m[1];
    return decodificarXml(texto);
  });
}

/** Primeira linha (`<row r="1">`) de um buffer de aba, sem tocar o resto. */
function linhaHeaderBuffer(buf) {
  const abre = buf.indexOf(Buffer.from('<row r="1"'));
  if (abre === -1) return null;
  const fecha = buf.indexOf(ROW_FECHA, abre);
  if (fecha === -1) return null;
  return buf.toString('utf8', abre, fecha + ROW_FECHA.length); // 1 linha, sempre pequena
}

/** `<dimension ref="A1:J1000001"/>` -> 1000000 (linhas de dado). `null` se não achar. */
function linhasDeclaradas(buf) {
  // A tag <dimension> fica perto do início do arquivo — 4KB é folga generosa.
  const inicio = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  const m = inicio.match(/<dimension ref="[A-Z]+\d+:[A-Z]+(\d+)"/);
  return m ? Number(m[1]) - 1 : null;
}

/** Valor de UMA célula já casada pela regex — as 3 formas de texto + numérico. */
function valorDaCelula(tipo, inline, valor, strings) {
  if (inline !== undefined) {
    let texto = '';
    for (const t of inline.matchAll(RE_TEXTO_INLINE)) texto += t[1];
    return decodificarXml(texto);
  }
  if (valor === undefined) return undefined;
  if (tipo === 's') return strings[Number(valor)] ?? '';
  if (tipo === 'str') return decodificarXml(valor);
  return Number(valor);
}

/** Converte a fatia de UMA `<row>` num objeto `{ NOME_COLUNA: valor }`. */
function celulasDaLinha(trechoLinha, colunaPorLetra, strings) {
  const obj = {};
  RE_CELULA.lastIndex = 0;
  for (const m of trechoLinha.matchAll(RE_CELULA)) {
    const [, letra, tipo, inline, valor] = m;
    const nomeCol = colunaPorLetra[letra];
    if (!nomeCol) continue;
    const v = valorDaCelula(tipo, inline, valor, strings);
    if (v !== undefined) obj[nomeCol] = v;
  }
  return obj;
}

/**
 * Header de uma aba -> `{ letra: nomeDaColuna }`, ex. `{ A: 'ID_LOJA', ... }`.
 * Usa o MESMO texto-por-célula de `celulasDaLinha` (header pode vir como
 * inlineStr OU shared string, igual qualquer outra linha).
 */
function cabecalhoPorLetra(trechoHeader, strings) {
  const porLetra = {};
  RE_CELULA.lastIndex = 0;
  for (const m of trechoHeader.matchAll(RE_CELULA)) {
    const [, letra, tipo, inline, valor] = m;
    const v = valorDaCelula(tipo, inline, valor, strings);
    if (v !== undefined) porLetra[letra] = v;
  }
  return porLetra;
}

/**
 * Lê a aba certa (header compatível com `colunasObrigatorias`, a de mais
 * linhas declaradas entre as compatíveis) de um arquivo grande demais pro
 * `xlsx.readFile` comum. Mesma promessa de `escolherAba`+`sheet_to_json`
 * juntos: devolve `null` se nenhuma aba bater o header — nunca inventa.
 */
function lerLinhasPorBytes(caminho, colunasObrigatorias) {
  const zip = new AdmZip(caminho);
  const rels = mapaRels(zip);
  const strings = tabelaDeStrings(zip);

  let melhor = null;
  for (const { nome, rid } of listaSheets(zip)) {
    const alvo = rels.get(rid);
    const entry = alvo && zip.getEntry(`xl/${alvo}`);
    if (!entry) continue;
    const buf = entry.getData();
    const header = linhaHeaderBuffer(buf);
    if (!header) continue;
    const colPorLetra = cabecalhoPorLetra(header, strings);
    const nomesPresentes = new Set(Object.values(colPorLetra));
    if (!colunasObrigatorias.every((c) => nomesPresentes.has(c))) continue;
    const linhas = linhasDeclaradas(buf) ?? 0;
    if (!melhor || linhas > melhor.linhas) melhor = { nome, buf, colPorLetra, linhas };
  }
  if (!melhor) return null;

  const linhasObj = [];
  let pos = 0;
  let primeira = true;
  while (true) {
    const abre = melhor.buf.indexOf(ROW_ABRE, pos);
    if (abre === -1) break;
    const fecha = melhor.buf.indexOf(ROW_FECHA, abre);
    if (fecha === -1) break;
    const fimTag = fecha + ROW_FECHA.length;
    pos = fimTag;
    if (primeira) { primeira = false; continue; } // linha 1 = header
    const trecho = melhor.buf.toString('utf8', abre, fimTag); // 1 linha, sempre pequena
    linhasObj.push(celulasDaLinha(trecho, melhor.colPorLetra, strings));
  }
  return { aba: melhor.nome, linhas: linhasObj };
}

module.exports = { LIMITE_SEGURO_BYTES, precisaFallback, lerLinhasPorBytes, maiorAbaBytes };
