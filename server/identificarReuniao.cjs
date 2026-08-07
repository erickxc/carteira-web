const fs = require('fs');
const { getSheetData } = require('./db.cjs');

// Transcrições desse formato (Otter/Fireflies/Gemini Notes) sempre nomeiam os
// blocos de abertura sobre áudio/vídeo/presença de forma previsível — dá pra
// filtrar por TÍTULO do bloco sem precisar entender o conteúdo. Blocos com
// conteúdo real (ex.: "Interrupções e identificação preliminar de causas", que
// tem 1 frase técnica mas o resto é substância) não batem aqui de propósito:
// só corta o bloco inteiro quando o título em si já é só ruído administrativo.
const TITULO_RUIDO_RE = /presen[çc]a|t[ée]cnic|[áa]udio|\bsom\b|conex[ãa]o|celular/i;

/**
 * Remove da seção "Principais Pontos de Discussão" os blocos cujo título
 * indica ruído (checagem de presença, ajuste de áudio/vídeo). Preserva o
 * resto do documento (Resumo/Tarefas) intacto — o ruído só aparece nessa
 * seção, nas transcrições vistas até agora.
 */
function limparRuido(texto) {
  const marcador = texto.match(/principais pontos de discuss[ãa]o:?/i);
  if (!marcador) return texto;

  const inicioCorpo = marcador.index + marcador[0].length;
  const antes = texto.slice(0, inicioCorpo);
  const resto = texto.slice(inicioCorpo);

  const fimMatch = resto.match(/bloco de notas:?/i);
  const corpo = fimMatch ? resto.slice(0, fimMatch.index) : resto;
  const apos = fimMatch ? resto.slice(fimMatch.index) : '';

  const blocos = corpo.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const mantidos = blocos.filter((b) => !TITULO_RUIDO_RE.test(b.split('\n')[0]));

  return `${antes}\n\n${mantidos.join('\n\n')}\n\n${apos}`.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// Termos que aparecem em nome de cliente mas são genéricos demais pra servir
// de identificador — meses do ano aparecem em praticamente toda reunião
// (comparativo mensal), e palavras de setor/sufixo empresarial (diesel, auto,
// ltda...) se repetem entre clientes de ramos parecidos. Já causaram falso
// positivo real: "27 De Setembro" batendo só por causa do mês, "IMP. DIESEL"
// batendo por causa de "Ramar DIESEL" no texto.
const TERMOS_GENERICOS = new Set([
  'janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  'diesel', 'auto', 'pecas', 'peças', 'comercio', 'comércio',
  'ltda', 'me', 'import', 'importadora', 'distribuidora', 'group',
]);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Identificadores distintivos de um cliente: nome da empresa (tokenizado),
 * grupo (clientes segmentados por loja) e nomes de contato. Monitor NÃO entra
 * aqui de propósito — um monitor atende dezenas de clientes, então o nome dele
 * apareceria em quase toda reunião seguraão, virando ruído em vez de sinal
 * (daria empate/falso positivo entre todos os clientes daquele monitor).
 */
function identificadoresDoCliente(c) {
  const nomes = new Set();
  const addTokens = (str) => {
    if (!str) return;
    String(str).split(/[\s-]+/).forEach((p) => {
      if (p.length >= 3 && !TERMOS_GENERICOS.has(p.toLowerCase())) nomes.add(p);
    });
  };
  addTokens(c.empresa);
  if (c.grupo) nomes.add(c.grupo);
  let contatos = [];
  try { contatos = Array.isArray(c.contatos) ? c.contatos : JSON.parse(c.contatos || '[]'); } catch { /* ignore */ }
  contatos.forEach((ct) => addTokens(ct?.nome));
  return [...nomes];
}

/**
 * Casa identificadores contra o texto (palavra inteira). Siglas curtas em
 * CAIXA ALTA (<=4 letras, ex. "GAP") usam match sensível a maiúsculas — uma
 * sigla-cliente costuma coincidir com palavra comum do português em minúsculo
 * ("gap no estoque"), então só conta se aparecer exatamente em caixa alta no
 * texto.
 */
function bateNoTexto(identificador, texto) {
  const curtaEMaiuscula = identificador.length <= 4 && identificador === identificador.toUpperCase();
  const re = new RegExp(`\\b${escapeRegExp(identificador)}\\b`, curtaEMaiuscula ? '' : 'i');
  return re.test(texto);
}

/**
 * Retorna clientes candidatos (score > 0), ordenados do mais provável pro
 * menos — score = nº de identificadores distintos encontrados no texto.
 * Não decide sozinho: é sinal pra confirmação humana, não substitui.
 */
function identificarCliente(texto) {
  const clientes = getSheetData('Clientes');
  const candidatos = [];
  for (const c of clientes) {
    const motivos = identificadoresDoCliente(c).filter((id) => bateNoTexto(id, texto));
    if (motivos.length > 0) candidatos.push({ id: c.id, empresa: c.empresa, score: motivos.length, motivos });
  }
  candidatos.sort((a, b) => b.score - a.score);
  return candidatos;
}

/** Recorta o texto entre `inicioRe` (exclusive) e o primeiro `fimRes` que
 * aparecer depois — usado pra pegar o conteúdo de uma seção rotulada
 * ("Resumo:", "Tarefas:"...) sem depender de posição fixa no arquivo. */
function extrairEntre(texto, inicioRe, fimRes) {
  const m = texto.match(inicioRe);
  if (!m) return '';
  const inicio = m.index + m[0].length;
  const resto = texto.slice(inicio);
  let fim = resto.length;
  for (const re of fimRes) {
    const fm = resto.match(re);
    if (fm && fm.index < fim) fim = fm.index;
  }
  return resto.slice(0, fim).trim();
}

const RE_RESUMO = /resumo:?/i;
const RE_TAREFAS = /tarefas:?/i;
const RE_PONTOS = /principais pontos de discuss[ãa]o:?/i;
const RE_NOTAS = /bloco de notas:?/i;
const RE_DATA_LINHA = /\d{1,2}\s+de\s+[a-zç]+\.?\s+de\s+\d{4}/i;

/**
 * Extrai as seções já escritas pela ferramenta de transcrição (Resumo/Tarefas/
 * Bloco de Notas saem quase verbatim — não é geração de texto, é recorte) e
 * separa "Principais Pontos de Discussão" em capítulos {titulo, texto}, já sem
 * os blocos de ruído. "Perguntas-chave" NÃO é extraído — a transcrição não
 * traz isso pronto, e inventar essa seção seria fabricar conteúdo que a
 * reunião não necessariamente discutiu; fica em branco pra preenchimento manual.
 */
function extrairSecoes(texto) {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const titulo = linhas[0] || '';
  const linhaData = linhas.slice(0, 5).find((l) => RE_DATA_LINHA.test(l)) || '';

  const resumo = extrairEntre(texto, RE_RESUMO, [RE_TAREFAS, RE_PONTOS, RE_NOTAS]);
  const tarefas = extrairEntre(texto, RE_TAREFAS, [RE_PONTOS, RE_NOTAS]);
  const corpoPontos = extrairEntre(texto, RE_PONTOS, [RE_NOTAS]);
  const blocoNotas = extrairEntre(texto, RE_NOTAS, []);

  const capitulos = corpoPontos
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [primeiraLinha, ...resto] = b.split('\n');
      return { titulo: primeiraLinha.trim(), texto: resto.join(' ').trim() };
    })
    .filter((c) => !TITULO_RUIDO_RE.test(c.titulo));

  return { titulo, linhaData, resumo, tarefas, capitulos, blocoNotas };
}

function analisarArquivo(caminho) {
  const bruto = fs.readFileSync(caminho, 'utf8');
  const textoLimpo = limparRuido(bruto);
  const candidatos = identificarCliente(bruto); // casa no texto ORIGINAL — o limpo já perdeu os títulos de bloco
  const secoes = extrairSecoes(bruto);
  return { textoLimpo, candidatos, secoes };
}

module.exports = { limparRuido, identificarCliente, extrairSecoes, analisarArquivo };

if (require.main === module) {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error('Uso: node server/identificarReuniao.cjs "caminho/do/resumo.txt"');
    process.exit(1);
  }
  const { textoLimpo, candidatos } = analisarArquivo(caminho);
  console.log('=== Candidatos (cliente) ===');
  if (candidatos.length === 0) {
    console.log('Nenhum cliente da carteira bateu com o texto — confira manualmente.');
  } else {
    candidatos.forEach((c, i) => console.log(`${i + 1}. ${c.empresa}  (score ${c.score} — bateu: ${c.motivos.join(', ')})`));
  }
  console.log('\n=== Texto sem ruído ===\n');
  console.log(textoLimpo);
}
