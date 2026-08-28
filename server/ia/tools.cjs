const { executarMutacao } = require('../fila/mutacao.cjs');
const { lerDossieCliente, corrigirDossieCliente } = require('./analisesAutomaticas.cjs');
const { TEMPLATE_DOSSIE } = require('./analiseCliente.cjs');
const {
  calcularAderencia, listaJSON, buscarVencendo, buscarCobertura, buscarCoberturaServicos, buscarAlertasSemAcompanhamento,
} = require('../dominio/cadenciaServico.cjs');
const { sugerirAgenda } = require('../dominio/sugestaoAgenda.cjs');
const { getCache: getCacheCeoAgenda } = require('../ceoAgenda.cjs');
const { CADENCIAS_SEED } = require('../config.cjs');
const { isClient } = require('../modo.cjs');
const memoriaIADominio = require('../dominio/memoriaIA.cjs');

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

const resolverLista = (repo, tipo, valores, campo) => (valores ?? []).map((v) => resolverOpcao(repo, tipo, v, campo));

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
  return { empresa: cliente.empresa, grupo, loja };
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

  return {
    estado: cliente.estado || null,
    status: cliente.status || null,
    servicosIndependentes: listaJSON(cliente.servicosIndependentes),
    proximoEvento: futuros[0] ? { date: futuros[0].date, type: futuros[0].type } : null,
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

function buscarClientes(repo, { nome, estado, nivelRisco, status, servico, grupo } = {}) {
  const clientes = repo.get('Clientes');
  const analises = repo.get('AnalisesIA');
  const analisePorCliente = new Map(analises.map((a) => [String(a.clientId), a]));
  const grupoBusca = normalizar(grupo);
  const nomeBusca = normalizar(nome);

  return clientes
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
    // Nome casa contra `empresa` (que já inclui a rede quando há: "Rede - Loja"),
    // então funciona tanto pra "27 de setembro" quanto pra "recreio" ou
    // "altese recreio".
    .filter(({ cliente }) => !nomeBusca || normalizar(cliente.empresa).includes(nomeBusca))
    .map(({ cliente, analise }) => ({
      id: cliente.id,
      ...identidadeCliente(cliente),
      status: cliente.status,
      estado: cliente.estado || null,
      nivelRisco: analise?.nivelRisco ?? null,
    }));
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
function buscarOpcoesEvento(repo) {
  return {
    monitor: opcoesDe(repo, 'monitor'),
    servico: opcoesDe(repo, 'servico'),
    sala: opcoesDe(repo, 'sala'),
    tipo_evento: opcoesDe(repo, 'tipo_evento'),
    tipo_lembrete: opcoesDe(repo, 'tipo_lembrete'),
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
      date: a.date, type: a.type, status: a.status,
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

  return { ok: true, empresa: cliente.empresa };
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

function criarEvento(repo, args) {
  const { clientId, date, time, subject, description } = args;
  if (!clientId || !args.type || !date) throw new Error('criar_evento: "clientId", "type" e "date" são obrigatórios.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`criar_evento: cliente "${clientId}" não encontrado.`);

  // Tudo que é opção de cadastro passa por `resolverOpcao` ANTES de gravar —
  // ver o comentário lá sobre o "Erick" que virou campo vazio na tela.
  const type = resolverOpcao(repo, 'tipo_evento', args.type, 'criar_evento: type');
  const servicos = resolverLista(repo, 'servico', args.servicos, 'criar_evento: servicos');
  const monitores = resolverLista(repo, 'monitor', args.monitores, 'criar_evento: monitores');
  const sala = args.sala ? resolverOpcao(repo, 'sala', args.sala, 'criar_evento: sala') : args.sala;

  // `date` só carrega o DIA (meia-noite UTC, placeholder) — a hora real é o
  // campo `time` (HH:mm), sempre separado, mesma convenção do resto do app
  // (ver CLAUDE.md, "Cuidado com datas type=date"). Sem `time`, Reunião ainda
  // pode ser criada, só não dá pra checar conflito de horário.
  const conflito = conflitoAgenda(repo, { type, date, time, monitores, sala });
  if (conflito) throw new Error(`criar_evento: conflito de agenda — ${conflito}`);

  return executarMutacao('agenda', 'create', {
    payload: {
      clientId, clientName: cliente.empresa, type, date, time,
      subject: subject || '', description: description || '',
      servicos: servicos || [], monitores: monitores || [], sala: sala || undefined,
      status: 'Agendado', checklist: [], attachments: [],
      createdAt: new Date().toISOString(),
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

function gerarRelatorioExecutivo(repo) {
  const clientes = repo.get('Clientes');
  const analises = repo.get('AnalisesIA');
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
      date: a.date, time: a.time || null, type: a.type, status: a.status,
      subject: a.subject || '', resumo: a.resumo || '',
      // TEXTO COMPLETO da ata — não é resumo nem indicador de existência.
      // Ver GATILHO ATA em normas.cjs: já houve resposta afirmando não ter
      // acesso a isso quando o campo estava aqui o tempo todo.
      ata: a.ata || '',
      // Arquivos anexados à reunião (PDF, planilha, foto do que foi discutido
      // etc.) — `url` é caminho relativo à raiz do app, servido estaticamente.
      anexos: listaJSON(a.attachments).map((x) => ({ nome: x.originalName || x.filename, url: `/uploads/${x.filename}` })),
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
function sugerirEncaixesAgenda(repo, { dias, max } = {}) {
  const sugestoes = sugerirAgenda(repo.get('Clientes'), repo.get('Agenda'), repo.get('Acoes'), lerCadencias(repo), {
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
      responsavel: t.responsavel || null,
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
function buscarContatos(repo, { nome, cargo, servico } = {}) {
  const buscaNome = nome?.trim().toLowerCase();
  const buscaCargo = cargo?.trim().toLowerCase();

  const todos = [];
  for (const cliente of repo.get('Clientes')) {
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
function buscarVencendoTool(repo, { dias } = {}) {
  const cadencias = lerCadencias(repo);
  // Teto de 60 dias: mesmo limite de `buscar_agenda_ceo`, evita o modelo pedir
  // "o ano inteiro" e a resposta virar uma lista enorme sem filtro nenhum.
  const janela = Math.min(Math.max(Number(dias) || 5, 1), 60);
  return buscarVencendo(repo.get('Clientes'), repo.get('Agenda'), cadencias, new Date(), janela);
}

/** Mesmo cálculo do card "Cobertura" da Visão Geral (últimos 2 meses). */
function buscarCoberturaTool(repo) {
  return buscarCobertura(repo.get('Clientes'), repo.get('Agenda'));
}

/** Mesmo cálculo do card "Serviços" da Visão Geral (últimos 30 dias). */
function buscarCoberturaServicosTool(repo) {
  return { servicos: buscarCoberturaServicos(repo.get('Clientes'), repo.get('Agenda')) };
}

/** Mesmo cálculo do card "Alertas de acompanhamento" da Visão Geral. */
function buscarAlertasTool(repo) {
  return { alertas: buscarAlertasSemAcompanhamento(repo.get('Clientes'), repo.get('Agenda'), repo.get('Acoes')) };
}

function buscarFilaPriorizacao(repo, { servico } = {}) {
  const clientes = repo.get('Clientes');
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
function verificarDisponibilidade(repo, { date, time, monitores, sala }) {
  if (!date || !time) throw new Error('verificar_disponibilidade: "date" e "time" são obrigatórios.');
  const conflito = conflitoAgenda(repo, { type: 'Reunião', date, time, monitores, sala });
  return conflito ? { disponivel: false, motivo: conflito } : { disponivel: true };
}

const FERRAMENTAS = [
  {
    name: 'buscar_clientes',
    description: 'Busca/lista clientes da carteira. ATENÇÃO aos dois campos de situação: "estado" é Ativo/Inativo; "status" é a situação granular (Regular, Suspenso, Atendido pelo Marco, Gratuidade, Problemas Externos). "Cliente ativo" = estado, nunca status. Pra achar UM cliente pelo nome que o usuário falou, use "nome" (busca parcial, ignora acento e maiúscula) — é o caminho pra obter o clientId antes de qualquer ferramenta que peça clientId. Também filtra por nível de risco, status, serviço ou grupo/rede. Um cliente com "grupo" é uma LOJA de uma rede — o nome da rede sozinho (ex.: "Altese") não é um cliente, use o filtro "grupo" pra achar todas as lojas dela de uma vez. Sem nenhum filtro, devolve a carteira inteira.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Trecho do nome do cliente/loja (ex.: "27 de setembro", "recreio"). Busca parcial, sem diferenciar acento/maiúscula.' },
        estado: { type: 'string', enum: ['Ativo', 'Inativo'], description: 'Liga/desliga o cliente das contas de cadência. É ESTE o campo de "cliente ativo/inativo" — não confundir com "status".' },
        nivelRisco: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
        status: { type: 'string' },
        servico: { type: 'string' },
        grupo: { type: 'string', description: 'Nome da rede/grupo (ex.: "Altese") — devolve todas as lojas dela.' },
      },
    },
    executar: buscarClientes,
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
    description: 'Apaga uma regra geral da memória do sistema. Só com pedido explícito do usuário. Use buscar_memoria antes para obter o id.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    executar: removerMemoria,
  },
  {
    name: 'buscar_dossie_cliente',
    description: 'Devolve o dossiê (memória acumulada de análises) e a última análise de risco de um cliente específico.',
    parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
    executar: buscarDossieCliente,
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
    description: 'Devolve o histórico de eventos da agenda de um cliente, mais recente primeiro — incluindo o TEXTO COMPLETO da ata de cada reunião (campo "ata", não um resumo) e os arquivos anexados a ela (campo "anexos", com nome e link). Use pra "quando foi a última reunião", "quantos eventos tivemos", "o que ficou combinado na ata de tal dia", "tem algum arquivo anexado nessa reunião", ou qualquer pergunta sobre histórico/conteúdo de agenda que buscar_dossie_cliente/buscar_registros_produto não cobrem.',
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
    description: 'Mesmo cálculo do card "Vencendo" da Visão Geral — clientes com cadência de Monitoria/Price/Relatório vencendo dentro de "dias" (padrão 5, pode pedir qualquer janela até 60 — "semana que vem" é uns 12-14 dias a partir de hoje, calcule pelo dia da semana atual). Diferente de buscar_fila_priorizacao: aqui todo cliente ativo ganha um relógio de Relatório também, e a lista é por SERVIÇO (um cliente com 2 serviços vencendo aparece 2x).',
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
    description: 'Mesmo cálculo do card "Cobertura" da Visão Geral — % de clientes ativos com pelo menos 1 reunião ou relatório REALIZADO nos últimos 2 meses (mês atual + anterior). Devolve também a lista de quem está sem contato.',
    parameters: { type: 'object', properties: {} },
    executar: buscarCoberturaTool,
  },
  {
    name: 'buscar_cobertura_servicos',
    description: 'Mesmo cálculo do card "Serviços" da Visão Geral — dos clientes que CONTRATARAM cada serviço (Monitoria/Price), quantos % foram atendidos nos últimos 30 dias. Diferente de buscar_cobertura (que olha qualquer contato recente): aqui é por serviço contratado especificamente. Devolve a lista de quem contratou e não foi atendido.',
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
    description: 'Agenda do Marco (CEO) — Google Calendar, somente leitura. Use pra "o Marco tem horário livre em X", "o que tem na agenda dele essa semana", especialmente combinado com sugerir_encaixes_agenda quando a reunião precisar dele. Devolve também quando foi a última sincronização (dado pode estar defasado).',
    parameters: { type: 'object', properties: { dias: { type: 'number', description: 'Janela de dias à frente (padrão 14, máx 60).' } } },
    executar: buscarAgendaCeo,
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
    description: 'Devolve a configuração de cadência da carteira (monitoria_dias, price_dias, relatorio_dias, recontato_dias, peso_contato_recente etc.) — use pra EXPLICAR a régua aplicada ("por que esse cliente está vencido?", "de quantos em quantos dias é a monitoria?"), não pra calcular métrica (isso é buscar_fila_priorizacao e afins).',
    parameters: { type: 'object', properties: {} },
    executar: buscarConfigCadencias,
  },
  {
    name: 'verificar_disponibilidade',
    description: 'Confere se um monitor ou sala está livre num dia/horário ANTES de tentar criar_evento — evita propor um horário que já sabe que vai dar conflito.',
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
    name: 'criar_evento',
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
        servicos: { type: 'array', items: { type: 'string' }, description: 'Serviços tratados no evento, exatamente como cadastrados (ex.: "Monitoria").' },
        monitores: { type: 'array', items: { type: 'string' }, description: 'Nome COMPLETO do monitor, como cadastrado (ex.: "Erick Cardoso", não "Erick").' },
        sala: { type: 'string', description: 'Sala, como cadastrada.' },
      },
      required: ['clientId', 'type', 'date'],
    },
    executar: criarEvento,
  },
  {
    name: 'criar_lembrete',
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
    name: 'gerar_relatorio_executivo',
    description: 'Gera um panorama executivo da carteira: quantos clientes em cada nível de risco e a pauta sugerida para os clientes em risco alto. NÃO cobre cadência/aderência de reunião ("% em dia", "quantos atrasados") — pra isso use buscar_fila_priorizacao.',
    parameters: { type: 'object', properties: {} },
    executar: gerarRelatorioExecutivo,
  },
];

// `lerCadencias` exportado pra `alertas.cjs` usar a MESMA leitura de cadência
// (seed + overrides) — duas versões disso na base seriam duas verdades sobre
// quando um cliente vence.
module.exports = { FERRAMENTAS, lerCadencias, opcoesDe, resolverOpcao };
