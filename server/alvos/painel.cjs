const { carregar } = require('./mapa.cjs');
const { estadoDaCarteira } = require('./estado.cjs');
const { fatosDoCliente } = require('./consulta.cjs');

/**
 * Composição para o dashboard de cadastro (`/clientes`): junta o estado do
 * vínculo (`estado.cjs`) com o que é puramente cadastro do cliente (campo
 * `local` vazio) — as duas coisas que travam a integração dos Dados Alvos.
 *
 * Cada cliente ativo vira uma linha; a UI decide o que fazer com `estadoAlvos`
 * diferente de "ok" (oferecer o fluxo de vínculo).
 */
function linhasCadastro(clientes, opts = {}) {
  const vinculos = opts.vinculos || carregar(opts.caminho);
  const ativos = clientes.filter((c) => String(c.estado ?? 'Ativo') !== 'Inativo');
  const estados = estadoDaCarteira(ativos, { vinculos, lojasPorEmpresa: opts.lojasPorEmpresa });

  return estados.map((e, i) => ({
    clientId: ativos[i].id,
    empresa: e.empresa,
    estadoAlvos: e.estado,
    motivo: e.motivo,
    semLocal: !ativos[i].local,
  }));
}

function resumoCadastro(linhas) {
  const base = { total: linhas.length, ok: 0, sem_vinculo: 0, vinculo_quebrado: 0, semLocal: 0 };
  for (const l of linhas) {
    base[l.estadoAlvos] = (base[l.estadoAlvos] ?? 0) + 1;
    if (l.semLocal) base.semLocal += 1;
  }
  return base;
}

/** Frase que descreve a razão do alerta — a mesma linguagem que vai pro cartão e pro chat. */
function descreverRazao(a) {
  if (a.razao === 'abandonado_voltou_a_mover') {
    return `você tinha marcado "${a.nome}" como abandonado, mas o número voltou a se mover`;
  }
  if (a.razao === 'receita_e_qtd_divergem') {
    return `receita e quantidade de "${a.nome}" estão andando em direções opostas`;
  }
  return `"${a.nome}" foi pautado em ${a.reunioes.length} reuniões e ainda não teve retorno`;
}

/**
 * Alertas do escopo Alvos, no MESMO formato de `server/ia/alertas.cjs`
 * (`{id, tipo, severidade, titulo, detalhe, clientId, monitor, pergunta}`) —
 * de propósito, pra caber no mesmo componente de tela e no mesmo fluxo
 * "Conversar sobre isso" que já existe pros alertas de cadência/risco.
 *
 * NÃO aquece cache: rodar isto pra dezenas de clientes, cada um podendo exigir
 * ler um xlsx de até 57 MB, travaria o dashboard inteiro. Cliente cujos dados
 * ainda não carregaram simplesmente não entra nesta rodada — reaparece quando
 * alguém tiver aberto a ficha dele (o que aquece o cache).
 */
function gerarAlertasAlvos(repo, opts = {}) {
  const clientes = repo.get('Clientes');
  const ativos = clientes.filter((c) => String(c.estado ?? 'Ativo') !== 'Inativo');
  const agenda = repo.get('Agenda');
  const vinculos = opts.vinculos || carregar(opts.caminho);
  const alertas = [];

  for (const cliente of ativos) {
    const eventos = agenda.filter((a) => String(a.clientId) === String(cliente.id));
    const r = fatosDoCliente({ id: cliente.id, empresa: cliente.empresa }, eventos, { ...opts, vinculos });

    if (r.estado === 'vinculo_quebrado') {
      alertas.push({
        id: `alvos-quebrado-${cliente.id}`,
        tipo: 'alvos_vinculo_quebrado',
        severidade: 'alta',
        titulo: `${cliente.empresa}: vínculo com dados de vendas quebrado`,
        detalhe: r.motivo,
        clientId: cliente.id,
        cliente: cliente.empresa,
        monitor: cliente.monitor || null,
        pergunta: `A loja vinculada da ${cliente.empresa} não existe mais no arquivo de vendas (${r.motivo}). Me ajuda a revisar o vínculo?`,
      });
      continue;
    }
    // sem_vinculo / dados_nao_carregados: é pendência de CADASTRO, não alerta
    // de conversa — aparece na seção Cadastro, não aqui.
    if (r.estado !== 'ok') continue;

    for (const a of r.acompanhamentos) {
      if (!a.alerta) continue;
      const razaoTexto = descreverRazao(a);
      alertas.push({
        id: `alvos-${cliente.id}-${a.tipo}-${a.nome}`,
        tipo: 'alvos_acompanhamento',
        severidade: a.razao === 'abandonado_voltou_a_mover' ? 'media' : 'alta',
        titulo: `${cliente.empresa}: ${a.nome}`,
        detalhe: razaoTexto,
        clientId: cliente.id,
        cliente: cliente.empresa,
        monitor: cliente.monitor || null,
        pergunta: `Sobre ${a.tipo === 'produto' ? 'o produto' : 'o cliente'} "${a.nome}" da ${cliente.empresa}: ${razaoTexto}. O que fazemos a respeito?`,
      });
    }
  }

  return alertas.slice(0, opts.max ?? 12);
}

module.exports = { linhasCadastro, resumoCadastro, gerarAlertasAlvos, descreverRazao };
