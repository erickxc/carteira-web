const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { startOfWeek, endOfWeek, parseISO } = require('date-fns');
const { executarMutacao } = require('../fila/mutacao.cjs');
const { lerDossieCliente, corrigirDossieCliente, gerarAnalisesPendentes } = require('./analisesAutomaticas.cjs');
const { TEMPLATE_DOSSIE } = require('./analiseCliente.cjs');
const { gerarAtaIA } = require('./geracaoAta.cjs');
const { gerarAta } = require('./ataTexto.cjs');
const { gerarAtaPdfBuffer } = require('./ataPdf.cjs');
const {
  calcularAderencia, listaJSON, buscarVencendo, buscarCobertura, buscarCoberturaServicos, buscarAlertasSemAcompanhamento,
  buildFilaCadencia, classificarCadencia, isClienteAtivo,
} = require('../dominio/cadenciaServico.cjs');
const { servicoPadraoDoEvento } = require('../../shared/cadenciaServico.cjs');
const { sugerirAgenda } = require('../dominio/sugestaoAgenda.cjs');
const { getCache: getCacheCeoAgenda } = require('../ceoAgenda.cjs');
const { CADENCIAS_SEED, UPLOADS_DIR } = require('../config.cjs');
const { isClient } = require('../modo.cjs');
const memoriaIADominio = require('../dominio/memoriaIA.cjs');
const { CONCEITOS } = require('./conceitosCarteira.cjs');

/**
 * Valores configuráveis por tipo (`Categorias`): monitor, serviço, sala,
 * tipo de evento, tipo de lembrete. São DADOS editáveis em Configurações, não
 * enums no código — por isso a validação lê do repositório a cada chamada.
 */
function opcoesDe(repo, tipo) {
  return repo.get('Categorias').filter((c) => c.tipo === tipo).map((c) => c.valor).filter(Boolean);
}

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Casa o valor que o modelo mandou com uma opção real do cadastro.
 *
 * Existe por um bug de produção: o agente criou uma reunião com
 * `monitores: ["Erick"]`, mas a opção cadastrada é "Erick Cardoso". O valor foi
 * gravado como veio, não casou com nenhuma opção da tela, e o campo apareceu
 * VAZIO pro usuário — dado corrompido em silêncio, que é pior que erro.
 *
 * Regra: match exato (ignorando acento/maiúscula) vence; senão, aceita
 * prefixo/trecho ÚNICO ("Erick" -> "Erick Cardoso"). Ambíguo ou sem match =
 * erro com a lista de opções, que volta pro modelo e ele corrige sozinho —
 * melhor do que escolher por ele e errar de monitor.
 */
function resolverOpcao(repo, tipo, valor, campo) {
  const opcoes = opcoesDe(repo, tipo);
  if (!opcoes.length) return valor; // categoria não cadastrada: não inventa regra
  const alvo = semAcento(valor);

  const exato = opcoes.find((o) => semAcento(o) === alvo);
  if (exato) return exato;

  const parciais = opcoes.filter((o) => semAcento(o).startsWith(alvo) || semAcento(o).includes(alvo));
  if (parciais.length === 1) return parciais[0];
  if (parciais.length > 1) {
    throw new Error(`${campo}: "${valor}" é ambíguo — pode ser ${parciais.join(' ou ')}. Use o nome completo.`);
  }
  throw new Error(`${campo}: "${valor}" não existe. Valores válidos: ${opcoes.join(', ')}.`);
}

/**
 * Resolve cada valor contra o cadastro E remove repetição DEPOIS de resolver —
 * é aí que o duplicado nasce: `["Erick", "Erick Cardoso"]` resolve os dois pro
 * mesmo monitor e gravava "Erick Cardoso, Erick Cardoso" na reunião (visto num
 * evento real). Deduplicar antes não pegaria, porque os textos de entrada são
 * diferentes; o que tem de ser único é o valor final do cadastro.
 */
const resolverLista = (repo, tipo, valores, campo) => [
  ...new Set((valores ?? []).map((v) => resolverOpcao(repo, tipo, v, campo))),
];

/** Mesma conversão de `server/routes/cadencias.cjs` (chave/valor -> objeto). */
function lerCadencias(repo) {
  const obj = {};
  CADENCIAS_SEED.forEach((c) => { obj[c.chave] = c.valor; });
  repo.get('Cadencias').forEach((r) => { obj[r.chave] = Number(r.valor); });
  return obj;
}

/**
 * Ferramentas que o agente de IA pode chamar (tool-calling via
 * `orquestrador.cjs`). Cada uma só lê/cria — nenhuma faz update/delete: reduz
 * o raio de risco de um agente que executa direto, sem confirmação prévia do
 * usuário (decisão explícita dele, registrada no plano). Toda execução é
 * logada em `AcoesIA` pelo orquestrador, não aqui — mantém `executar()` puro
 * e fácil de testar isoladamente.
 */

/**
 * Cliente com `grupo` preenchido (`tipoAnalise: 'segmentado'`) é uma LOJA
 * dentro de uma rede, não uma empresa isolada — `empresa` guarda o nome
 * composto ("Grupo - Loja", mesmo padrão de `ClienteDetailPage.tsx`/
 * `ClientFormModal.tsx`). Sem isso explícito, o agente trata o nome composto
 * como bloco único e fala "a empresa X" quando devia falar "a loja X (rede Y)".
 */
function identidadeCliente(cliente) {
  const grupo = cliente.grupo || null;
  const loja = grupo ? cliente.empresa.replace(`${grupo} - `, '') : null;
  // `local`: segmento de negócio (Autopeça, Oficina, Indústria...), não o
  // "sala" de reunião. Passado a toda ferramenta que devolve identidade do
  // cliente, pra o agente ter contexto do tipo de negócio na conversa sem
  // precisar de uma ferramenta separada só pra isso.
  return { empresa: cliente.empresa, grupo, loja, local: cliente.local || null };
}

/**
 * Dados de cadastro que o agente precisa pra não tratar todo cliente como
 * "em atendimento normal" — sem isso ele dava conselho de monitoria pra
 * cliente inativo/suspenso, ou fingia ter contexto de risco pra quem nunca
 * foi analisado. `proximoEvento`: próxima reunião/contato futuro agendado
 * (ou null) — sustenta o gatilho de "risco alto sem nada marcado".
 */
function situacaoCadastro(repo, cliente) {
  const agora = new Date();
  const futuros = repo.get('Agenda')
    .filter((a) => String(a.clientId) === String(cliente.id))
    .filter((a) => new Date(a.date) > agora)
    .filter((a) => !/cancel/i.test(a.status || ''))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // `servicos` (contratados) vinha faltando: o agente recebia
  // `servicosIndependentes` sem saber o que o cliente contrata, então não
  // tinha como concluir "Monitoria precisa de reunião, Precificação não".
  // `dependemDeReuniao` é a subtração já feita — o agente não precisa
  // (nem deve) deduzir isso de cabeça a cada resposta.
  const servicos = listaJSON(cliente.servicos);
  const independentes = listaJSON(cliente.servicosIndependentes);
  // Pausa temporária (Cliente.pausadoAte/motivoPausa) — conceito à parte de
  // estado/status: um cliente pausado ainda está "Ativo"/"Regular" no
  // cadastro, só sai da fila de cadência até a data. `pausadoAtivo` já vem
  // calculado (mesma regra por dia calendário de isClienteAtivo) pra o
  // agente não ter que fazer conta de data sozinho.
  const pausadoAte = cliente.pausadoAte || null;
  const pausadoAtivo = Boolean(pausadoAte) && !isNaN(new Date(pausadoAte).getTime()) && new Date(pausadoAte) >= agora;
  return {
    estado: cliente.estado || null,
    status: cliente.status || null,
    pausadoAte,
    motivoPausa: cliente.motivoPausa || null,
    pausadoAtivo,
    servicos,
    servicosIndependentes: independentes,
    dependemDeReuniao: servicos.filter((sv) => !independentes.includes(sv)),
    proximoEvento: futuros[0]
      ? { date: dataCivilEvento(futuros[0].date), hora: futuros[0].time || null, type: futuros[0].type }
      : null,
  };
}

// `grupo`: casa por nome da rede (`Cliente.grupo`), não por `empresa` — é o
// que permite achar as várias lojas de uma rede numa busca só (ex.: "Altese"
// sozinho não é nome de nenhum cliente, é o grupo de 2 lojas: "Altese -
// Recreio + Barra" e "Altese - GM, Ford, Fiat, VW"). Comparação
// case-insensitive e por substring — usuário digita "altese", não precisa do
// nome exato salvo no cadastro.

/**
 * Normaliza texto pra comparação de nome: minúsculas, sem acento e com
 * espaços colapsados. Sem isso, "27 de setembro" não casava com o cadastro
 * "27 De Setembro", e "sao" não casaria com "São" — o usuário digita no chat
 * como fala, não como está no cadastro.
 */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Forma "n\u00facleo" do nome, pra busca TOLERANTE: sem acento, sem pontua\u00e7\u00e3o, sem
 * espa\u00e7o e com plural simples desfeito. Existe por um caso real: o usu\u00e1rio
 * perguntou por "Pe\u00e7as.com" (plural) e o agente respondeu que o cliente "n\u00e3o
 * est\u00e1 cadastrado na carteira" \u2014 o cadastro \u00e9 "Pe\u00e7a.com", e `includes` de
 * substring nunca casaria ("pecas.com" n\u00e3o est\u00e1 contido em "peca.com").
 *
 * S\u00f3 \u00e9 usado como SEGUNDA tentativa (ver `buscarClientes`): a busca por
 * substring exata continua valendo primeiro, pra n\u00e3o trocar um acerto preciso
 * por um palpite mais frouxo.
 */
function nucleoNome(texto) {
  return normalizar(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // S\u00f3 palavra com mais de 3 letras perde o "s" final: evita transformar
    // "gps"/"sos" e afins em outra coisa.
    .map((p) => (p.length > 3 ? p.replace(/s$/, '') : p))
    .join('');
}

/**
 * Escopo do "filtro universal de monitor" (CarteiraContext.filtroMonitor, "quem
 * sou eu nesta máquina") aplicado às ferramentas que olham a carteira INTEIRA
 * — não as que já recebem `clientId` explícito, essas continuam abertas
 * (o modelo/usuário pode legitimamente discutir um cliente de outro monitor).
 *
 * Sem monitor identificado (filtro em "Todos"), devolve tudo — mesma regra já
 * aplicada na UI (`filtroMonitor`/CLAUDE.md "Privacidade das conversas"):
 * sem identidade real, não dá pra impor privacidade, então mostra tudo.
 *
 * `ctx` chega como 3º argumento de `executar`, FORA do schema — o modelo
 * nunca vê nem declara este parâmetro (evita ele inventar "sou o monitor X"),
 * é injetado pelo orquestrador a partir de quem de fato mandou a pergunta
 * (ver `conversar`/`iaProvedor.cjs`, mesmo valor que já carimba `AcoesIA.monitor`).
 */
function clientesDoMonitor(repo, ctx) {
  const todos = repo.get('Clientes');
  const monitor = ctx?.monitor;
  return monitor ? todos.filter((c) => c.monitor === monitor) : todos;
}

function buscarClientes(repo, { nome, estado, nivelRisco, status, servico, grupo, local } = {}, ctx = {}) {
  const clientes = clientesDoMonitor(repo, ctx);
  const analises = repo.get('AnalisesIA');
  const analisePorCliente = new Map(analises.map((a) => [String(a.clientId), a]));
  const grupoBusca = normalizar(grupo);
  const nomeBusca = normalizar(nome);
  // Igualdade normalizada (não substring): "local" vem de uma categoria de
  // valores fixos (Autopeça, Oficina, ...), então "atacado" não deve casar
  // com "Distribuidora/Atacado" por acidente como aconteceria com um filtro
  // de texto livre tipo `grupo`.
  const localBusca = normalizar(local);

  // `casaNome` é parametrizado pra permitir a segunda passada tolerante
  // (plural/pontuação) quando a busca exata não achou nada — ver `nucleoNome`.
  const filtrar = (casaNome) => clientes
    .map((c) => ({ cliente: c, analise: analisePorCliente.get(String(c.id)) }))
    .filter(({ cliente }) => !status || cliente.status === status)
    // `estado` (Ativo/Inativo) e `status` (Regular/Suspenso/...) são campos
    // DIFERENTES, e o modelo confundia: perguntar "quantos clientes ativos"
    // virava `status: "Ativo"` e devolvia zero, porque nenhum cliente tem esse
    // status. Visto no log de auditoria em produção.
    .filter(({ cliente }) => !estado || (cliente.estado || '') === estado)
    .filter(({ cliente }) => !servico || listaJSON(cliente.servicos).includes(servico))
    .filter(({ analise }) => !nivelRisco || analise?.nivelRisco === nivelRisco)
    .filter(({ cliente }) => !grupoBusca || normalizar(cliente.grupo).includes(grupoBusca))
    .filter(({ cliente }) => !localBusca || normalizar(cliente.local) === localBusca)
    // Nome casa contra `empresa` (que já inclui a rede quando há: "Rede - Loja"),
    // então funciona tanto pra "27 de setembro" quanto pra "recreio" ou
    // "altese recreio".
    .filter(({ cliente }) => casaNome(cliente))
    .map(({ cliente, analise }) => ({
      id: cliente.id,
      ...identidadeCliente(cliente),
      status: cliente.status,
      estado: cliente.estado || null,
      // Bug real: o modelo respondia "quantos clientes ativos" contando só
      // `estado === 'Ativo'`, sem considerar `status` (Suspenso/Atendido
      // pelo Marco/Problemas Externos não contam como atendimento) nem
      // pausa temporária — inflava a contagem de ativos e subcontava
      // inativos. `ativo` já vem calculado com a MESMA regra do resto do
      // app (isClienteAtivo) — use este campo, não `estado` sozinho, pra
      // responder "está ativo?"/"quantos ativos?".
      ativo: isClienteAtivo(cliente),
      pausadoAte: cliente.pausadoAte || null,
      motivoPausa: cliente.motivoPausa || null,
      servicos: listaJSON(cliente.servicos),
      // Serviço que o cliente conduz sozinho não entra em fila de reunião —
      // sem isso aqui, uma resposta sobre "quem agendar" incluía cliente cujo
      // único serviço é independente.
      servicosIndependentes: listaJSON(cliente.servicosIndependentes),
      nivelRisco: analise?.nivelRisco ?? null,
    }));

  const exato = filtrar((cliente) => !nomeBusca || normalizar(cliente.empresa).includes(nomeBusca));
  if (exato.length > 0 || !nomeBusca) return exato;

  // Segunda tentativa: núcleo do nome, nas duas direções — "Peças.com" acha
  // "Peça.com", e "Altese" acha "Altese - Recreio".
  const nucleoBusca = nucleoNome(nome);
  if (!nucleoBusca) return exato;
  return filtrar((cliente) => {
    const alvo = nucleoNome(cliente.empresa);
    return alvo.includes(nucleoBusca) || nucleoBusca.includes(alvo);
  });
}

/**
 * Memória geral: regras do processo/sistema que valem pra carteira inteira.
 * Diferente do dossiê, que é a memória DE UM CLIENTE.
 *
 * Estas regras também entram no system prompt (`agente.cjs`) — a ferramenta de
 * leitura existe pro agente conseguir citar/remover uma regra específica pelo
 * id, não pra ele "lembrar" (memória que só existe atrás de uma chamada de
 * ferramenta é memória que o modelo esquece de consultar).
 */
/**
 * Reprocessa a análise de um cliente do zero (`forcar`), sem esperar um evento
 * novo — é como se recupera uma ata escrita depois da reunião, que o gatilho
 * automático não enxerga por si (ver `eventosParaAnalisar`).
 *
 * Assíncrona: chama o modelo. É a única ferramenta que faz isso — as outras
 * são consulta ou escrita direta. O orquestrador já dá `await` no resultado
 * de `executar`, então funciona nos dois provedores.
 */
async function reanalisarCliente(repo, { clientId } = {}) {
  if (!clientId) throw new Error('reanalisar_cliente: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`reanalisar_cliente: cliente "${clientId}" não encontrado.`);

  const processados = await gerarAnalisesPendentes({ repo, apenasClientId: clientId, forcar: true });
  if (!processados) return { ok: false, motivo: 'Nenhuma reunião concluída/cancelada com conteúdo pra analisar.' };

  const analise = repo.get('AnalisesIA').find((a) => String(a.clientId) === String(clientId));
  return {
    ok: true,
    empresa: cliente.empresa,
    nivelRisco: analise?.nivelRisco ?? null,
    dossie: lerDossieCliente(clientId),
  };
}

function buscarOpcoesEvento(repo) {
  return {
    monitor: opcoesDe(repo, 'monitor'),
    servico: opcoesDe(repo, 'servico'),
    sala: opcoesDe(repo, 'sala'),
    tipo_evento: opcoesDe(repo, 'tipo_evento'),
    tipo_lembrete: opcoesDe(repo, 'tipo_lembrete'),
    // `status_evento` FALTAVA aqui, e isso teve consequência real: o usuário
    // pediu uma agenda "como rascunho", o agente não tinha como saber que
    // "Rascunho" não existe (nem que o equivalente cadastrado é "Pendente"),
    // então criou com "Agendado" e AFIRMOU ter criado um rascunho. Sem a
    // lista, ele não consegue corrigir o usuário — só errar ou adivinhar.
    status_evento: opcoesDe(repo, 'status_evento'),
    status_cliente: opcoesDe(repo, 'status_cliente'),
  };
}

function buscarMemoria(repo) {
  return repo.get('MemoriaIA')
    .slice()
    .sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)))
    .map((m) => ({ id: m.id, texto: m.texto, criadoEm: m.criadoEm }));
}

function registrarMemoria(repo, { texto } = {}) {
  const limpo = String(texto ?? '').trim();
  if (!limpo) throw new Error('registrar_memoria: "texto" é obrigatório.');
  if (limpo.length > 400) throw new Error('registrar_memoria: regra longa demais (máx. 400 caracteres) — resuma em uma frase.');

  const memorias = repo.get('MemoriaIA');
  // Duplicata exata só inflaria o system prompt, que é reenviado a cada
  // chamada ao modelo.
  const jaExiste = memorias.find((m) => String(m.texto).trim().toLowerCase() === limpo.toLowerCase());
  if (jaExiste) return { id: jaExiste.id, texto: jaExiste.texto, jaExistia: true };

  // Cliente vai pela fila (escrita direta no SQLite é bloqueada lá); servidor
  // grava sobre o `repo` recebido. Ao contrário do log de auditoria, uma falha
  // aqui NÃO é silenciada: o agente diria "gravei" sem ter gravado.
  const payload = { texto: limpo, origem: 'agente', criadoEm: new Date().toISOString() };
  const nova = isClient
    ? executarMutacao('memoriaIA', 'create', { payload })
    : memoriaIADominio.criar(repo, payload);
  return { ...nova, jaExistia: false };
}

function removerMemoria(repo, { id } = {}) {
  if (!id) throw new Error('remover_memoria: "id" é obrigatório.');
  const memorias = repo.get('MemoriaIA');
  const alvo = memorias.find((m) => String(m.id) === String(id));
  if (!alvo) throw new Error(`remover_memoria: regra "${id}" não encontrada.`);
  if (isClient) executarMutacao('memoriaIA', 'delete', { id });
  else memoriaIADominio.remover(repo, id);
  return { removido: alvo.texto };
}

function buscarDossieCliente(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_dossie_cliente: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_dossie_cliente: cliente "${clientId}" não encontrado.`);
  const analise = repo.get('AnalisesIA').find((a) => String(a.clientId) === String(clientId));
  return {
    ...identidadeCliente(cliente),
    ...situacaoCadastro(repo, cliente),
    dossie: lerDossieCliente(clientId),
    ultimaAnalise: analise ?? null,
  };
}

/**
 * Linha do tempo do nível de risco do cliente — cada análise automática
 * ANTERIOR arquivada em AnalisesIAHistorico antes de ser sobrescrita (ver
 * server/ia/analisesAutomaticas.cjs), mais a atual (AnalisesIA). Item 4 do
 * levantamento de gaps: antes, cada análise nova apagava a anterior — não
 * dava pra responder "esse cliente está piorando?" com dado real, só com
 * memória de conversas antigas (não confiável). Mais antiga primeiro.
 */
function buscarHistoricoRiscoCliente(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_historico_risco_cliente: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_historico_risco_cliente: cliente "${clientId}" não encontrado.`);
  const antigas = repo.get('AnalisesIAHistorico').filter((a) => String(a.clientId) === String(clientId));
  const atual = repo.get('AnalisesIA').find((a) => String(a.clientId) === String(clientId));
  const linha = [...antigas, ...(atual ? [atual] : [])]
    .sort((a, b) => new Date(a.geradoEm) - new Date(b.geradoEm))
    .map((a) => ({ geradoEm: a.geradoEm, nivelRisco: a.nivelRisco, resumo: a.resumo }));
  return { ...identidadeCliente(cliente), historico: linha };
}

/**
 * Registros estruturados de produto (Monitoria: `produtosSituacao`;
 * Precificação: `precificacoes`) preenchidos no `EventFormModal` — dado bruto,
 * diferente do dossiê (que é a síntese já consolidada pela análise
 * automática). Últimos 10 eventos com algum registro, mais recente primeiro:
 * teto simples pra não estourar o prompt num cliente com histórico longo.
 */
function buscarRegistrosProduto(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_registros_produto: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_registros_produto: cliente "${clientId}" não encontrado.`);

  const registros = repo.get('Agenda')
    .filter((a) => String(a.clientId) === String(clientId))
    .map((a) => ({ ...a, produtosSituacao: listaJSON(a.produtosSituacao), precificacoes: listaJSON(a.precificacoes) }))
    .filter((a) => a.produtosSituacao.length > 0 || a.precificacoes.length > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map((a) => ({
      date: dataCivilEvento(a.date), hora: a.time || null, type: a.type, status: a.status,
      reagendamentos: a.reagendamentos || 0,
      produtosSituacao: a.produtosSituacao,
      precificacoes: a.precificacoes,
    }));

  return { ...identidadeCliente(cliente), registros };
}

/**
 * Única ferramenta com poder de EDITAR algo existente — escopo deliberadamente
 * restrito ao dossiê (memória da própria IA, reescrita toda hora pela análise
 * automática de qualquer forma), nunca a um registro de negócio (Cliente,
 * Agenda, Lembrete seguem só criação, ver `normas.cjs`). Mantém o nível de
 * risco atual (não deixa o agente "recalcular" risco a partir de uma
 * correção pontual de fato) e exige o corpo INTEIRO reescrito respeitando o
 * template de 5 seções — mais simples e previsível que aceitar um diff.
 */
/**
 * Seção "### Próxima pauta" do corpo do dossiê, em texto — usada só pra
 * manter `AnalisesIA.sugestaoProximaPauta` sincronizada (ver comentário em
 * `corrigirDossie` abaixo). "— nenhum registro"/traço solto vira string vazia,
 * mesma convenção de seção vazia do template.
 */
function extrairProximaPauta(corpo) {
  const m = corpo.match(/###\s*Próxima pauta([\s\S]*?)(?:\n###|$)/i);
  if (!m) return '';
  const texto = m[1].trim();
  return /^[—-]?\s*(nenhum registro)?\.?$/i.test(texto) ? '' : texto;
}

function corrigirDossie(repo, { clientId, dossie }) {
  if (!clientId || !dossie) throw new Error('corrigir_dossie_cliente: "clientId" e "dossie" são obrigatórios.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`corrigir_dossie_cliente: cliente "${clientId}" não encontrado.`);
  const analise = repo.get('AnalisesIA').find((a) => String(a.clientId) === String(clientId));
  corrigirDossieCliente({ clientId, empresa: cliente.empresa, nivelRisco: analise?.nivelRisco ?? 'baixo', corpoNovo: dossie });

  // Bug real: o dossiê (arquivo) e `AnalisesIA` (sheet, usada pelo card de
  // análise na ficha do cliente e no dashboard) são DUAS fontes diferentes, e
  // corrigir uma não atualizava a outra — o usuário pedia pro agente "apagar"
  // a próxima pauta, o agente confirmava, o dossiê mudava, mas a ficha do
  // cliente continuava mostrando a pauta antiga porque lia `AnalisesIA`, não
  // o arquivo. Mantém as duas em sincronia pro campo que mais causou
  // confusão (a pauta); `resumo`/`fatores` continuam sendo só da análise
  // automática, de propósito — não são um-pra-um com nenhuma seção do dossiê.
  // `AnalisesIA` continua FORA da fila de propósito: é saída da análise
  // automática, que só roda na máquina servidora (`server.cjs`, gated por
  // `isServer`) — enfileirar daqui criaria uma segunda origem de escrita pra
  // um dado que tem dono único. O dossiê (arquivo, `fs` puro, sem guarda de
  // SQLite) já foi gravado acima e vale em qualquer máquina; esta
  // sincronização secundária é pulada em cliente em vez de derrubar tudo.
  if (analise && !isClient) repo.update('AnalisesIA', analise.id, { sugestaoProximaPauta: extrairProximaPauta(dossie) });

  // Aviso explícito de que a correção NÃO alcançou `resumo`/`fatores`/
  // `nivelRisco` — que é justamente o que a ficha do cliente e o dashboard
  // mostram. Caso real: o usuário corrigiu o motivo de duas reuniões, o
  // agente confirmou "removido o termo genérico", e a ficha continuou
  // dizendo "padrão de desalinhamento" porque lê o outro registro. Sem este
  // campo no retorno, o agente não tinha como saber que ficou pela metade.
  return {
    ok: true,
    empresa: cliente.empresa,
    analiseDesatualizada: Boolean(analise) && {
      motivo: 'O dossiê foi corrigido, mas resumo, fatores e nível de risco da ficha do cliente vêm da análise automática e continuam com o texto antigo.',
      nivelRiscoAtual: analise?.nivelRisco ?? null,
      resumoAtual: analise?.resumo ?? '',
      comoResolver: 'Ofereça reanalisar_cliente pra refazer resumo/fatores/risco a partir do dossiê corrigido — só chame se o usuário aceitar.',
    },
  };
}

/** Catálogo de vendas do cliente (produtos/clientes finais), pra IA corrigir
 *  grafia da transcrição — integração opcional, mesmo padrão de `POST /gerar-ata`. */
function catalogoParaAta(clientId) {
  if (!clientId) return { produtosCatalogo: [], clientesCatalogo: [] };
  try {
    const { catalogoDoCliente } = require('../alvos/consulta.cjs');
    const cat = catalogoDoCliente(clientId);
    return { produtosCatalogo: cat.produtos ?? [], clientesCatalogo: cat.clientes ?? [] };
  } catch {
    return { produtosCatalogo: [], clientesCatalogo: [] };
  }
}

/** Evento (linha crua de `Agenda`) com os campos JSON deserializados —
 *  mesmo tratamento que `ataPdf.cjs`/`ataTexto.cjs` esperam receber. */
function eventoParaAta(evento) {
  let preAnalise;
  if (typeof evento.preAnalise === 'string' && evento.preAnalise.trim()) {
    try { preAnalise = JSON.parse(evento.preAnalise); } catch { preAnalise = undefined; }
  } else if (evento.preAnalise && typeof evento.preAnalise === 'object') {
    preAnalise = evento.preAnalise;
  }
  return {
    ...evento,
    checklist: listaJSON(evento.checklist),
    monitores: listaJSON(evento.monitores),
    servicos: listaJSON(evento.servicos),
    produtosSituacao: listaJSON(evento.produtosSituacao),
    preAnalise,
  };
}

/**
 * "Especialista de ata" pro monitorIA: redige (ou re-redige) as 3 seções de
 * conteúdo da ata de UMA reunião já existente, a partir do que já está
 * gravado nela (resumo/transcrição/pauta/Registro da Monitoria) — mesmo
 * motor (`gerarAtaIA`) do botão "Gerar ata com IA" do `EventFormModal`, mas
 * disparável pela conversa.
 *
 * NUNCA salva sozinho por padrão (`salvar` omitido ou `false`): devolve o
 * rascunho pro monitor revisar na conversa. Só grava no evento quando
 * `salvar: true` — o agente só deve mandar isso depois do usuário CONFIRMAR
 * que quer a versão redigida valendo (pedido explícito do usuário: "só
 * mostra o rascunho... ou se ele pedir pra gerar uma nova ata editada").
 * `instrucaoPersonalizada` permite um pedido livre ("foca no financeiro",
 * "deixa mais curto") — entra no prompt junto da transcrição, a fonte mais
 * livre que o modelo já lê.
 */
async function redigirAtaReuniao(repo, { eventId, instrucaoPersonalizada, salvar }) {
  if (!eventId) throw new Error('redigir_ata_reuniao: "eventId" é obrigatório.');
  const evento = repo.get('Agenda').find((a) => String(a.id) === String(eventId));
  if (!evento) throw new Error(`redigir_ata_reuniao: evento "${eventId}" não encontrado.`);
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(evento.clientId));

  const ev = eventoParaAta(evento);
  const { produtosCatalogo, clientesCatalogo } = catalogoParaAta(evento.clientId);

  const transcricaoComInstrucao = [
    ev.transcricao,
    instrucaoPersonalizada ? `INSTRUÇÃO DO MONITOR PARA ESTA REDAÇÃO: ${instrucaoPersonalizada}` : null,
  ].filter(Boolean).join('\n\n') || undefined;

  const secoes = await gerarAtaIA({
    subject: ev.subject, resumo: ev.resumo, description: ev.description,
    checklist: ev.checklist, produtosSituacao: ev.produtosSituacao, transcricao: transcricaoComInstrucao,
    // Nome do monitor vai pro prompt: é o responsável das tarefas internas em
    // "próximos passos" (a IA escrevia "[2D]"/"[Negócios 2D]" sem isso).
    monitores: ev.monitores,
    produtosCatalogo, clientesCatalogo, repo,
  });

  const ataCompleta = gerarAta(
    ev,
    { cliente: cliente ? { ...cliente, contatos: listaJSON(cliente.contatos) } : undefined },
    secoes
  );

  if (salvar) executarMutacao('agenda', 'update', { id: evento.id, patch: { ata: ataCompleta } });

  return { salvo: Boolean(salvar), oQueFoiTratado: secoes.oQueFoiTratado, decisoes: secoes.decisoes, proximosPassos: secoes.proximosPassos, ataCompleta };
}

/**
 * Gera o PDF da ata de uma reunião — mesmo layout do botão que já existe na
 * tela do evento (marca 2D Consultores, seções 1-4), só que pelo chat. Lê a
 * ata JÁ GRAVADA no evento (`ev.ata`/`resumo`/`checklist`) — pra PDF de uma
 * redação ainda não salva, primeiro chame `redigir_ata_reuniao` com
 * `salvar: true`.
 *
 * NUNCA anexa à reunião sem pedir (`anexar` omitido ou `false`): devolve só
 * a URL pro monitor abrir/baixar no navegador. Só grava como anexo do
 * evento quando `anexar: true` — pergunte antes de mandar isso (pedido
 * explícito do usuário).
 */
function gerarAtaPdfFerramenta(repo, { eventId, anexar }) {
  if (!eventId) throw new Error('gerar_ata_pdf: "eventId" é obrigatório.');
  const evento = repo.get('Agenda').find((a) => String(a.id) === String(eventId));
  if (!evento) throw new Error(`gerar_ata_pdf: evento "${eventId}" não encontrado.`);
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(evento.clientId));

  const ev = eventoParaAta(evento);
  const ctx = cliente ? { cliente: { ...cliente, contatos: listaJSON(cliente.contatos) } } : {};
  const { buffer, nomeArquivo } = gerarAtaPdfBuffer(ev, ctx);

  const filename = `${crypto.randomUUID()}-${nomeArquivo}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  const url = `/uploads/${filename}`;

  let anexado = false;
  if (anexar) {
    const attachments = listaJSON(evento.attachments);
    attachments.push({ id: filename, filename, originalName: nomeArquivo, uploadedAt: new Date().toISOString() });
    executarMutacao('agenda', 'update', { id: evento.id, patch: { attachments } });
    anexado = true;
  }

  return { url, nomeArquivo, anexado };
}

/**
 * Mesma regra de conflito do `EventFormModal.tsx` (monitor ou sala não podem
 * ocupar o mesmo dia/horário duas vezes) — só existia no frontend até agora.
 * Gap real: o agente de chat criava reunião direto via `executarMutacao`,
 * sem essa checagem — nada impedia ele de marcar em cima de outra reunião já
 * confirmada. Só vale pra Reunião (Contato/Relatório/Ligação não ocupam
 * agenda de verdade, mesmo critério do form).
 */
function conflitoAgenda(repo, { type, date, time, monitores, sala, excluirId }) {
  if (!/reuni/i.test(type || '') || !time) return null;
  // Compara o DIA por prefixo da string ISO, não parseando pra Date — `date`
  // é meia-noite UTC (placeholder, ver `criarEvento`), e new Date(...)/date-fns
  // em fuso negativo (Brasil) desloca um dia pra trás (bug documentado no
  // CLAUDE.md). String compara sem esse risco.
  const diaAlvo = String(date).slice(0, 10);
  const agenda = repo.get('Agenda').filter((a) => a.id !== excluirId && /reuni/i.test(a.type || ''));
  const naoOcupaHorario = (a) => /cancel|reagend/i.test(a.status || '');
  const mesmoDiaHora = (a) => a.time === time && String(a.date).slice(0, 10) === diaAlvo;

  if (monitores?.length) {
    const conflito = agenda.find((a) =>
      !naoOcupaHorario(a) && mesmoDiaHora(a) && listaJSON(a.monitores).some((m) => monitores.includes(m))
    );
    if (conflito) {
      const nome = listaJSON(conflito.monitores).find((m) => monitores.includes(m));
      return `${nome} já tem outro evento marcado nesse dia e horário (cliente "${conflito.clientName}").`;
    }
  }
  if (sala) {
    const conflito = agenda.find((a) => !naoOcupaHorario(a) && mesmoDiaHora(a) && a.sala === sala);
    if (conflito) return `A sala "${sala}" já está ocupada nesse dia e horário (cliente "${conflito.clientName}").`;
  }
  return null;
}

/**
 * Data CIVIL do evento (AAAA-MM-DD) pra devolver ao agente — nunca o ISO
 * completo.
 *
 * Bug real: um evento SEM hora marcada (`time` vazio) ficou gravado como
 * "2026-09-08T12:00:00.000Z" (o meio-dia UTC que `normalizarDataEvento` usa
 * de sentinela justamente pra data não escorregar de fuso). O agente leu esse
 * ISO, achou que 12:00 era o horário da reunião e respondeu ao usuário
 * "próxima reunião às 12h" — hora que nunca foi marcada por ninguém. Pior que
 * errar: soou preciso.
 *
 * A hora da reunião mora SÓ na coluna `time`. Cortando a parte de hora aqui,
 * o agente não tem de onde inventar: ou `time` tem valor, ou não há hora.
 *
 * `slice(0, 10)` do ISO (que é UTC) dá a data civil certa nas duas convenções
 * que a base usa — "T03:00:00.000Z" (meia-noite de Brasília, gravado pela
 * tela) e "T12:00:00.000Z" (sentinela do agente) caem no mesmo dia civil.
 */
function dataCivilEvento(date) {
  const texto = String(date ?? '');
  return texto.slice(0, 10) || null;
}

/**
 * Normaliza a data do evento pro MESMO formato que o resto da base usa: ISO
 * completo. O agente gravou "2026-09-08" (data pura) num evento real, enquanto
 * todos os outros da mesma cliente estavam como "2026-08-28T03:00:00.000Z" —
 * data pura é lida como meia-noite UTC e escorrega um dia pra trás em fuso
 * negativo (ver CLAUDE.md, "Cuidado com datas type=date"). Já vindo com hora,
 * mantém como está.
 */
function normalizarDataEvento(date, campo) {
  const texto = String(date ?? '').trim();
  const soData = /^\d{4}-\d{2}-\d{2}$/.exec(texto);
  if (soData) {
    // Meio-dia UTC: qualquer fuso entre -11 e +11 continua no MESMO dia
    // civil, então a data não escorrega nem pra frente nem pra trás.
    const d = new Date(`${texto}T12:00:00.000Z`);
    if (isNaN(d.getTime())) throw new Error(`${campo}: data "${texto}" inválida.`);
    return d.toISOString();
  }
  const d = new Date(texto);
  if (isNaN(d.getTime())) throw new Error(`${campo}: data "${texto}" inválida (use AAAA-MM-DD).`);
  return d.toISOString();
}

function criarEvento(repo, args) {
  const { clientId, time, subject, description } = args;
  if (!clientId || !args.type || !args.date) throw new Error('criar_evento: "clientId", "type" e "date" são obrigatórios.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`criar_evento: cliente "${clientId}" não encontrado.`);

  // Tudo que é opção de cadastro passa por `resolverOpcao` ANTES de gravar —
  // ver o comentário lá sobre o "Erick" que virou campo vazio na tela.
  const type = resolverOpcao(repo, 'tipo_evento', args.type, 'criar_evento: type');
  // Serviço é obrigatório em todo evento. Sem ele, usa o dedutível do cliente
  // (Precificação → Price, Relatório → Monitoria, cliente com um serviço só);
  // se for ambíguo, erra pedindo o serviço em vez de gravar vazio.
  const servicosPedidos = listaJSON(args.servicos).length ? args.servicos : servicoPadraoDoEvento({ type }, cliente);
  if (!servicosPedidos) {
    throw new Error(`criar_evento: "servicos" é obrigatório — ${cliente.empresa} contrata ${listaJSON(cliente.servicos).join(', ') || 'nenhum serviço'}; pergunte ao usuário qual deles o evento trata.`);
  }
  const servicos = resolverLista(repo, 'servico', servicosPedidos, 'criar_evento: servicos');
  const monitores = resolverLista(repo, 'monitor', args.monitores, 'criar_evento: monitores');
  const sala = args.sala ? resolverOpcao(repo, 'sala', args.sala, 'criar_evento: sala') : args.sala;
  // `status` agora é PARÂMETRO validado: era fixo em "Agendado", então pedir
  // "cria como rascunho" fazia o agente responder que criou um rascunho e
  // gravar "Agendado" (caso real). Se o status pedido não existe no cadastro,
  // `resolverOpcao` erra com a lista válida e o modelo corrige — em vez de
  // afirmar algo que não aconteceu.
  const status = args.status ? resolverOpcao(repo, 'status_evento', args.status, 'criar_evento: status') : 'Agendado';
  const date = normalizarDataEvento(args.date, 'criar_evento: date');

  // A hora real é o campo `time` (HH:mm), sempre separado de `date`, mesma
  // convenção do resto do app. Sem `time`, Reunião ainda pode ser criada, só
  // não dá pra checar conflito de horário.
  const conflito = conflitoAgenda(repo, { type, date, time, monitores, sala });
  if (conflito) throw new Error(`criar_evento: conflito de agenda — ${conflito}`);

  return executarMutacao('agenda', 'create', {
    payload: {
      clientId, clientName: cliente.empresa, type, date, time,
      subject: subject || '', description: description || '',
      servicos: servicos || [], monitores: monitores || [], sala: sala || undefined,
      status, checklist: [], attachments: [],
      createdAt: new Date().toISOString(),
    },
  });
}

/**
 * Edita um evento JÁ EXISTENTE. Antes não existia: o agente criava a reunião,
 * o usuário pedia pra preencher monitor/serviço depois e a resposta era "a
 * edição de agenda é manual no sistema, você vai precisar abrir o evento" —
 * com o evento incompleto que ele mesmo tinha criado.
 *
 * Só mexe no que vem no argumento (patch parcial); campo ausente fica como
 * está. Todo valor de cadastro passa pela mesma validação de `criar_evento`,
 * então "Erick" continua virando "Erick Cardoso" e status inexistente falha
 * com a lista válida em vez de gravar torto.
 */
function atualizarEvento(repo, args) {
  const { eventId } = args;
  if (!eventId) throw new Error('atualizar_evento: "eventId" é obrigatório.');
  const evento = repo.get('Agenda').find((a) => String(a.id) === String(eventId));
  if (!evento) throw new Error(`atualizar_evento: evento "${eventId}" não encontrado.`);

  const patch = {};
  if (args.type !== undefined) patch.type = resolverOpcao(repo, 'tipo_evento', args.type, 'atualizar_evento: type');
  if (args.status !== undefined) patch.status = resolverOpcao(repo, 'status_evento', args.status, 'atualizar_evento: status');
  if (args.sala !== undefined) patch.sala = args.sala ? resolverOpcao(repo, 'sala', args.sala, 'atualizar_evento: sala') : '';
  if (args.servicos !== undefined) {
    patch.servicos = resolverLista(repo, 'servico', args.servicos, 'atualizar_evento: servicos') || [];
    if (patch.servicos.length === 0) throw new Error('atualizar_evento: "servicos" não pode ficar vazio — todo evento precisa de pelo menos um serviço.');
  }
  if (args.monitores !== undefined) patch.monitores = resolverLista(repo, 'monitor', args.monitores, 'atualizar_evento: monitores') || [];
  if (args.date !== undefined) patch.date = normalizarDataEvento(args.date, 'atualizar_evento: date');
  if (args.time !== undefined) patch.time = args.time || '';
  if (args.duracao !== undefined) patch.duracao = Number(args.duracao) || undefined;
  if (args.subject !== undefined) patch.subject = String(args.subject);
  if (args.description !== undefined) patch.description = String(args.description);
  if (args.resumo !== undefined) patch.resumo = String(args.resumo);

  if (Object.keys(patch).length === 0) {
    throw new Error('atualizar_evento: nenhum campo pra alterar — informe ao menos um (date, time, duracao, type, status, subject, description, resumo, sala, servicos, monitores).');
  }

  // Conflito é checado com o estado RESULTANTE (o que muda + o que fica),
  // senão mudar só a sala não veria o horário atual do evento. O próprio
  // evento sai da checagem (`excluirId`) — senão ele conflitaria consigo mesmo.
  const futuro = {
    type: patch.type ?? evento.type,
    date: patch.date ?? evento.date,
    time: patch.time ?? evento.time,
    monitores: patch.monitores ?? listaJSON(evento.monitores),
    sala: patch.sala ?? evento.sala,
  };
  const conflito = conflitoAgenda(repo, { ...futuro, excluirId: eventId });
  if (conflito) throw new Error(`atualizar_evento: conflito de agenda — ${conflito}`);

  return executarMutacao('agenda', 'update', { id: eventId, patch });
}

/**
 * Edita o CADASTRO de um cliente (patch parcial). Não cria nem exclui cliente
 * — criar/excluir cliente segue sendo ação humana na tela, porque exclusão faz
 * cascade em agenda/lembretes/ações e criação duplicada é difícil de desfazer.
 */
function atualizarCliente(repo, args) {
  const { clientId } = args;
  if (!clientId) throw new Error('atualizar_cliente: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`atualizar_cliente: cliente "${clientId}" não encontrado.`);

  const patch = {};
  if (args.monitor !== undefined) patch.monitor = args.monitor ? resolverOpcao(repo, 'monitor', args.monitor, 'atualizar_cliente: monitor') : '';
  if (args.status !== undefined) patch.status = resolverOpcao(repo, 'status_cliente', args.status, 'atualizar_cliente: status');
  if (args.local !== undefined) patch.local = args.local ? resolverOpcao(repo, 'local_cliente', args.local, 'atualizar_cliente: local') : '';
  if (args.linha !== undefined) patch.linha = args.linha ? resolverOpcao(repo, 'linha_cliente', args.linha, 'atualizar_cliente: linha') : '';
  if (args.servicos !== undefined) patch.servicos = resolverLista(repo, 'servico', args.servicos, 'atualizar_cliente: servicos') || [];
  if (args.estado !== undefined) {
    const alvo = semAcento(args.estado);
    const valido = ['ativo', 'inativo'].find((e) => e === alvo);
    if (!valido) throw new Error(`atualizar_cliente: estado "${args.estado}" inválido. Valores válidos: Ativo, Inativo.`);
    patch.estado = valido === 'ativo' ? 'Ativo' : 'Inativo';
  }
  if (args.observacao !== undefined) patch.observacao = String(args.observacao);
  if (args.endereco !== undefined) patch.endereco = String(args.endereco);
  if (args.grupo !== undefined) patch.grupo = String(args.grupo);
  // `pausadoAte: null` explícito = retomar (limpa os dois campos) — mesma
  // convenção de `senhaPrice` em prepararPatchPrice (routes/clients.cjs):
  // ausente/undefined nunca mexe no que já está salvo, null é "apagar de
  // propósito". Pausa é conceito à parte de status/estado (não sobrescreve).
  if (args.pausadoAte === null) {
    patch.pausadoAte = '';
    patch.motivoPausa = '';
  } else if (args.pausadoAte !== undefined) {
    const data = String(args.pausadoAte).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(new Date(data).getTime())) {
      throw new Error('atualizar_cliente: "pausadoAte" precisa ser uma data no formato AAAA-MM-DD, ou null pra retomar o cliente.');
    }
    patch.pausadoAte = data;
    if (args.motivoPausa !== undefined) patch.motivoPausa = String(args.motivoPausa);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('atualizar_cliente: nenhum campo pra alterar — informe ao menos um (monitor, status, estado, local, linha, servicos, observacao, endereco, grupo, pausadoAte).');
  }

  return executarMutacao('clientes', 'update', { id: clientId, patch });
}

/** Mesmo cálculo de `segmentoDe` em `src/components/AcaoFormModal.tsx` — a
 *  "temperatura" do cliente pela cadência (fonte única, ver comentário lá).
 *  Cliente fora do modelo de cadência (sem Monitoria/Price) cai no fallback
 *  por recência simples de eventos passados. */
function segmentoDoCliente(repo, clientId) {
  const clientes = repo.get('Clientes');
  const agenda = repo.get('Agenda');
  const acoes = repo.get('Acoes');
  const cadencias = lerCadencias(repo);
  const fila = buildFilaCadencia(clientes, agenda, acoes, cadencias);
  const item = fila.find((f) => String(f.cliente.id) === String(clientId));
  if (!item) {
    const agora = new Date();
    const datas = agenda
      .filter((a) => String(a.clientId) === String(clientId))
      .map((a) => parseISO(a.date))
      .filter((d) => !isNaN(d.getTime()) && d <= agora);
    if (datas.length === 0) return 'frio';
    const ultimo = new Date(Math.max(...datas.map((d) => d.getTime())));
    const esfriandoDias = Number(cadencias?.esfriando_dias) || 30;
    const dias = Math.round((agora - ultimo) / 86400e3);
    return dias >= esfriandoDias ? 'esfriando' : 'engajado';
  }
  const c = classificarCadencia(item);
  return c === 'vencido' ? 'frio' : c === 'vencendo' ? 'esfriando' : 'engajado';
}

/**
 * Registra uma Ação — reunião/contato/relatório/price já REALIZADO
 * (`data` no passado ou hoje) ou PROGRAMADO (`data` no futuro).
 *
 * `resultado: 'sem_sucesso'` (tentou contato e não conseguiu — ligou, não
 * atendeu) é DIFERENTE de 'sucesso': só 'sucesso' zera o relógio de
 * cadência (ver shared/cadenciaServico.cjs, buildUltimaInteracaoMap) — uma
 * tentativa malsucedida NÃO deve fazer o cliente sumir da fila como se
 * tivesse sido atendido de verdade (era exatamente esse bug antes de
 * 'sem_sucesso' existir). Só vale pra ação já REALIZADA — ação programada
 * não tem resultado ainda.
 */
function registrarAcao(repo, args) {
  const { clientId, tipo, resultado } = args;
  if (!clientId) throw new Error('registrar_acao: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`registrar_acao: cliente "${clientId}" não encontrado.`);
  if (!['contato', 'reuniao', 'relatorio', 'price'].includes(tipo)) {
    throw new Error('registrar_acao: "tipo" precisa ser contato, reuniao, relatorio ou price.');
  }
  const dataStr = args.data ? String(args.data).trim() : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) throw new Error('registrar_acao: "data" precisa ser AAAA-MM-DD.');
  const dueAt = normalizarDataEvento(dataStr, 'registrar_acao: data');
  const realizada = dueAt.slice(0, 10) <= new Date().toISOString().slice(0, 10);

  let status;
  if (!realizada) {
    status = 'programado';
  } else if (resultado === 'sem_sucesso') {
    status = 'sem_sucesso';
  } else if (!resultado || resultado === 'sucesso') {
    status = 'concluido';
  } else {
    throw new Error('registrar_acao: "resultado" precisa ser sucesso ou sem_sucesso (só faz sentido pra ação já realizada).');
  }

  const servico = args.servico ? resolverOpcao(repo, 'servico', args.servico, 'registrar_acao: servico') : undefined;
  const monitor = args.monitor ? resolverOpcao(repo, 'monitor', args.monitor, 'registrar_acao: monitor') : undefined;

  return executarMutacao('acoes', 'create', {
    payload: {
      clientId, tipo, segmento: segmentoDoCliente(repo, clientId), status,
      servico, monitor, notes: args.notes || '', dueAt,
    },
  });
}

function criarLembrete(repo, args) {
  const { clientId, title, datetime, description } = args;
  const type = args.type ? resolverOpcao(repo, 'tipo_lembrete', args.type, 'criar_lembrete: type') : args.type;
  if (!title || !datetime) throw new Error('criar_lembrete: "title" e "datetime" são obrigatórios.');
  return executarMutacao('lembretes', 'create', {
    payload: {
      clientId: clientId || '', title, datetime, description: description || '',
      type: type || 'Contato', status: 'ativo', recurrence: 'none',
      createdAt: new Date().toISOString(),
    },
  });
}

function gerarRelatorioExecutivo(repo, _argumentos, ctx = {}) {
  const clientes = clientesDoMonitor(repo, ctx);
  const idsDoEscopo = new Set(clientes.map((c) => String(c.id)));
  const analises = repo.get('AnalisesIA').filter((a) => idsDoEscopo.has(String(a.clientId)));
  const empresaPorId = new Map(clientes.map((c) => [String(c.id), c.empresa]));

  const porNivel = { baixo: 0, medio: 0, alto: 0 };
  const pautasRiscoAlto = [];
  for (const a of analises) {
    if (a.nivelRisco in porNivel) porNivel[a.nivelRisco]++;
    if (a.nivelRisco === 'alto') {
      pautasRiscoAlto.push({ empresa: empresaPorId.get(String(a.clientId)) ?? a.clientId, sugestaoProximaPauta: a.sugestaoProximaPauta });
    }
  }

  return {
    clientesAnalisados: analises.length,
    porNivelRisco: porNivel,
    clientesRiscoAlto: pautasRiscoAlto,
  };
}

/**
 * Retrato pequeno de dado REAL, específico do conceito pedido — reaproveita
 * funções já existentes neste arquivo/`cadenciaServico.cjs`, nunca duplica
 * lógica de negócio. Escopado por monitor (ctx), igual ao resto das
 * ferramentas de consulta.
 */
function dadosReaisDoConceito(repo, conceito, ctx) {
  const clientes = clientesDoMonitor(repo, ctx);
  switch (conceito) {
    case 'cliente_ativo': {
      const ativos = clientes.filter((c) => isClienteAtivo(c));
      const inativosPorStatus = clientes.filter((c) => !isClienteAtivo(c) && c.estado !== 'Inativo');
      return {
        totalClientes: clientes.length,
        ativos: ativos.length,
        inativos: clientes.length - ativos.length,
        exemploInativoComEstadoAtivo: inativosPorStatus[0]
          ? { empresa: inativosPorStatus[0].empresa, estado: inativosPorStatus[0].estado, status: inativosPorStatus[0].status }
          : null,
      };
    }
    case 'atendimento_vs_cliente': {
      const ativos = clientes.filter((c) => isClienteAtivo(c));
      const grupos = new Set();
      let semGrupo = 0;
      ativos.forEach((c) => { if (c.grupo) grupos.add(c.grupo); else semGrupo++; });
      return { totalAtendimentos: ativos.length, totalClientesUnicos: grupos.size + semGrupo, redesComMaisDeUmaLoja: grupos.size };
    }
    case 'cadencia': {
      const agenda = repo.get('Agenda');
      const acoes = repo.get('Acoes');
      const cadenciasObj = lerCadencias(repo);
      const fila = buildFilaCadencia(clientes, agenda, acoes, cadenciasObj, new Date());
      return {
        configDias: cadenciasObj,
        top3MaisAtrasados: fila.slice(0, 3).map((f) => ({ empresa: f.cliente.empresa, situacao: classificarCadencia(f) })),
      };
    }
    case 'cobertura_vs_saude': {
      const porStatus = {};
      clientes.forEach((c) => { const s = c.status || 'Regular'; porStatus[s] = (porStatus[s] || 0) + 1; });
      return { totalClientes: clientes.length, composicaoPorStatus: porStatus };
    }
    case 'risco_ia': {
      const analises = repo.get('AnalisesIA');
      const idsAtivos = new Set(clientes.filter((c) => isClienteAtivo(c)).map((c) => String(c.id)));
      const porNivel = { baixo: 0, medio: 0, alto: 0, sem_analise: 0 };
      const analisePorId = new Map(analises.map((a) => [String(a.clientId), a]));
      idsAtivos.forEach((id) => { const nivel = analisePorId.get(id)?.nivelRisco; porNivel[nivel && nivel in porNivel ? nivel : 'sem_analise']++; });
      return { clientesAtivos: idsAtivos.size, porNivelRisco: porNivel };
    }
    case 'acao_sem_sucesso': {
      const idsDoEscopo = new Set(clientes.map((c) => String(c.id)));
      const acoes = repo.get('Acoes').filter((a) => idsDoEscopo.has(String(a.clientId)));
      return {
        concluidas: acoes.filter((a) => a.status === 'concluido').length,
        semSucesso: acoes.filter((a) => a.status === 'sem_sucesso').length,
      };
    }
    case 'pausa_temporaria': {
      const hoje = new Date().toISOString().slice(0, 10);
      const pausados = clientes.filter((c) => c.pausadoAte && c.pausadoAte >= hoje);
      return {
        totalClientes: clientes.length,
        pausadosAgora: pausados.length,
        exemplo: pausados[0] ? { empresa: pausados[0].empresa, pausadoAte: pausados[0].pausadoAte, motivoPausa: pausados[0].motivoPausa } : null,
      };
    }
    case 'segmento_linha': {
      const porSegmento = {};
      const porLinha = {};
      clientes.forEach((c) => {
        if (c.local) porSegmento[c.local] = (porSegmento[c.local] || 0) + 1;
        if (c.linha) porLinha[c.linha] = (porLinha[c.linha] || 0) + 1;
      });
      return { porSegmento, porLinha };
    }
    default:
      return {};
  }
}

/**
 * Explica um conceito da Carteira com dado REAL da carteira do monitor,
 * não de memória solta — existe por causa de um bug real (o próprio agente
 * confundiu "estado" com "cliente ativo de verdade" numa pergunta real).
 *
 * Faz UMA chamada de modelo SEM ferramentas (`gerarJSON`), não o loop
 * completo de tool-calling (`conversar`) — evitando o risco de a ferramenta
 * chamar a si mesma (ela está na mesma lista FERRAMENTAS que um loop
 * aninhado enxergaria). O dado real é buscado ANTES, por código
 * determinístico — o modelo só redige a explicação a partir dele.
 *
 * Mede uso como `origem: 'conceito'` — mesma preocupação já registrada em
 * `analiseCliente.cjs::gerarAnaliseIA` (chamada de modelo que não passa pelo
 * chat "não aparecia no painel de consumo... gastava token pago de forma
 * invisível").
 */
async function explicarConceitoCarteira(repo, { conceito, pergunta } = {}, ctx = {}, clienteLLMFn) {
  if (!conceito || !(conceito in CONCEITOS)) {
    throw new Error(`explicar_conceito_carteira: "conceito" precisa ser um de: ${Object.keys(CONCEITOS).join(', ')}.`);
  }
  if (!pergunta) throw new Error('explicar_conceito_carteira: "pergunta" é obrigatória (a pergunta original do usuário, pra dar contexto à explicação).');

  const definicao = CONCEITOS[conceito];
  const dados = dadosReaisDoConceito(repo, conceito, ctx);
  const prompt = `Explique o conceito abaixo de forma clara e direta pro usuário de um sistema de monitoria de clientes, usando OS NÚMEROS REAIS fornecidos como exemplo concreto (não invente outros números, não fale em genérico se o dado real está disponível).

Conceito: ${conceito}
Definição correta: ${definicao}

Dado real da carteira dele agora:
${JSON.stringify(dados, null, 2)}

Pergunta original do usuário: "${pergunta}"

Responda em JSON: {"explicacao": "texto em markdown, direto, citando os números reais acima"}`;

  const { clienteLLM, provedorAtivo } = require('./provider.cjs');
  const llm = clienteLLMFn ?? clienteLLM();
  const uso = {};
  const t0 = Date.now();
  const saida = await llm.gerarJSON(prompt, { coletarUso: uso });

  const { registrarUso } = require('./uso.cjs');
  registrarUso(repo, {
    origem: 'conceito', provedor: provedorAtivo(), modelo: uso.modelo, turnId: crypto.randomUUID(),
    inputTokens: uso.inputTokens, outputTokens: uso.outputTokens,
    cacheCreationTokens: uso.cacheCreationTokens, cacheReadTokens: uso.cacheReadTokens,
    custoUsd: uso.custoUsd ?? 0, duracaoMs: Date.now() - t0,
    pergunta: `conceito — ${conceito}`, resposta: uso.resposta ?? '',
  });

  return { explicacao: typeof saida?.explicacao === 'string' ? saida.explicacao : String(saida) };
}

function buscarContatosCliente(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_contatos_cliente: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_contatos_cliente: cliente "${clientId}" não encontrado.`);
  return { ...identidadeCliente(cliente), contatos: listaJSON(cliente.contatos) };
}

/**
 * Histórico cru da Agenda (não só os que têm produto/precificação registrado,
 * diferente de `buscar_registros_produto`) — pra "quando foi a última reunião
 * com esse cliente" / "quantas reuniões tivemos esse ano", que hoje não tinha
 * nenhuma ferramenta pra responder. Mais recente primeiro, teto de 15 pelo
 * mesmo motivo do teto de `buscar_registros_produto` (não estourar o prompt).
 */
/**
 * Tarefas combinadas numa ata, no formato que a ata gerada usa:
 * `Responsável: ação`, uma por linha, na seção de tarefas.
 *
 * Extrai como DADO ESTRUTURADO (responsável separado da ação, com a data da
 * reunião) em vez de deixar o modelo garimpar em 6 mil caracteres de texto —
 * assim ele consegue comparar o combinado com o que aconteceu depois e dizer
 * o que virou ação e o que ficou parado, que é o valor real. Não inventa
 * status: se a tarefa foi cumprida ou não, isso o sistema não sabe; quem
 * julga é o agente com o resto do contexto (eventos posteriores, lembretes).
 */
function tarefasDaAta(ata, dataEvento) {
  const texto = String(ata ?? '');
  const secao = texto.match(/Tarefas?\s*:?([\s\S]*?)(?:Perguntas-chave|Bloco de Notas|\d\.\s*DECIS|\d\.\s*PR[ÓO]XIMOS|Ata gerada|$)/i);
  if (!secao) return [];
  return secao[1].split('\n')
    .map((l) => l.trim())
    .map((l) => l.match(/^([A-Za-zÀ-ÿ][\wÀ-ÿ .'-]{1,40}?)\s*:\s*(.+)$/))
    .filter(Boolean)
    // Linha muito curta não é tarefa (título de subseção, sobra de parsing).
    .filter((m) => m[2].trim().length > 12)
    .map((m) => ({ responsavel: m[1].trim(), acao: m[2].trim(), combinadoEm: String(dataEvento ?? '').slice(0, 10) }));
}

/**
 * Escopo REUNIÃO dos Dados Alvos: o que foi pautado nas reuniões deste cliente e
 * o que o número fez depois ("retorno do combinado").
 *
 * Sem esta ferramenta o cartão de alerta abriria um chat incapaz de responder
 * sobre o próprio alerta — foi o que aconteceu com ata/anexos, que estavam na
 * resposta da ferramenta e ainda assim o agente dizia não ter acesso.
 *
 * Aquece o cache sob demanda (`aquecer: true`) se ele ainda não estiver quente:
 * a ficha do cliente já aquece ao abrir para poupar essa espera no caminho
 * comum, mas a ferramenta não pode depender disso — se ninguém abriu a ficha
 * antes de perguntar no chat, responder "dados não carregados" na primeira
 * pergunta tornaria a ferramenta inútil bem onde deveria servir. Custa até
 * ~20 s no pior caso (arquivo de 57 MB); é o mesmo tipo de espera que o usuário
 * já aceita de uma resposta do modelo.
 */
function buscarFatosAlvos(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_fatos_alvos: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_fatos_alvos: cliente "${clientId}" não encontrado.`);

  const eventos = repo.get('Agenda').filter((a) => String(a.clientId) === String(clientId));
  const { fatosDoCliente } = require('../alvos/consulta.cjs');
  const r = fatosDoCliente({ id: cliente.id, empresa: cliente.empresa }, eventos, { aquecer: true });

  // Estado diferente de ok não é lista vazia: é motivo. Sem isso o agente
  // concluiria "esse cliente não tem nada em pauta" quando o que falta é o
  // vínculo da loja.
  if (r.estado !== 'ok') {
    return { ...identidadeCliente(cliente), estado: r.estado, motivo: r.motivo, acompanhamentos: [] };
  }
  return {
    ...identidadeCliente(cliente),
    estado: 'ok',
    lojas: r.lojas,
    mesEmCursoParcial: r.periodoParcial,
    acompanhamentos: r.acompanhamentos.map((a) => ({
      entidade: a.nome,
      tipo: a.tipo,
      combinadoEm: a.combinadoEm,
      reunioes: a.reunioes.length,
      status: a.status,
      alerta: a.alerta,
      razaoDoAlerta: a.razao,
      veredicto: a.movimento?.veredicto,
      receitaAntes: a.movimento?.receita?.base,
      receitaDepois: a.movimento?.receita?.atual,
      variacaoReceita: a.movimento?.receita?.variacao,
      variacaoQtd: a.movimento?.qtd?.variacao,
      // O agente PRECISA disto para não afirmar perda com base em mês
      // incompleto: com `veredicto: 'indicativo_parcial'` não há mês fechado
      // depois da reunião.
      mesesFechadosDepois: a.movimento?.mesesDepoisFechados,
      incluiMesParcial: a.movimento?.incluiMesParcial,
    })),
  };
}

/**
 * Escopo GERAL dos Dados Alvos: receita/quantidade por período e total de
 * clientes finais distintos — o retrato cru da carteira desse cliente, sem
 * interpretação de reunião nenhuma (isso é `buscar_fatos_alvos`). Mesma
 * decisão de aquecer sob demanda, pelo mesmo motivo.
 */
function buscarResumoVendasAlvos(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_resumo_vendas_alvos: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_resumo_vendas_alvos: cliente "${clientId}" não encontrado.`);

  const { resumoGeralDoCliente } = require('../alvos/consulta.cjs');
  const r = resumoGeralDoCliente({ id: cliente.id, empresa: cliente.empresa }, { aquecer: true });

  if (r.estado !== 'ok') {
    return { ...identidadeCliente(cliente), estado: r.estado, motivo: r.motivo, serie: [] };
  }
  return {
    ...identidadeCliente(cliente),
    estado: 'ok',
    primeiroPeriodo: r.primeiroPeriodo,
    ultimoPeriodo: r.ultimoPeriodo,
    totalReceita: r.totalReceita,
    totalQtd: r.totalQtd,
    totalClientesDistintos: r.totalClientesDistintos,
    serie: r.serie,
  };
}

/**
 * Escopo ESTRATÉGICO dos Dados Alvos: as mesmas análises do relatório que o
 * analisador da 2D já gera — produto em queda persistente (3+ meses seguidos,
 * mínimo R$5.000), cliente final em erosão (caiu 50%+ do próprio pico),
 * cliente que praticamente parou (95%+ abaixo do pico) e poder de compra
 * (potencial pela média dos 3 melhores meses vs. os 3 últimos fechados). O mês
 * em curso NUNCA entra nessas contas — regra da própria fonte, não nossa.
 */
function buscarAnaliseEstrategicaAlvos(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_analise_estrategica_alvos: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_analise_estrategica_alvos: cliente "${clientId}" não encontrado.`);

  const { analiseEstrategicaDoCliente } = require('../alvos/consulta.cjs');
  const r = analiseEstrategicaDoCliente({ id: cliente.id, empresa: cliente.empresa }, { aquecer: true });

  if (r.estado !== 'ok') {
    return {
      ...identidadeCliente(cliente), estado: r.estado, motivo: r.motivo,
      quedaPersistente: [], erosaoClientes: [], semVenda: [], poderDeCompra: [],
    };
  }
  return {
    ...identidadeCliente(cliente),
    estado: 'ok',
    // Recortado pro que cabe numa resposta de chat — cada lista já vem
    // ordenada pelo maior impacto (ver analiseEstrategica.cjs); o resto some
    // sem virar poluição visual.
    quedaPersistente: r.quedaPersistente.slice(0, 10),
    erosaoClientes: r.erosaoClientes.slice(0, 10),
    semVenda: r.semVenda.slice(0, 10).map((s) => ({ ...s, serieMensal: undefined })),
    poderDeCompra: r.poderDeCompra.slice(0, 10),
  };
}

/**
 * Registra a decisão do usuário sobre um acompanhamento: seguir, abandonar ou
 * dar por resolvido. É o que faz o alerta parar de aparecer — e o motivo fica
 * gravado, diferente de um botão "dispensar".
 *
 * Grava num JSON em DATA_DIR, não no SQLite: por isso funciona em máquina
 * cliente sem passar pela fila (mesmo caminho do dossiê).
 */
function definirStatusAcompanhamento(repo, { clientId, entidade, tipo, status, nota }) {
  if (!clientId) throw new Error('definir_status_acompanhamento: "clientId" é obrigatório.');
  if (!entidade) throw new Error('definir_status_acompanhamento: "entidade" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`definir_status_acompanhamento: cliente "${clientId}" não encontrado.`);

  const { STATUS_VALIDOS, definirStatus } = require('../alvos/acompanhamento.cjs');
  if (!STATUS_VALIDOS.includes(status)) {
    throw new Error(`definir_status_acompanhamento: status inválido "${status}". Use: ${STATUS_VALIDOS.join(', ')}.`);
  }
  const tipoFinal = tipo === 'cliente' ? 'cliente' : 'produto';

  // A entidade tem de existir no catálogo da loja — nome aproximado ("kit de
  // amortecedores") gravaria um acompanhamento que nenhum cálculo encontra.
  // `aquecer: true` pelo mesmo motivo de buscar_fatos_alvos: se o catálogo não
  // estivesse disponível, pular a validação em silêncio reabriria exatamente o
  // buraco que ela existe para fechar — nome nunca confirmado contra o arquivo.
  const { catalogoDoCliente } = require('../alvos/consulta.cjs');
  const catalogo = catalogoDoCliente(cliente.id, { aquecer: true });
  if (!catalogo.disponivel) {
    throw new Error(`definir_status_acompanhamento: não foi possível confirmar "${entidade}" contra os dados do cliente (${catalogo.motivo}). Use buscar_fatos_alvos primeiro.`);
  }
  const lista = tipoFinal === 'cliente' ? catalogo.clientes : catalogo.produtos;
  const achado = lista.find((x) => String(x).toLowerCase() === String(entidade).toLowerCase());
  if (!achado) {
    throw new Error(`definir_status_acompanhamento: "${entidade}" não existe no catálogo de ${tipoFinal} deste cliente. Use buscar_fatos_alvos para ver os nomes exatos.`);
  }

  definirStatus(cliente.id, { nome: entidade, tipo: tipoFinal }, status, {
    decididoEm: new Date().toISOString().slice(0, 10),
    nota,
  });
  return { success: true, entidade, tipo: tipoFinal, status, cliente: cliente.empresa };
}

/**
 * Situação (inadimplente/regular/situação externa) de um CLIENTE FINAL —
 * o comprador da loja, não a loja em si — escopada por `clientId` (decisão
 * do usuário: o mesmo nome pode ter situação diferente em lojas diferentes,
 * porque o crédito é com a loja, não com o nome abstrato).
 *
 * Mesmo padrão de `definirStatusAcompanhamento`: JSON em DATA_DIR (não
 * SQLite), nome do cliente final validado contra o catálogo real da loja
 * antes de gravar — nunca cru (mesma disciplina de `resolverOpcao`).
 */
function definirFichaClienteFinal(repo, { clientId, clienteFinal, tags, grupo, observacao }) {
  if (!clientId) throw new Error('definir_ficha_cliente_final: "clientId" é obrigatório.');
  if (!clienteFinal) throw new Error('definir_ficha_cliente_final: "clienteFinal" é obrigatório.');
  if (tags === undefined && grupo === undefined) {
    throw new Error('definir_ficha_cliente_final: informe "tags" e/ou "grupo" — nada a gravar.');
  }
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`definir_ficha_cliente_final: cliente "${clientId}" não encontrado.`);

  // Grupo (G1/G2/G3) vem da categoria deste app; tag vem do arquivo
  // compartilhado do Ecossistema (validada dentro de `definir`).
  if (grupo) {
    const gruposValidos = opcoesDe(repo, 'grupo_referencia');
    if (!gruposValidos.some((g) => g.toLowerCase() === String(grupo).toLowerCase())) {
      throw new Error(`definir_ficha_cliente_final: grupo inválido "${grupo}". Use: ${gruposValidos.join(', ') || '(nenhum cadastrado)'}.`);
    }
  }

  const { catalogoDoCliente } = require('../alvos/consulta.cjs');
  const catalogo = catalogoDoCliente(cliente.id, { aquecer: true });
  if (!catalogo.disponivel) {
    throw new Error(`definir_ficha_cliente_final: não foi possível confirmar "${clienteFinal}" contra os dados do cliente (${catalogo.motivo}). Use buscar_fatos_alvos primeiro.`);
  }
  const achado = catalogo.clientes.find((x) => String(x).toLowerCase() === String(clienteFinal).toLowerCase());
  if (!achado) {
    throw new Error(`definir_ficha_cliente_final: "${clienteFinal}" não existe no catálogo de clientes finais desta loja. Use buscar_fatos_alvos para ver os nomes exatos.`);
  }

  const { definir } = require('../alvos/clientesFinais.cjs');
  definir(cliente.id, achado, { tags, grupo, observacao }, { atualizadoEm: new Date().toISOString().slice(0, 10) });
  return { success: true, clienteFinal: achado, tags: tags ?? null, grupo: grupo ?? null, cliente: cliente.empresa };
}

function buscarFichasClientesFinais(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_fichas_clientes_finais: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_fichas_clientes_finais: cliente "${clientId}" não encontrado.`);

  const { fichasDoCliente } = require('../alvos/clientesFinais.cjs');
  const { tagsAtivas } = require('../alvos/tags.cjs');
  return {
    cliente: cliente.empresa,
    clientesFinais: fichasDoCliente(cliente.id),
    tagsDisponiveis: tagsAtivas().map((t) => ({ id: t.id, rotulo: t.rotulo })),
    gruposDisponiveis: opcoesDe(repo, 'grupo_referencia'),
  };
}

function buscarHistoricoEventos(repo, { clientId, limite }) {
  if (!clientId) throw new Error('buscar_historico_eventos: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_historico_eventos: cliente "${clientId}" não encontrado.`);
  const teto = Math.min(Math.max(Number(limite) || 15, 1), 15);

  const eventos = repo.get('Agenda')
    .filter((a) => String(a.clientId) === String(clientId))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, teto)
    .map((a) => ({
      // `id` do evento: sem ele o agente não tinha como chamar
      // `gerar_ata_pdf`/`redigir_ata_reuniao` depois de achar a reunião aqui —
      // caso real, ele respondeu "não consegui obter o ID do evento no formato
      // esperado" e mandou o usuário gerar o PDF à mão na tela.
      id: a.id,
      // `date` é a data CIVIL (sem hora) e `time` é a ÚNICA fonte da hora —
      // ver dataCivilEvento: devolver o ISO completo fez o agente anunciar
      // "reunião às 12h" pra um evento sem hora marcada.
      date: dataCivilEvento(a.date), time: a.time || null, type: a.type, status: a.status,
      subject: a.subject || '', resumo: a.resumo || '',
      // TEXTO COMPLETO da ata — não é resumo nem indicador de existência.
      // Ver GATILHO ATA em normas.cjs: já houve resposta afirmando não ter
      // acesso a isso quando o campo estava aqui o tempo todo.
      ata: a.ata || '',
      // Arquivos anexados à reunião (PDF, planilha, foto do que foi discutido
      // etc.) — `url` é caminho relativo à raiz do app, servido estaticamente.
      anexos: listaJSON(a.attachments).map((x) => ({ nome: x.originalName || x.filename, url: `/uploads/${x.filename}` })),
      // O que ficou COMBINADO nessa reunião, já separado por responsável.
      tarefas: tarefasDaAta(a.ata, a.date),
    }));

  return { ...identidadeCliente(cliente), eventos };
}

/**
 * Mesmo cálculo do card "Aderência" da Visão Geral (`calcularAderencia`,
 * porta de `src/utils/cadenciaServico.ts` — ver comentário lá). Sem isso o
 * agente sempre recusava pergunta de "% em dia" (regra de métrica em
 * `normas.cjs`); com isso ele tem a mesma ferramenta que a tela usa.
 */
/**
 * Sugestões de encaixe (`sugestaoAgenda.cjs`) — quem agendar primeiro e
 * quando, respeitando fila de cadência, dia útil, conflito de monitor e teto
 * por dia. NÃO cria nada: quem cria é `criar_evento`, e só a pedido.
 */
function sugerirEncaixesAgenda(repo, { dias, max } = {}, ctx = {}) {
  const sugestoes = sugerirAgenda(clientesDoMonitor(repo, ctx), repo.get('Agenda'), repo.get('Acoes'), lerCadencias(repo), {
    dias: Math.min(Math.max(Number(dias) || 10, 1), 30),
    max: Math.min(Math.max(Number(max) || 8, 1), 20),
  });
  return { total: sugestoes.length, sugestoes };
}

/**
 * Agenda do CEO (Marco) — Google Calendar, somente leitura, via cache
 * sincronizado (`server/ceoAgenda.cjs`). Filtra por janela de dias pra não
 * despejar o calendário inteiro no prompt. Útil junto de
 * `sugerir_encaixes_agenda` quando a reunião precisa do Marco.
 */
function buscarAgendaCeo(repo, { dias } = {}) {
  const janela = Math.min(Math.max(Number(dias) || 14, 1), 60);
  const cache = getCacheCeoAgenda();
  const agora = new Date();
  const limite = new Date(agora.getTime() + janela * 86400e3);

  const eventos = (cache?.events || [])
    .filter((e) => { const d = new Date(e.start); return !isNaN(d.getTime()) && d >= agora && d <= limite; })
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 40);

  return { janelaDias: janela, sincronizadoEm: cache?.lastSync ?? null, erroSincronizacao: cache?.lastError ?? null, total: eventos.length, eventos };
}

/**
 * Próximos eventos da AGENDA DA CARTEIRA (reunião/contato/relatório/
 * precificação dos clientes do monitor) — não confundir com
 * `buscar_agenda_ceo`, que é a agenda PESSOAL do Marco no Google Calendar.
 *
 * Existe por um bug real: "quais reuniões tenho marcada essa semana" fazia o
 * agente chamar `buscar_agenda_ceo` (só ferramenta com "agenda" e "semana" na
 * descrição) e responder com compromissos do Marco (aniversários, etc.) como
 * se fossem da carteira de clientes — nem alucinação, ferramenta errada.
 * Mesmo filtro de "próximo" já usado em `useDashboardData.ts::proximos`
 * (front): exclui concluído/realizado (já aconteceu) e cancelado/reagendado
 * (não vai acontecer).
 */
function buscarProximasReunioes(repo, { dias } = {}, ctx = {}) {
  const janela = Math.min(Math.max(Number(dias) || 14, 1), 60);
  const clientes = clientesDoMonitor(repo, ctx);
  const idsDoEscopo = new Set(clientes.map((c) => String(c.id)));
  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + janela * 86400e3).toISOString().slice(0, 10);

  const eventos = repo.get('Agenda')
    .filter((a) => idsDoEscopo.has(String(a.clientId)))
    .filter((a) => !/conclu|realiz|cancel|reagend/i.test(a.status || ''))
    .filter((a) => { const d = String(a.date || '').slice(0, 10); return d >= hoje && d <= limite; })
    .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))
    .slice(0, 40)
    .map((a) => ({
      clientId: a.clientId, empresa: a.clientName, type: a.type, date: dataCivilEvento(a.date),
      time: a.time || null, subject: a.subject || '', status: a.status, monitores: listaJSON(a.monitores),
    }));

  return { janelaDias: janela, total: eventos.length, eventos };
}

/**
 * Lembretes de um cliente — fecha a assimetria de o agente poder CRIAR
 * lembrete (`criar_lembrete`) mas não ter como LER os que já existem (nem
 * `buscar_dossie_cliente` nem `buscar_historico_eventos` incluem Lembretes),
 * o que deixava ele criar duplicata sem saber.
 */
function buscarLembretesCliente(repo, { clientId, incluirConcluidos } = {}) {
  if (!clientId) throw new Error('buscar_lembretes_cliente: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_lembretes_cliente: cliente "${clientId}" não encontrado.`);

  const lembretes = repo.get('Lembretes')
    .filter((l) => String(l.clientId) === String(clientId))
    .filter((l) => incluirConcluidos || l.status === 'ativo')
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
    .slice(0, 20)
    .map((l) => ({ title: l.title, datetime: l.datetime, type: l.type, status: l.status, description: l.description || '', recurrence: l.recurrence }));

  return { ...identidadeCliente(cliente), total: lembretes.length, lembretes };
}

/**
 * Tarefas do Ágil (Kanban interno) vinculadas a um cliente — `AgilTarefa`
 * tem `clientId` opcional (ver `src/types/index.ts`), preenchido pelo
 * `TaskDetailModal`. Conecta trabalho interno em andamento ao contexto do
 * cliente: "esse cliente está em risco E tem tarefa bloqueada sobre ele" é
 * cruzamento que nem o dossiê nem a agenda mostram.
 */
function buscarTarefasCliente(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_tarefas_cliente: "clientId" é obrigatório.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_tarefas_cliente: cliente "${clientId}" não encontrado.`);

  const colunas = new Map(repo.get('AgilColunas').map((c) => [String(c.id), c.titulo]));
  const boards = new Map(repo.get('AgilBoards').map((b) => [String(b.id), b.nome]));

  const tarefas = repo.get('AgilTarefas')
    .filter((t) => String(t.clientId || '') === String(clientId))
    .slice(0, 20)
    .map((t) => ({
      titulo: t.titulo,
      board: boards.get(String(t.boardId)) ?? null,
      coluna: colunas.get(String(t.colunaId)) ?? null,
      responsaveis: Array.isArray(t.responsaveis) && t.responsaveis.length > 0 ? t.responsaveis : null,
      prioridade: t.prioridade || null,
      dueAt: t.dueAt || null,
      bloqueado: Boolean(t.bloqueado),
      motivoBloqueio: t.bloqueado ? (t.motivoBloqueio || null) : null,
    }));

  return { ...identidadeCliente(cliente), total: tarefas.length, tarefas };
}

/**
 * Contatos visíveis (próprios + herdados do grupo) e, principalmente, os
 * serviços CONTRATADOS que não têm ninguém responsável — porta de
 * `contatosVisiveis`/`servicosSemResponsavel` (`src/utils/contatos.ts`).
 * Diferente de `buscar_contatos_cliente` (que só lista): aqui é análise de
 * lacuna ("tem Price contratado e ninguém responsável por Price").
 */
function buscarCoberturaContatos(repo, { clientId }) {
  if (!clientId) throw new Error('buscar_cobertura_contatos: "clientId" é obrigatório.');
  const clientes = repo.get('Clientes');
  const cliente = clientes.find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`buscar_cobertura_contatos: cliente "${clientId}" não encontrado.`);

  const proprios = listaJSON(cliente.contatos).map((c) => ({ ...c, origemEmpresa: cliente.empresa, doGrupo: false }));
  const herdados = [];
  if (cliente.grupo) {
    for (const outro of clientes) {
      if (String(outro.id) === String(cliente.id) || outro.grupo !== cliente.grupo) continue;
      for (const c of listaJSON(outro.contatos)) {
        if (c.escopo !== 'grupo') continue;
        herdados.push({ ...c, origemEmpresa: outro.empresa, doGrupo: true });
      }
    }
  }
  const visiveis = [...proprios, ...herdados];

  const contratados = listaJSON(cliente.servicos);
  let semResponsavel = [];
  if (contratados.length > 0 && visiveis.length > 0 && !visiveis.some((c) => listaJSON(c.servicos).length === 0)) {
    const cobertos = new Set(visiveis.flatMap((c) => listaJSON(c.servicos)));
    semResponsavel = contratados.filter((s) => !cobertos.has(s));
  }

  return {
    ...identidadeCliente(cliente),
    servicosContratados: contratados,
    servicosSemResponsavel: semResponsavel,
    contatos: visiveis.map((c) => ({ nome: c.nome, cargo: c.cargo || '', telefone: c.telefone || '', servicos: listaJSON(c.servicos), escopo: c.escopo || 'loja', origemEmpresa: c.origemEmpresa, herdadoDoGrupo: c.doGrupo })),
  };
}

/**
 * Diretório GLOBAL de contatos (toda a carteira, achatado) — o que a tela
 * Contatos mostra. `buscar_contatos_cliente` só serve 1 cliente por vez, então
 * "quem é o João de algum cliente nosso" / "todos os contatos com cargo
 * Diretor" era impossível sem iterar a carteira inteira.
 */
function buscarContatos(repo, { nome, cargo, servico } = {}, ctx = {}) {
  const buscaNome = nome?.trim().toLowerCase();
  const buscaCargo = cargo?.trim().toLowerCase();

  const todos = [];
  for (const cliente of clientesDoMonitor(repo, ctx)) {
    for (const c of listaJSON(cliente.contatos)) {
      const servicosContato = listaJSON(c.servicos);
      if (buscaNome && !(c.nome || '').toLowerCase().includes(buscaNome)) continue;
      if (buscaCargo && !(c.cargo || '').toLowerCase().includes(buscaCargo)) continue;
      if (servico && servicosContato.length > 0 && !servicosContato.includes(servico)) continue;
      todos.push({ nome: c.nome, cargo: c.cargo || '', telefone: c.telefone || '', empresa: cliente.empresa, servicos: servicosContato, escopo: c.escopo || 'loja' });
    }
  }
  todos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  return { total: todos.length, contatos: todos.slice(0, 50) };
}

/**
 * Config crua de cadência (`Cadencias`) — sem isso o agente aplica a régua
 * (30 dias, peso de contato recente etc.) mas não consegue EXPLICAR a régua
 * quando perguntam "por que esse cliente conta como vencido".
 */
function buscarConfigCadencias(repo) {
  return lerCadencias(repo);
}

/** Mesmo cálculo do card "Vencendo" da Visão Geral (janela de 5 dias). */
function buscarVencendoTool(repo, { dias } = {}, ctx = {}) {
  const cadencias = lerCadencias(repo);
  // Teto de 60 dias: mesmo limite de `buscar_agenda_ceo`, evita o modelo pedir
  // "o ano inteiro" e a resposta virar uma lista enorme sem filtro nenhum.
  const janela = Math.min(Math.max(Number(dias) || 5, 1), 60);
  return buscarVencendo(clientesDoMonitor(repo, ctx), repo.get('Agenda'), repo.get('Acoes'), cadencias, new Date(), janela);
}

/** Mesmo cálculo do card "Cobertura" da Visão Geral (últimos 2 meses). */
function buscarCoberturaTool(repo, _argumentos, ctx = {}) {
  return buscarCobertura(clientesDoMonitor(repo, ctx), repo.get('Agenda'));
}

/** Mesmo cálculo do card "Cobertura por Serviço" da Visão Geral (relógio do serviço no prazo). */
function buscarCoberturaServicosTool(repo, _argumentos, ctx = {}) {
  return { servicos: buscarCoberturaServicos(clientesDoMonitor(repo, ctx), repo.get('Agenda'), repo.get('Acoes'), lerCadencias(repo)) };
}

/** Mesmo cálculo do card "Alertas de acompanhamento" da Visão Geral. */
function buscarAlertasTool(repo, _argumentos, ctx = {}) {
  return { alertas: buscarAlertasSemAcompanhamento(clientesDoMonitor(repo, ctx), repo.get('Agenda'), repo.get('Acoes')) };
}

function buscarFilaPriorizacao(repo, { servico } = {}, ctx = {}) {
  const clientes = clientesDoMonitor(repo, ctx);
  const agenda = repo.get('Agenda');
  const acoes = repo.get('Acoes');
  const cadencias = lerCadencias(repo);
  const resultado = calcularAderencia(clientes, agenda, acoes, cadencias, new Date(), { servico });
  return {
    servico: servico || 'Todos os serviços',
    ...resultado,
  };
}

/**
 * Confere conflito de monitor/sala ANTES de tentar criar — deixa o agente
 * propor um horário que já sabe que funciona, em vez de tentar às cegas e só
 * descobrir o conflito no erro de `criar_evento` (mesma lógica de
 * `conflitoAgenda`, reaproveitada).
 */
/**
 * Carga de agenda da SEMANA (seg-dom, mesma convenção de AgendaPage.tsx e
 * EventFormModal.tsx) por monitor — só informativo, nunca bloqueia (ao
 * contrário do conflito pontual acima). Item 2 do levantamento de gaps:
 * antes só existia aviso de conflito EXATO (mesmo dia+hora); nada dava
 * noção de carga da semana antes de tentar marcar um horário.
 */
function cargaSemanaPorMonitor(repo, date, monitores) {
  if (!monitores?.length) return [];
  const dataRef = parseISO(String(date).slice(0, 10));
  const inicio = startOfWeek(dataRef, { weekStartsOn: 1 });
  const fim = endOfWeek(dataRef, { weekStartsOn: 1 });
  const agenda = repo.get('Agenda').filter((a) =>
    /reuni/i.test(a.type || '') && !/cancel|reagend/i.test(a.status || '')
  );
  return monitores.map((m) => ({
    monitor: m,
    reunioesNaSemana: agenda.filter((a) => {
      const d = new Date(a.date);
      return listaJSON(a.monitores).includes(m) && d >= inicio && d <= fim;
    }).length,
  }));
}

function verificarDisponibilidade(repo, { date, time, monitores, sala }) {
  if (!date || !time) throw new Error('verificar_disponibilidade: "date" e "time" são obrigatórios.');
  const conflito = conflitoAgenda(repo, { type: 'Reunião', date, time, monitores, sala });
  const cargaSemana = cargaSemanaPorMonitor(repo, date, monitores);
  return conflito ? { disponivel: false, motivo: conflito, cargaSemana } : { disponivel: true, cargaSemana };
}

const FERRAMENTAS = [
  {
    name: 'buscar_clientes',
    description: 'Busca/lista clientes da carteira. Cada resultado traz um campo "ativo" (calculado) — é ESTE que responde "cliente ativo?"/"quantos clientes ativos?", nunca o "estado" sozinho: um cliente pode ter estado=Ativo e mesmo assim "ativo: false" se o status não for de atendimento (Suspenso/Atendido pelo Marco/Problemas Externos) ou se estiver em pausa temporária (pausadoAte). "estado" (Ativo/Inativo, o campo bruto do cadastro) e "status" (situação granular: Regular, Suspenso, Atendido pelo Marco, Gratuidade, Problemas Externos) continuam disponíveis como FILTROS separados, se precisar filtrar por um valor exato específico. Pra achar UM cliente pelo nome que o usuário falou, use "nome" (busca parcial, ignora acento e maiúscula) — é o caminho pra obter o clientId antes de qualquer ferramenta que peça clientId. Também filtra por nível de risco, status, serviço, grupo/rede ou local (segmento de negócio: Autopeça, Oficina, Distribuidora...). Um cliente com "grupo" é uma LOJA de uma rede — o nome da rede sozinho (ex.: "Altese") não é um cliente, use o filtro "grupo" pra achar todas as lojas dela de uma vez. Sem nenhum filtro, devolve a carteira inteira.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Trecho do nome do cliente/loja (ex.: "27 de setembro", "recreio"). Busca parcial, sem diferenciar acento/maiúscula.' },
        estado: { type: 'string', enum: ['Ativo', 'Inativo'], description: 'Filtra pelo campo bruto do cadastro (Ativo/Inativo). NÃO é o mesmo que "cliente ativo de verdade" — pra isso, olhe o campo "ativo" de cada resultado, não este filtro.' },
        nivelRisco: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
        status: { type: 'string' },
        servico: { type: 'string' },
        grupo: { type: 'string', description: 'Nome da rede/grupo (ex.: "Altese") — devolve todas as lojas dela.' },
        local: { type: 'string', description: 'Segmento de negócio do cliente, como cadastrado (ex.: "Autopeça", "Oficina", "Distribuidora"). Igualdade exata, ignora acento/maiúscula.' },
      },
    },
    executar: buscarClientes,
  },
  {
    name: 'reanalisar_cliente',
    escreve: true,
    description: 'Recalcula a análise de risco (nível, resumo e fatores) e o dossiê de UM cliente lendo as atas do zero. Use quando a ata foi escrita/corrigida DEPOIS da reunião e o dossiê ficou defasado — o caso mais comum, já que a ata costuma ser preenchida ao final — E TAMBÉM depois de corrigir_dossie_cliente, pra que resumo/fatores/nível da ficha do cliente deixem de mostrar o texto antigo (o retorno daquela ferramenta avisa isso em `analiseDesatualizada`). Custa uma chamada ao modelo por cliente: ofereça e rode só a pedido, um de cada vez, nunca a carteira toda.',
    parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
    executar: reanalisarCliente,
  },
  {
    name: 'buscar_opcoes_evento',
    description: 'Devolve os valores VÁLIDOS de monitor, serviço, sala, tipo de evento e tipo de lembrete, como estão cadastrados em Configurações. Use antes de criar evento/lembrete quando não tiver certeza do nome exato — o cadastro é editável, então não confie em memória.',
    parameters: { type: 'object', properties: {} },
    executar: buscarOpcoesEvento,
  },
  {
    name: 'buscar_memoria',
    description: 'Lista as regras gerais do processo que o usuário mandou você guardar (memória do sistema, não de um cliente). Essas regras já chegam no seu contexto automaticamente — use esta ferramenta só quando precisar do id de uma regra (pra remover) ou quando o usuário perguntar o que você tem guardado.',
    parameters: { type: 'object', properties: {} },
    executar: buscarMemoria,
  },
  {
    name: 'registrar_memoria',
    escreve: true,
    description: 'Guarda uma REGRA GERAL do processo/sistema, válida pra carteira inteira e não ligada a um cliente (ex.: "a ata da reunião só é preenchida ao final da reunião"). Use só depois de o usuário CONFIRMAR que quer guardar — ofereça antes. Para fato de UM cliente use corrigir_dossie_cliente, não isto. Uma frase por regra.',
    parameters: {
      type: 'object',
      properties: { texto: { type: 'string', description: 'A regra, em uma frase curta e afirmativa (máx. 400 caracteres).' } },
      required: ['texto'],
    },
    executar: registrarMemoria,
  },
  {
    name: 'remover_memoria',
    escreve: true,
    description: 'Apaga uma regra geral da memória do sistema. Só com pedido explícito do usuário. Use buscar_memoria antes para obter o id.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    executar: removerMemoria,
  },
  {
    name: 'buscar_dossie_cliente',
    description: 'Devolve o dossiê (memória acumulada de análises) e a última análise de risco de um cliente específico. `ultimaAnalise.fatores` é a JUSTIFICATIVA do nível de risco (os motivos que a análise registrou) e `ultimaAnalise.resumo` é o texto que aparece na ficha do cliente — se perguntarem por que o risco é alto/médio/baixo, a resposta está nesses campos; nunca diga que o critério não está explícito quando eles vierem preenchidos.',
    parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
    executar: buscarDossieCliente,
  },
  {
    name: 'buscar_historico_risco_cliente',
    description: 'Devolve a linha do tempo do nível de risco do cliente (todas as análises automáticas já geradas, mais antiga primeiro — geradoEm/nivelRisco/resumo de cada uma). Use quando perguntarem se um cliente está piorando/melhorando ao longo do tempo — buscar_dossie_cliente só traz o estado ATUAL, não histórico.',
    parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
    executar: buscarHistoricoRiscoCliente,
  },
  {
    name: 'buscar_registros_produto',
    description: 'Devolve os registros brutos de produto/situação (serviço Monitoria) e produto/margem (Precificação) das reuniões mais recentes de um cliente — use quando o usuário perguntar algo específico sobre produto, margem ou situação que o resumo do dossiê pode não detalhar (ex.: "o que foi precificado na última reunião da Gomec", "quais produtos caíram nos últimos meses").',
    parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
    executar: buscarRegistrosProduto,
  },
  {
    name: 'buscar_contatos_cliente',
    description: 'Devolve as pessoas de contato cadastradas de um cliente (nome, cargo, telefone) — use quando perguntarem quem é o contato, telefone, ou "com quem falar" nesse cliente.',
    parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
    executar: buscarContatosCliente,
  },
  {
    name: 'buscar_historico_eventos',
    description: 'Devolve o histórico de eventos da agenda de um cliente, mais recente primeiro — incluindo o TEXTO COMPLETO da ata de cada reunião (campo "ata", não um resumo), os arquivos anexados (campo "anexos") e o que ficou COMBINADO nela (campo "tarefas": responsável + ação + data). Use "tarefas" pra avaliar o que foi acordado e ainda não virou reunião/lembrete — mas NÃO afirme que uma tarefa foi ou não cumprida: o sistema não guarda isso; conclua a partir de eventos posteriores, lembretes existentes e do dossiê, e diga em que está se baseando. Use pra "quando foi a última reunião", "quantos eventos tivemos", "o que ficou combinado na ata de tal dia", "tem algum arquivo anexado nessa reunião", ou qualquer pergunta sobre histórico/conteúdo de agenda que buscar_dossie_cliente/buscar_registros_produto não cobrem.',
    parameters: {
      type: 'object',
      properties: { clientId: { type: 'string' }, limite: { type: 'number', description: 'Máximo de eventos, padrão e teto 15.' } },
      required: ['clientId'],
    },
    executar: buscarHistoricoEventos,
  },
  {
    name: 'buscar_fila_priorizacao',
    description: 'Mesmo cálculo do card "Aderência" da Visão Geral — pra "quantos % estão em dia", "quantos atrasados" etc. Sem "servico", conta todos os serviços contratados por cliente (contagem permissiva: 1 serviço em dia já basta); com "servico", olha só aquele (contagem estrita). Campos do resultado: "total" = clientes ativos considerados; "pct" = % em dia (pondera contato_recente pelo peso configurado, não é só emDia/total); "emDia" = cadência cumprida; "agendaMarcada" = atrasado mas já tem reunião futura marcada (não precisa de ação agora); "contatoRecente" = teve contato que ainda não resetou a cadência oficial mas já foi tratado; "precisaContato" = realmente precisa de ação, ninguém tratou.',
    parameters: {
      type: 'object',
      properties: { servico: { type: 'string', enum: ['Monitoria', 'Price'], description: 'Filtra por um serviço específico — omitir considera todos.' } },
    },
    executar: buscarFilaPriorizacao,
  },
  {
    name: 'buscar_vencendo',
    description: 'Mesmo cálculo do card "Vencendo" da Visão Geral — atendimentos com prazo de Monitoria (30 dias) ou Price (15 dias) vencendo dentro de "dias" (padrão 5, pode pedir qualquer janela até 60 — "semana que vem" é uns 12-14 dias a partir de hoje, calcule pelo dia da semana atual) e sem reunião futura marcada. Relatório não tem prazo próprio: relatório concluído com Monitoria zera a Monitoria. A lista é por SERVIÇO (um atendimento com 2 serviços vencendo aparece 2x).',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'number', description: 'Janela em dias a partir de hoje (padrão 5, máximo 60). Pra "semana que vem" calcule quantos dias faltam até o fim daquela semana.' },
      },
    },
    executar: buscarVencendoTool,
  },
  {
    name: 'buscar_cobertura',
    description: 'Mesmo cálculo do card "Cobertura" da Visão Geral — % de clientes ativos com pelo menos 1 reunião, relatório ou precificação CONCLUÍDO/REALIZADO nos últimos 2 meses (mês atual + anterior); agendado ainda não conta. Devolve também a lista de quem está sem contato.',
    parameters: { type: 'object', properties: {} },
    executar: buscarCoberturaTool,
  },
  {
    name: 'buscar_cobertura_servicos',
    description: 'Mesmo cálculo do card "Cobertura por Serviço" da Visão Geral — dos atendimentos que têm prazo de cada serviço (contratado e não independente), quantos estão no prazo (Monitoria 30 dias, Price 15 dias; só entrega concluída do serviço zera o prazo). "contrataram" = base com prazo. Diferente de buscar_cobertura (entrega concluída nos últimos 2 meses, sem olhar serviço). Devolve a lista de quem está fora do prazo.',
    parameters: { type: 'object', properties: {} },
    executar: buscarCoberturaServicosTool,
  },
  {
    name: 'buscar_alertas_acompanhamento',
    description: 'Mesmo cálculo do card "Alertas de acompanhamento" da Visão Geral — os 6 clientes ativos há mais tempo sem NENHUM contato/reunião/ação (30+ dias, ou nunca). Diferente de buscar_fila_priorizacao (que olha cadência por serviço contratado): aqui é qualquer forma de contato, de qualquer cliente ativo.',
    parameters: { type: 'object', properties: {} },
    executar: buscarAlertasTool,
  },
  {
    name: 'sugerir_encaixes_agenda',
    description: 'Sugere QUEM agendar primeiro e QUANDO — cruza a fila de cadência (quem está mais atrasado) com dias úteis, horários livres do monitor e teto de 2 reuniões/dia por monitor. Use pra "quem eu devo agendar essa semana", "onde encaixo os atrasados". NÃO cria nada: pra criar de fato, use criar_evento depois de confirmar com o usuário. Cliente que já tem reunião futura marcada não aparece.',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'number', description: 'Janela de dias úteis a considerar (padrão 10, máx 30).' },
        max: { type: 'number', description: 'Máximo de sugestões (padrão 8, máx 20).' },
      },
    },
    executar: sugerirEncaixesAgenda,
  },
  {
    name: 'buscar_agenda_ceo',
    description: 'Agenda PESSOAL do Marco (CEO) — Google Calendar, somente leitura. Use SÓ pra "o Marco tem horário livre em X", "o que tem na agenda DELE essa semana", especialmente combinado com sugerir_encaixes_agenda quando a reunião precisar dele. NÃO é a agenda da carteira de clientes — pra "quais reuniões eu tenho marcada"/"o que tenho essa semana" (do próprio monitor, com clientes), use buscar_proximas_reunioes. Devolve também quando foi a última sincronização (dado pode estar defasado).',
    parameters: { type: 'object', properties: { dias: { type: 'number', description: 'Janela de dias à frente (padrão 14, máx 60).' } } },
    executar: buscarAgendaCeo,
  },
  {
    name: 'buscar_proximas_reunioes',
    description: 'Próximos eventos da AGENDA DA CARTEIRA (reunião/contato/relatório/precificação, dos clientes do monitor) — nunca a agenda pessoal do Marco (isso é buscar_agenda_ceo). Use pra "quais reuniões eu tenho marcada", "o que tenho essa semana", "minha agenda dos próximos dias". Exclui eventos já concluídos/realizados e cancelados/reagendados — só o que ainda vai acontecer.',
    parameters: { type: 'object', properties: { dias: { type: 'number', description: 'Janela de dias à frente (padrão 14, máx 60).' } } },
    executar: buscarProximasReunioes,
  },
  {
    name: 'buscar_lembretes_cliente',
    description: 'Lembretes de um cliente. IMPORTANTE: consulte isto ANTES de usar criar_lembrete pro mesmo cliente — evita criar lembrete duplicado de algo que já está agendado. Por padrão só os ativos.',
    parameters: {
      type: 'object',
      properties: { clientId: { type: 'string' }, incluirConcluidos: { type: 'boolean', description: 'true inclui lembretes já concluídos (histórico).' } },
      required: ['clientId'],
    },
    executar: buscarLembretesCliente,
  },
  {
    name: 'buscar_tarefas_cliente',
    description: 'Tarefas internas (quadro Ágil/Kanban da 2D) vinculadas a um cliente — board, coluna/etapa, responsável, prazo e se está bloqueada. Use pra saber se já existe trabalho interno em andamento sobre esse cliente antes de sugerir ação, ou pra explicar por que algo está travado.',
    parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
    executar: buscarTarefasCliente,
  },
  {
    name: 'buscar_cobertura_contatos',
    description: 'Análise de LACUNA de contato de um cliente: quais serviços contratados NÃO têm ninguém responsável entre os contatos (inclui contatos herdados de outras lojas da mesma rede). Diferente de buscar_contatos_cliente, que só lista os contatos sem analisar cobertura.',
    parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
    executar: buscarCoberturaContatos,
  },
  {
    name: 'buscar_contatos',
    description: 'Diretório GLOBAL de contatos de toda a carteira, com filtro por nome, cargo ou serviço. Use quando a pergunta não é sobre um cliente específico (ex.: "quem é o João?", "todos os contatos de Precificação", "tem algum Diretor Financeiro na carteira?") — pra um cliente específico, use buscar_contatos_cliente.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Busca parcial por nome.' },
        cargo: { type: 'string', description: 'Busca parcial por cargo.' },
        servico: { type: 'string', description: 'Só contatos que atendem esse serviço (contato sem serviço marcado é geral e sempre entra).' },
      },
    },
    executar: buscarContatos,
  },
  {
    name: 'buscar_config_cadencias',
    description: 'Devolve a configuração de cadência da carteira (monitoria_dias, price_dias, recontato_dias etc.) — use pra EXPLICAR a régua aplicada ("por que esse cliente está vencido?", "de quantos em quantos dias é a monitoria?"), não pra calcular métrica (isso é buscar_fila_priorizacao e afins).',
    parameters: { type: 'object', properties: {} },
    executar: buscarConfigCadencias,
  },
  {
    name: 'verificar_disponibilidade',
    description: 'Confere se um monitor ou sala está livre num dia/horário ANTES de tentar criar_evento — evita propor um horário que já sabe que vai dar conflito. Devolve também "cargaSemana" (quantas Reuniões cada monitor já tem na mesma semana, seg-dom) — informativo, não impede nada; mencione se for alto antes de sugerir mais uma reunião naquela semana.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data (dia) ISO 8601.' },
        time: { type: 'string', description: 'Hora local HH:mm.' },
        monitores: { type: 'array', items: { type: 'string' } },
        sala: { type: 'string' },
      },
      required: ['date', 'time'],
    },
    executar: verificarDisponibilidade,
  },
  {
    name: 'corrigir_dossie_cliente',
    escreve: true,
    description: 'Atualiza o dossiê (memória de longo prazo) de um cliente — em dois casos: (1) o usuário aponta que uma informação está errada/desatualizada, ou (2) o usuário CONFIRMA que quer registrar um fato novo mencionado na conversa (você deve OFERECER antes, nunca chamar direto). Não use para opinião, reformulação de estilo, ou fato que o usuário não confirmou querer salvar — pergunta/hipótese não é fato. Antes de chamar, consulte buscar_dossie_cliente, aplique só a mudança indicada e reescreva o dossiê INTEIRO respeitando as mesmas 5 seções do template original (Perfil, Pontos de Atenção, Oportunidades, Pendências, Próxima pauta) — o resto do conteúdo deve continuar igual.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        dossie: {
          type: 'string',
          description: `Corpo completo do dossiê já corrigido, em markdown, seguindo exatamente este template (mesmos títulos de seção, nesta ordem). NÃO inclua o cabeçalho com o nome do cliente nem a linha "Nível de risco" — mesmo que buscar_dossie_cliente devolva o dossiê com esse cabeçalho, comece sua resposta direto em "### Perfil"; o cabeçalho é adicionado automaticamente pelo sistema:\n\n${TEMPLATE_DOSSIE}`,
        },
      },
      required: ['clientId', 'dossie'],
    },
    executar: corrigirDossie,
  },
  {
    name: 'redigir_ata_reuniao',
    escreve: true,
    description: 'Redige (ou re-redige) o conteúdo da ata de UMA reunião já existente (identificada por eventId), a partir do resumo/transcrição/pauta/Registro da Monitoria já gravados nela — mesmo motor do botão "Gerar ata com IA" da tela do evento. Use quando o usuário pedir uma ata nova, uma versão personalizada/editada (passe o pedido em instrucaoPersonalizada, ex.: "foca no financeiro", "deixa mais curto"), ou apontar um erro no que já foi redigido. NUNCA passe salvar=true sem o usuário ter CONFIRMADO que quer essa versão valendo — por padrão só mostre o rascunho na conversa e pergunte se quer salvar.',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Id do evento (reunião) na Agenda.' },
        instrucaoPersonalizada: { type: 'string', description: 'Pedido livre do usuário sobre como a ata deve ficar (opcional) — ex.: "resuma mais", "foca só nos pontos financeiros".' },
        salvar: { type: 'boolean', description: 'true só depois do usuário confirmar que quer gravar esta versão no evento. Omitido/false = só rascunho, nada é salvo.' },
      },
      required: ['eventId'],
    },
    executar: redigirAtaReuniao,
  },
  {
    name: 'gerar_ata_pdf',
    escreve: true,
    description: 'Gera o PDF da ata de uma reunião (mesmo layout com a marca 2D Consultores do botão que já existe na tela do evento) e devolve o campo "url" pra abrir/baixar no navegador. Na sua resposta, apresente esse link em markdown EXATAMENTE como "[Abrir ata em PDF](url)" (ou texto parecido) — é o único formato de link que a tela do chat reconhece e transforma num botão clicável; a URL crua sem esse formato aparece como texto sem função. Lê a ata JÁ GRAVADA no evento — se o usuário quiser o PDF de uma redação ainda não salva, chame antes redigir_ata_reuniao com salvar=true. NUNCA passe anexar=true sem perguntar antes se o usuário quer a ata anexada à reunião — por padrão só devolva o link.',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Id do evento (reunião) na Agenda.' },
        anexar: { type: 'boolean', description: 'true só depois do usuário confirmar que quer o PDF salvo como anexo da reunião. Omitido/false = só devolve o link, sem anexar.' },
      },
      required: ['eventId'],
    },
    executar: gerarAtaPdfFerramenta,
  },
  {
    name: 'criar_evento',
    escreve: true,
    description: 'Cria um evento na agenda de um cliente (reunião, contato, relatório ou ligação). PREENCHA servicos, monitores e sala com o que o usuário disse — deixar em branco vira reunião sem dono e sem serviço na tela dele. Os valores válidos são os do cadastro (chegam no seu contexto e também em buscar_opcoes_evento); usar um nome parcial ou inventado devolve erro com a lista, não grava errado.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        type: { type: 'string', description: 'Reunião | Contato | Relatório | Ligação' },
        date: { type: 'string', description: 'Data (dia) ISO 8601 — a hora vai no campo "time" separado, não aqui.' },
        time: { type: 'string', description: 'Hora local HH:mm (ex.: "14:30"). Sem isso, uma Reunião é criada sem checagem de conflito de horário.' },
        subject: { type: 'string' },
        description: { type: 'string' },
        servicos: { type: 'array', items: { type: 'string' }, description: 'Serviços tratados no evento, exatamente como cadastrados (ex.: "Monitoria"). OBRIGATÓRIO em todo tipo, inclusive contato e ligação — só pode omitir quando o cliente contrata um único serviço (ou para Precificação/Relatório, que têm serviço definido pelo tipo); se o cliente tem Monitoria e Price, pergunte ao usuário.' },
        monitores: { type: 'array', items: { type: 'string' }, description: 'Nome COMPLETO do monitor, como cadastrado (ex.: "Erick Cardoso", não "Erick").' },
        sala: { type: 'string', description: 'Sala, como cadastrada.' },
        status: { type: 'string', description: 'Status do evento, como cadastrado (ex.: "Agendado", "Pendente"). Padrão "Agendado". Se o usuário pedir um status que não existe no cadastro, a ferramenta erra com a lista válida — NÃO diga que criou com esse status.' },
      },
      required: ['clientId', 'type', 'date'],
    },
    executar: criarEvento,
  },
  {
    name: 'atualizar_evento',
    escreve: true,
    description: 'Altera campos de um evento JÁ EXISTENTE da agenda (data, hora, duração, tipo, status, assunto, descrição, resumo, sala, serviços, monitores). Só mexe no que você informar — o resto fica como está. Use quando o usuário pedir pra corrigir/completar uma reunião (ex.: "põe o monitor Erick e serviço Precificação nessa agenda"). Pegue o `eventId` em buscar_historico_eventos. GRAVA DADO: só chame depois de o usuário confirmar o que deve mudar.',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Id do evento (campo "id" de buscar_historico_eventos).' },
        date: { type: 'string', description: 'Nova data (dia) — a hora vai em "time".' },
        time: { type: 'string', description: 'Nova hora local HH:mm. String vazia limpa a hora.' },
        duracao: { type: 'number', description: 'Duração em minutos.' },
        type: { type: 'string', description: 'Tipo, como cadastrado.' },
        status: { type: 'string', description: 'Status, como cadastrado. Status inexistente devolve erro com a lista válida.' },
        subject: { type: 'string' },
        description: { type: 'string' },
        resumo: { type: 'string' },
        sala: { type: 'string', description: 'Sala, como cadastrada. String vazia limpa a sala.' },
        servicos: { type: 'array', items: { type: 'string' } },
        monitores: { type: 'array', items: { type: 'string' }, description: 'Nome COMPLETO do monitor, como cadastrado.' },
      },
      required: ['eventId'],
    },
    executar: atualizarEvento,
  },
  {
    name: 'atualizar_cliente',
    escreve: true,
    description: 'Altera o CADASTRO de um cliente (monitor, status, estado Ativo/Inativo, local/segmento, linha, serviços contratados, observação, endereço, grupo, pausa temporária). Só mexe no que você informar. NÃO cria nem exclui cliente — isso continua sendo feito na tela. GRAVA DADO: só chame depois de o usuário confirmar.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        monitor: { type: 'string', description: 'Nome COMPLETO do monitor, como cadastrado. String vazia remove o monitor.' },
        status: { type: 'string', description: 'Status do cliente, como cadastrado (ex.: "Regular", "Suspenso").' },
        estado: { type: 'string', description: 'Ativo | Inativo — liga/desliga o cliente das contas de cadência e do dashboard.' },
        local: { type: 'string', description: 'Segmento (Autopeça, Oficina, ...), como cadastrado.' },
        linha: { type: 'string', description: 'Linha de produto (Leve, Pesada, Geral), como cadastrada.' },
        servicos: { type: 'array', items: { type: 'string' }, description: 'Serviços contratados, como cadastrados. Substitui a lista inteira.' },
        observacao: { type: 'string' },
        endereco: { type: 'string' },
        grupo: { type: 'string', description: 'Grupo/rede do cliente (análise segmentada).' },
        pausadoAte: {
          type: 'string',
          description: 'Pausa temporária: data AAAA-MM-DD até quando o cliente sai da fila de cadência (inclui o dia inteiro, volta sozinho no dia seguinte — sem precisar mudar status/estado). Envie null pra RETOMAR o cliente antes da data (limpa pausadoAte e motivoPausa).',
        },
        motivoPausa: { type: 'string', description: 'Motivo curto da pausa (ex.: "Obra fechada até outubro"). Só faz sentido junto de pausadoAte.' },
      },
      required: ['clientId'],
    },
    executar: atualizarCliente,
  },
  {
    name: 'registrar_acao',
    escreve: true,
    description: 'Registra uma Ação (Contato/Reunião/Relatório/Price) do cliente — já REALIZADA (data hoje ou passado) ou PROGRAMADA (data futura). Pra ação realizada, "resultado" diferencia "sucesso" (conseguiu falar/entregar — conta como toque de cadência, o cliente sai de vencido) de "sem_sucesso" (tentou e não conseguiu: ligou e não atendeu, mandou mensagem sem resposta — NÃO conta como toque, o cliente continua vencido na fila, só fica registrado que já houve tentativa). Nunca registre uma tentativa falha como "sucesso" só pra "resolver" a pendência — é exatamente o erro que esse campo existe pra evitar. GRAVA DADO: só chame depois de o usuário confirmar.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        tipo: { type: 'string', enum: ['contato', 'reuniao', 'relatorio', 'price'] },
        data: { type: 'string', description: 'AAAA-MM-DD. Ausente = hoje.' },
        resultado: { type: 'string', enum: ['sucesso', 'sem_sucesso'], description: 'Só pra ação já realizada (data hoje/passado). Ignorado se "data" for futura (vira status "programado" automaticamente).' },
        servico: { type: 'string', description: 'Serviço a que a ação se refere, como cadastrado (ex.: "Monitoria").' },
        monitor: { type: 'string', description: 'Monitor responsável, como cadastrado.' },
        notes: { type: 'string' },
      },
      required: ['clientId', 'tipo'],
    },
    executar: registrarAcao,
  },
  {
    name: 'criar_lembrete',
    escreve: true,
    description: 'Cria um lembrete, opcionalmente vinculado a um cliente.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        title: { type: 'string' },
        datetime: { type: 'string', description: 'Data/hora ISO 8601.' },
        description: { type: 'string' },
        type: { type: 'string', description: 'Tipo do lembrete, como cadastrado (ex.: "Reunião", "Contato"). Veja buscar_opcoes_evento se não tiver certeza.' },
      },
      required: ['title', 'datetime'],
    },
    executar: criarLembrete,
  },
  {
    name: 'buscar_fatos_alvos',
    description: 'Dados de VENDA do cliente (Dados Alvos) no escopo das reuniões: para cada produto ou cliente final que já foi pautado numa reunião, o que a receita e a quantidade fizeram depois. Use quando o usuário perguntar se o que foi combinado deu resultado, quais produtos/clientes estão em queda, ou ao recomendar pauta. Se "estado" não for "ok", NÃO invente números: diga o motivo (falta vincular a loja, ou os dados ainda não foram carregados). Quando "veredicto" for "indicativo_parcial", o mês em curso está incompleto — não afirme que o cliente parou de comprar.',
    parameters: {
      type: 'object',
      properties: { clientId: { type: 'string', description: 'ID do cliente da carteira.' } },
      required: ['clientId'],
    },
    executar: buscarFatosAlvos,
  },
  {
    name: 'buscar_resumo_vendas_alvos',
    description: 'Dados de VENDA gerais do cliente (Dados Alvos), por mês/ano: receita total, quantidade e quantos clientes finais distintos compraram em cada período. Sem interpretação nenhuma — use pra responder "quanto ele vendeu em [mês]", "a receita está subindo ou caindo", "quantos clientes ele tem". Pra saber se um combinado específico de reunião deu resultado, use buscar_fatos_alvos, não esta. Se "estado" não for "ok", diga o motivo em vez de inventar número.',
    parameters: {
      type: 'object',
      properties: { clientId: { type: 'string', description: 'ID do cliente da carteira.' } },
      required: ['clientId'],
    },
    executar: buscarResumoVendasAlvos,
  },
  {
    name: 'buscar_analise_estrategica_alvos',
    description: 'Análises estratégicas de venda do cliente (Dados Alvos), no mesmo padrão do relatório que o analisador da 2D já gera: produtos em queda persistente (3+ meses seguidos), clientes finais em erosão contra o próprio pico, clientes que praticamente pararam de comprar, e poder de compra (potencial vs. desempenho recente). Use pra perguntas tipo "o que está em queda", "quais clientes estão sumindo", "ele está comprando dentro do potencial dele". O mês em curso nunca entra nessas contas — não afirme nada sobre "este mês" com base nisso. Se "estado" não for "ok", diga o motivo em vez de inventar número.',
    parameters: {
      type: 'object',
      properties: { clientId: { type: 'string', description: 'ID do cliente da carteira.' } },
      required: ['clientId'],
    },
    executar: buscarAnaliseEstrategicaAlvos,
  },
  {
    name: 'definir_status_acompanhamento',
    escreve: true,
    description: 'Registra o que o usuário decidiu sobre um acompanhamento de produto/cliente final: "em_curso" (segue tentando), "abandonado" (desistiu dessa abordagem) ou "resolvido". É isso que faz o alerta parar de aparecer. Use só depois de o usuário DECIDIR — não decida por ele. O nome da entidade tem de ser exatamente o que veio em buscar_fatos_alvos.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'ID do cliente da carteira.' },
        entidade: { type: 'string', description: 'Nome exato do produto ou do cliente final, como veio em buscar_fatos_alvos.' },
        tipo: { type: 'string', description: '"produto" ou "cliente" (cliente final da loja). Padrão: produto.' },
        status: { type: 'string', description: 'em_curso | abandonado | resolvido' },
        nota: { type: 'string', description: 'Motivo da decisão, em uma frase (opcional, máx. 300 caracteres).' },
      },
      required: ['clientId', 'entidade', 'status'],
    },
    executar: definirStatusAcompanhamento,
  },
  {
    name: 'buscar_fichas_clientes_finais',
    description: 'Lista a ficha já registrada dos clientes finais desta loja: tags (Alerta, Inadimplente, Cliente Balcão, Encerrou operação — vocabulário compartilhado do Ecossistema) e grupo de importância (G1/G2/G3). Devolve também quais tags e grupos existem pra usar. Consulte antes de responder sobre situação de cliente final e antes de gravar com definir_ficha_cliente_final.',
    parameters: {
      type: 'object',
      properties: { clientId: { type: 'string', description: 'ID do cliente da carteira.' } },
      required: ['clientId'],
    },
    executar: buscarFichasClientesFinais,
  },
  {
    name: 'definir_ficha_cliente_final',
    escreve: true,
    description: 'Grava tags e/ou grupo (G1/G2/G3) de um cliente final desta loja. Escopado por loja — o mesmo nome pode ter ficha diferente em outra loja sua. Use só depois de o usuário INFORMAR/DECIDIR — não conclua sozinho a partir de queda de compra. Tags e grupos válidos vêm de buscar_fichas_clientes_finais; o nome do cliente final tem de ser exatamente o que veio em buscar_fatos_alvos.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'ID do cliente da carteira.' },
        clienteFinal: { type: 'string', description: 'Nome exato do cliente final, como veio em buscar_fatos_alvos.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Ids de tag (ex.: ["inadimplente","alerta"]). Lista vazia limpa as tags. Omita pra não mexer nas tags atuais.' },
        grupo: { type: 'string', description: 'Grupo de importância (ex.: "G1 (Grupo 1)"). Vazio limpa o grupo. Omita pra não mexer no grupo atual.' },
        observacao: { type: 'string', description: 'Contexto, em uma frase (opcional, máx. 300 caracteres).' },
      },
      required: ['clientId', 'clienteFinal'],
    },
    executar: definirFichaClienteFinal,
  },
  {
    name: 'gerar_relatorio_executivo',
    description: 'Gera um panorama executivo da carteira: quantos clientes em cada nível de risco e a pauta sugerida para os clientes em risco alto. NÃO cobre cadência/aderência de reunião ("% em dia", "quantos atrasados") — pra isso use buscar_fila_priorizacao.',
    parameters: { type: 'object', properties: {} },
    executar: gerarRelatorioExecutivo,
  },
  {
    name: 'explicar_conceito_carteira',
    description: 'Explica um conceito/regra de negócio da Carteira (ex.: o que é "cliente ativo" de verdade, diferença entre atendimento e cliente, como funciona cadência, diferença entre Cobertura e Saúde da Carteira, como o risco é calculado, diferença entre ação sem sucesso e concluída, pausa temporária, segmento vs linha) SEMPRE que o usuário perguntar "o que significa"/"qual a diferença"/"como funciona" sobre a carteira — NUNCA responda uma pergunta conceitual de memória própria, ela já causou erro real (confundir "estado" do cadastro com "cliente ativo de verdade"). A explicação já vem com números reais da carteira do usuário, não é só teoria.',
    parameters: {
      type: 'object',
      properties: {
        conceito: { type: 'string', enum: Object.keys(CONCEITOS), description: 'Qual conceito explicar.' },
        pergunta: { type: 'string', description: 'A pergunta original do usuário, como veio, pra dar contexto à explicação.' },
      },
      required: ['conceito', 'pergunta'],
    },
    executar: explicarConceitoCarteira,
  },
];

// `lerCadencias` exportado pra `alertas.cjs` usar a MESMA leitura de cadência
// (seed + overrides) — duas versões disso na base seriam duas verdades sobre
// quando um cliente vence.
module.exports = { FERRAMENTAS, lerCadencias, opcoesDe, resolverOpcao };
