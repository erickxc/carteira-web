const { carregar } = require('./mapa.cjs');

/**
 * Estado da integração de UM cliente da carteira: o dossiê pode ou não analisar
 * métricas dele.
 *
 * Regra do usuário, e a razão de este módulo existir separado: **com estado
 * diferente de `ok`, o dossiê não escreve nenhuma linha de métrica.** Não fica
 * em silêncio — vira alerta de cadastro. Ausência declarada é melhor que número
 * errado numa reunião.
 *
 * Três estados, não quatro. A distinção entre "não tem pasta" e "tem pasta sem
 * loja vinculada" exigiria um mapa pasta↔cliente, que foi cortado do escopo: no
 * recorte de teste (uma pasta só, "Dados Mockados") a própria entrada de vínculo
 * já guarda pasta E loja juntas, então "sem pasta" e "sem vínculo" são o mesmo
 * fato observável. Quando as outras 45 empresas entrarem, aí sim o mapa
 * pasta↔cliente é necessário — 14 dos 54 clientes ativos NÃO casam com nenhuma
 * pasta por nome (`Paralama` vs `Paralamas`, `RioJC` vs `Rio JC`, `Só Fiat` vs
 * `SoFiat`), então lá o vínculo terá de ser explícito também.
 *
 * `vinculo_quebrado` é o estado que justifica revalidar a cada leitura, em vez
 * de confiar no vínculo gravado: se o `ID_LOJA` for renomeado na origem (o
 * arquivo é gerado por outro sistema, fora do nosso controle), o vínculo antigo
 * aponta para uma loja que não existe mais. Sem esta checagem, o cálculo veria
 * zero venda e o dossiê reportaria "queda total" — um erro que parece um achado.
 */

const ESTADOS = ['ok', 'sem_vinculo', 'vinculo_quebrado'];

/**
 * @param clientId cliente da carteira
 * @param opts.vinculos     mapa `{ empresa: { loja: clientId } }` (default: o arquivo)
 * @param opts.lojasPorEmpresa `{ empresa: [ids de loja existentes no arquivo] }`
 *        Passado por quem já leu o agregado — este módulo não lê xlsx (custa
 *        20 s e 1,5 GB) nem decide sozinho quando ler.
 */
function estadoDoCliente(clientId, opts = {}) {
  const vinculos = opts.vinculos || carregar(opts.caminho);
  const lojasPorEmpresa = opts.lojasPorEmpresa || {};
  const alvo = String(clientId);

  const vinculadas = [];
  for (const [empresa, lojas] of Object.entries(vinculos)) {
    for (const [loja, id] of Object.entries(lojas || {})) {
      if (String(id) === alvo) vinculadas.push({ empresa, loja });
    }
  }

  if (vinculadas.length === 0) {
    return {
      clientId: alvo,
      estado: 'sem_vinculo',
      analisarMetricas: false,
      lojas: [],
      motivo: 'nenhuma loja dos Dados Alvos está vinculada a este cliente',
    };
  }

  // Empresa ausente de `lojasPorEmpresa` é DESCONHECIDA, não vazia: quem chamou
  // pode ter lido só uma pasta. Tratar como "loja não existe" acusaria vínculo
  // quebrado sem ter olhado o arquivo — e o efeito seria o dossiê parar de
  // analisar um cliente que está correto.
  const verificaveis = vinculadas.filter((v) => Array.isArray(lojasPorEmpresa[v.empresa]));
  const ausentes = verificaveis.filter((v) => !lojasPorEmpresa[v.empresa].includes(v.loja));

  if (ausentes.length > 0) {
    const lista = ausentes.map((v) => `${v.empresa}/${v.loja}`).join(', ');
    return {
      clientId: alvo,
      estado: 'vinculo_quebrado',
      analisarMetricas: false,
      lojas: vinculadas,
      lojasAusentes: ausentes,
      motivo: `loja vinculada não existe mais no arquivo de origem: ${lista}`,
    };
  }

  return {
    clientId: alvo,
    estado: 'ok',
    analisarMetricas: true,
    lojas: vinculadas,
    // Vínculo não verificado não é erro, mas quem consome precisa saber que a
    // existência da loja não foi confirmada nesta chamada.
    naoVerificadas: vinculadas.length - verificaveis.length,
    motivo: null,
  };
}

/** Estado de todos os clientes de uma vez, para o dashboard de cadastro. */
function estadoDaCarteira(clientes, opts = {}) {
  const vinculos = opts.vinculos || carregar(opts.caminho);
  return clientes.map((c) => ({
    empresa: c.empresa,
    ...estadoDoCliente(c.id, { ...opts, vinculos }),
  }));
}

/** Contagem por estado — o número que o dashboard mostra. */
function resumoDaCarteira(estados) {
  const contagem = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const e of estados) contagem[e.estado] = (contagem[e.estado] ?? 0) + 1;
  return contagem;
}

module.exports = { ESTADOS, estadoDoCliente, estadoDaCarteira, resumoDaCarteira };
