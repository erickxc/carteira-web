const { executarMutacao } = require('../fila/mutacao.cjs');
const { lerDossieCliente, corrigirDossieCliente } = require('./analisesAutomaticas.cjs');
const { TEMPLATE_DOSSIE } = require('./analiseCliente.cjs');
const {
  calcularAderencia, listaJSON, buscarVencendo, buscarCobertura, buscarCoberturaServicos, buscarAlertasSemAcompanhamento,
} = require('../dominio/cadenciaServico.cjs');
const { sugerirAgenda } = require('../dominio/sugestaoAgenda.cjs');
const { getCache: getCacheCeoAgenda } = require('../ceoAgenda.cjs');
const { CADENCIAS_SEED } = require('../config.cjs');

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

function buscarClientes(repo, { nome, nivelRisco, status, servico, grupo } = {}) {
  const clientes = repo.get('Clientes');
  const analises = repo.get('AnalisesIA');
  const analisePorCliente = new Map(analises.map((a) => [String(a.clientId), a]));
  const grupoBusca = normalizar(grupo);
  const nomeBusca = normalizar(nome);

  return clientes
    .map((c) => ({ cliente: c, analise: analisePorCliente.get(String(c.id)) }))
    .filter(({ cliente }) => !status || cliente.status === status)
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
function corrigirDossie(repo, { clientId, dossie }) {
  if (!clientId || !dossie) throw new Error('corrigir_dossie_cliente: "clientId" e "dossie" são obrigatórios.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`corrigir_dossie_cliente: cliente "${clientId}" não encontrado.`);
  const analise = repo.get('AnalisesIA').find((a) => String(a.clientId) === String(clientId));
  corrigirDossieCliente({ clientId, empresa: cliente.empresa, nivelRisco: analise?.nivelRisco ?? 'baixo', corpoNovo: dossie });
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
  const { clientId, type, date, time, subject, description, servicos, monitores, sala } = args;
  if (!clientId || !type || !date) throw new Error('criar_evento: "clientId", "type" e "date" são obrigatórios.');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(clientId));
  if (!cliente) throw new Error(`criar_evento: cliente "${clientId}" não encontrado.`);

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
  const { clientId, title, datetime, description, type } = args;
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
      subject: a.subject || '', resumo: a.resumo || '', ata: a.ata || '',
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
function buscarVencendoTool(repo) {
  const cadencias = lerCadencias(repo);
  return buscarVencendo(repo.get('Clientes'), repo.get('Agenda'), cadencias);
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
    description: 'Busca/lista clientes da carteira. Pra achar UM cliente pelo nome que o usuário falou, use "nome" (busca parcial, ignora acento e maiúscula) — é o caminho pra obter o clientId antes de qualquer ferramenta que peça clientId. Também filtra por nível de risco, status, serviço ou grupo/rede. Um cliente com "grupo" é uma LOJA de uma rede — o nome da rede sozinho (ex.: "Altese") não é um cliente, use o filtro "grupo" pra achar todas as lojas dela de uma vez. Sem nenhum filtro, devolve a carteira inteira.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Trecho do nome do cliente/loja (ex.: "27 de setembro", "recreio"). Busca parcial, sem diferenciar acento/maiúscula.' },
        nivelRisco: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
        status: { type: 'string' },
        servico: { type: 'string' },
        grupo: { type: 'string', description: 'Nome da rede/grupo (ex.: "Altese") — devolve todas as lojas dela.' },
      },
    },
    executar: buscarClientes,
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
    description: 'Devolve o histórico bruto de eventos da agenda de um cliente (reuniões, contatos, relatórios — com ata/resumo), mais recente primeiro. Use pra "quando foi a última reunião", "quantos eventos tivemos", ou qualquer pergunta sobre histórico de agenda que buscar_dossie_cliente/buscar_registros_produto não cobrem.',
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
    description: 'Mesmo cálculo do card "Vencendo" da Visão Geral — clientes com cadência de Monitoria/Price/Relatório vencendo nos próximos 5 dias (ainda dentro do prazo, mas perto). Diferente de buscar_fila_priorizacao: aqui todo cliente ativo ganha um relógio de Relatório também, e a lista é por SERVIÇO (um cliente com 2 serviços vencendo aparece 2x).',
    parameters: { type: 'object', properties: {} },
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
    description: 'Cria um evento na agenda de um cliente (reunião, contato, relatório ou ligação).',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        type: { type: 'string', description: 'Reunião | Contato | Relatório | Ligação' },
        date: { type: 'string', description: 'Data (dia) ISO 8601 — a hora vai no campo "time" separado, não aqui.' },
        time: { type: 'string', description: 'Hora local HH:mm (ex.: "14:30"). Sem isso, uma Reunião é criada sem checagem de conflito de horário.' },
        subject: { type: 'string' },
        description: { type: 'string' },
        servicos: { type: 'array', items: { type: 'string' } },
        monitores: { type: 'array', items: { type: 'string' } },
        sala: { type: 'string' },
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
        type: { type: 'string' },
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

module.exports = { FERRAMENTAS };
