const { carregar } = require('./mapa.cjs');
const cacheReal = require('./cache.cjs');
const { estadoDoCliente } = require('./estado.cjs');
const { listasDoCliente, fatosDeReuniao } = require('./acompanhamento.cjs');
const { resumoGeral } = require('./resumoGeral.cjs');
const analiseEstrategica = require('./analiseEstrategica.cjs');

/**
 * Fachada de leitura dos Dados Alvos por CLIENTE da carteira.
 *
 * Existe para que rota HTTP e ferramenta do agente usem o mesmo caminho: as duas
 * precisam resolver "quais lojas são deste cliente → qual pasta → qual agregado",
 * e duas implementações disso seriam duas respostas possíveis para a mesma
 * pergunta.
 *
 * Ponto sensível: **ler o xlsx custa ~20 s e 1,5 GB**. Por isso nada aqui lê por
 * conta própria — quem chama declara se aceita pagar esse custo agora
 * (`aquecer: true`) ou se só aceita o que já está em cache. O seletor de
 * produto/cliente do formulário de reunião NUNCA pode disparar leitura fria: o
 * modal congelaria 20 s. O aquecimento acontece ao abrir a ficha do cliente.
 *
 * `opts.cache` permite injetar a camada de cache. É o que torna esta decisão
 * testável sem tocar num xlsx de 20,9 MB — `vi.doMock` não intercepta `require`
 * de CommonJS, então mock de módulo aqui leria o arquivo real (medido: 25 s por
 * rodada de teste).
 */

/** Pastas (empresas) vinculadas a este cliente, na ordem em que aparecem. */
function empresasDoCliente(clientId, vinculos) {
  const alvo = String(clientId);
  const empresas = [];
  for (const [empresa, lojas] of Object.entries(vinculos || {})) {
    if (Object.values(lojas || {}).some((id) => String(id) === alvo)) empresas.push(empresa);
  }
  return empresas;
}

/**
 * Agregados das pastas do cliente + estado do vínculo.
 *
 * `opts.aquecer` false (default) usa só cache válido; a pasta cujo cache está
 * frio entra em `pendentes` e o estado não é acusado de quebrado — sem ter lido
 * o arquivo, não há como afirmar que a loja desapareceu.
 */
function contextoDoCliente(clientId, opts = {}) {
  const vinculos = opts.vinculos || carregar(opts.caminho);
  const empresas = empresasDoCliente(clientId, vinculos);

  const agregados = {};
  const lojasPorEmpresa = {};
  const pendentes = [];

  const cache = opts.cache || cacheReal;
  for (const empresa of empresas) {
    const frio = !cache.estadoDoCache(empresa).valido;
    if (frio && !opts.aquecer) {
      pendentes.push(empresa);
      continue;
    }
    const ag = cache.agregadoDaEmpresa(empresa, { forcar: opts.forcar });
    agregados[empresa] = ag;
    lojasPorEmpresa[empresa] = (ag.lojas || []).map((l) => l.loja);
  }

  const estado = estadoDoCliente(clientId, { vinculos, lojasPorEmpresa });
  return { clientId: String(clientId), vinculos, empresas, agregados, lojasPorEmpresa, pendentes, estado };
}

/**
 * Um agregado só, com o cruzamento das várias pastas concatenado. Cliente com
 * lojas em duas pastas é raro, mas a alternativa (tratar só a primeira) daria
 * resposta silenciosamente incompleta.
 */
function agregadoUnificado(agregados) {
  const lista = Object.values(agregados);
  if (lista.length === 1) return lista[0];
  return {
    lojas: lista.flatMap((a) => a.lojas || []),
    clientes: lista.flatMap((a) => a.clientes || []),
    produtos: lista.flatMap((a) => a.produtos || []),
    fabricantes: lista.flatMap((a) => a.fabricantes || []),
    cruzamento: lista.flatMap((a) => a.cruzamento || []),
    periodos: [...new Set(lista.flatMap((a) => a.periodos || []))].sort(),
  };
}

/**
 * Catálogo para o seletor de "clientes/produtos analisados" do formulário de
 * reunião: só o que existe NAS LOJAS deste cliente.
 *
 * `disponivel: false` é resposta legítima e a tela deve mostrar o motivo — sem
 * vínculo não há catálogo, e cair em texto livre traria de volta o nome que não
 * casa com o arquivo, que é justamente o que o seletor resolve.
 */
function catalogoDoCliente(clientId, opts = {}) {
  const snapshot = require('./catalogoSnapshot.cjs');
  const ctx = contextoDoCliente(clientId, opts);
  if (ctx.estado.estado !== 'ok' || ctx.pendentes.length) {
    // Cache frio / arquivo indisponível: cai no espelho persistido em vez de
    // devolver lista vazia — decisão do usuário ("não pode perder os
    // clientes"). `disponivel` segue false: quem calcula métrica não deve usar
    // isto, só o autocomplete do formulário.
    const espelho = snapshot.doCliente(clientId, { caminho: opts.caminhoCatalogo });
    return {
      disponivel: false,
      estado: ctx.estado.estado,
      pendentes: ctx.pendentes,
      motivo: ctx.pendentes.length
        ? `dados da empresa ainda não carregados: ${ctx.pendentes.join(', ')}`
        : ctx.estado.motivo,
      produtos: espelho.produtos,
      clientes: espelho.clientes,
      doEspelho: espelho.produtos.length > 0 || espelho.clientes.length > 0,
      espelhoAtualizadoEm: espelho.atualizadoEm,
    };
  }

  const lojas = ctx.estado.lojas.map((l) => l.loja);
  const listas = listasDoCliente(agregadoUnificado(ctx.agregados), lojas);
  const ordenar = (a, b) => a.localeCompare(b, 'pt-BR');
  const produtos = listas.produtos.sort(ordenar);
  const clientes = listas.clientes.sort(ordenar);

  // Leu de verdade: atualiza o espelho pro formulário nunca ficar sem sugestão
  // depois (inclusive em outra máquina, já que o arquivo fica no OneDrive).
  snapshot.salvar(clientId, { produtos, clientes }, {
    caminho: opts.caminhoCatalogo,
    atualizadoEm: new Date().toISOString(),
  });

  return { disponivel: true, estado: 'ok', lojas, produtos, clientes };
}

/** Fatos do escopo REUNIÃO deste cliente (bloco "retorno do combinado"). */
function fatosDoCliente(cliente, eventos, opts = {}) {
  const ctx = contextoDoCliente(cliente.id, opts);
  if (ctx.estado.estado !== 'ok' || ctx.pendentes.length) {
    return {
      clientId: String(cliente.id),
      empresa: cliente.empresa,
      estado: ctx.pendentes.length ? 'dados_nao_carregados' : ctx.estado.estado,
      motivo: ctx.pendentes.length
        ? `dados da empresa ainda não carregados: ${ctx.pendentes.join(', ')}`
        : ctx.estado.motivo,
      acompanhamentos: [],
    };
  }
  return fatosDeReuniao(cliente, eventos, agregadoUnificado(ctx.agregados), {
    ...opts,
    vinculos: ctx.vinculos,
    lojasPorEmpresa: ctx.lojasPorEmpresa,
  });
}

/**
 * Escopo GERAL (item 5.2): receita/qtd por período + total de clientes finais
 * distintos, sem interpretação nenhuma — o retrato cru da carteira desse
 * cliente. Mesma regra de custo dos outros: nunca aquece sozinho.
 */
function resumoGeralDoCliente(cliente, opts = {}) {
  const ctx = contextoDoCliente(cliente.id, opts);
  if (ctx.estado.estado !== 'ok' || ctx.pendentes.length) {
    return {
      clientId: String(cliente.id),
      empresa: cliente.empresa,
      estado: ctx.pendentes.length ? 'dados_nao_carregados' : ctx.estado.estado,
      motivo: ctx.pendentes.length
        ? `dados da empresa ainda não carregados: ${ctx.pendentes.join(', ')}`
        : ctx.estado.motivo,
      serie: [],
    };
  }
  const lojas = ctx.estado.lojas.map((l) => l.loja);
  return {
    clientId: String(cliente.id),
    empresa: cliente.empresa,
    estado: 'ok',
    lojas,
    ...resumoGeral(agregadoUnificado(ctx.agregados), lojas),
  };
}

/**
 * Escopo ESTRATÉGICO (item 5.3): as mesmas análises do relatório Excel do
 * analisador da 2D — queda persistente de produto, erosão de cliente, cliente
 * que praticamente parou, poder de compra. Um endpoint só com as 4, porque é
 * assim que o relatório de origem já é consumido (as 4 abas juntas, não uma
 * de cada vez). Mesma regra de custo: nunca aquece sozinho.
 */
function analiseEstrategicaDoCliente(cliente, opts = {}) {
  const ctx = contextoDoCliente(cliente.id, opts);
  if (ctx.estado.estado !== 'ok' || ctx.pendentes.length) {
    return {
      clientId: String(cliente.id),
      empresa: cliente.empresa,
      estado: ctx.pendentes.length ? 'dados_nao_carregados' : ctx.estado.estado,
      motivo: ctx.pendentes.length
        ? `dados da empresa ainda não carregados: ${ctx.pendentes.join(', ')}`
        : ctx.estado.motivo,
      quedaPersistente: [], erosaoClientes: [], semVenda: [], poderDeCompra: [],
    };
  }
  const lojas = ctx.estado.lojas.map((l) => l.loja);
  const agregado = agregadoUnificado(ctx.agregados);
  return {
    clientId: String(cliente.id),
    empresa: cliente.empresa,
    estado: 'ok',
    lojas,
    quedaPersistente: analiseEstrategica.quedaPersistente(agregado, lojas, opts),
    erosaoClientes: analiseEstrategica.erosaoClientes(agregado, lojas, opts),
    semVenda: analiseEstrategica.semVenda(agregado, lojas, opts),
    poderDeCompra: analiseEstrategica.poderDeCompra(agregado, lojas, opts),
  };
}

module.exports = {
  empresasDoCliente,
  contextoDoCliente,
  agregadoUnificado,
  catalogoDoCliente,
  fatosDoCliente,
  resumoGeralDoCliente,
  analiseEstrategicaDoCliente,
};
