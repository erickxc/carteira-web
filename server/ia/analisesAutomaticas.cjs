const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { repoPlanilha } = require('../dominio/repo.cjs');
const { DOSSIES_DIR } = require('../config.cjs');
const { gerarAnaliseIA, DOSSIE_MAX_CHARS } = require('./analiseCliente.cjs');

// Mesmos regexes de classificação de status já usados no resto do projeto
// (ver CLAUDE.md — "Evento de Agenda"): concluído/cancelado/reagendado, e
// agora também AGENDADO (pedido do usuário: marcar uma reunião nova também
// deve atualizar o dossiê — é justamente o sinal de que uma "próxima pauta"
// sugerida virou ação, ver `server/ia/alertas.cjs`, "Pauta recomendada que
// morreu"). `agend` sozinho já cobre "Agendado" E "Reagendado" (substring).
const EVENTO_RELEVANTE = /conclu|realiz|cancel|agend/i;

// Nome do arquivo carrega o clientId (chave estável, usada na busca) e um
// slug do nome da loja (só para o arquivo ficar legível no disco). Se a loja
// for renomeada, `salvarDossieCliente` apaga o arquivo antigo e recria com o
// slug novo — a busca em `lerDossieCliente` é por prefixo do clientId, não
// pelo nome, então uma renomeação nunca "perde" o dossiê anterior.
function slugify(texto) {
  return (
    String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'cliente'
  );
}

function caminhoDossieCliente(clientId, empresa) {
  return path.join(DOSSIES_DIR, `${clientId}--${slugify(empresa)}.md`);
}

function arquivoDossieExistente(clientId) {
  try {
    return fs.readdirSync(DOSSIES_DIR).find((f) => f.startsWith(`${clientId}--`));
  } catch {
    return null;
  }
}

function lerDossieCliente(clientId) {
  const arquivo = arquivoDossieExistente(clientId);
  if (!arquivo) return '';
  try {
    return fs.readFileSync(path.join(DOSSIES_DIR, arquivo), 'utf8');
  } catch {
    return '';
  }
}

function salvarDossieCliente(clientId, empresa, texto) {
  const antigo = arquivoDossieExistente(clientId);
  if (antigo) fs.unlinkSync(path.join(DOSSIES_DIR, antigo));
  fs.writeFileSync(caminhoDossieCliente(clientId, empresa), texto ?? '', 'utf8');
}

const RISCO_LABEL = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' };

/**
 * Cabeçalho fixo do dossiê (nome/risco/data), montado por código em vez de
 * pedido ao modelo — mais confiável que confiar no LLM pra formatar isso
 * igual toda vez. O modelo só devolve o corpo (as seções), ver
 * `analiseCliente.montarPrompt`.
 */
function montarDossieCompleto({ empresa, nivelRisco, corpo, dataISO }) {
  const data = new Date(dataISO).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `## ${empresa}\n**Nível de risco:** ${RISCO_LABEL[nivelRisco] ?? nivelRisco} | **Atualizado em:** ${data}\n\n${corpo.trim()}\n`;
}

/**
 * Correção manual do dossiê, disparada pelo agente de chat (`tools.cjs`,
 * ferramenta `corrigir_dossie_cliente`) quando o usuário aponta um erro na
 * conversa. Não passa pelo modelo de novo — o corpo corrigido já vem pronto
 * do agente, isso aqui só monta o cabeçalho e grava, igual à análise
 * automática. Mesmo teto de tamanho (`DOSSIE_MAX_CHARS`) da análise
 * automática, pelo mesmo motivo: sem isso uma correção mal-intencionada ou
 * repetida poderia inflar o arquivo sem limite.
 */
// O prompt já instrui o modelo a não incluir o cabeçalho no corpo — isso é
// rede de segurança pro caso de o agente colar de volta o cabeçalho que leu
// via buscar_dossie_cliente (aconteceu num teste manual). Sem isso, o
// cabeçalho fica duplicado a cada correção.
function removerCabecalhoSeVier(corpo) {
  return corpo.replace(/^##\s.*\n\*\*Nível de risco:.*\n+/i, '');
}

function corrigirDossieCliente({ clientId, empresa, nivelRisco, corpoNovo }) {
  let corpo = removerCabecalhoSeVier(corpoNovo.trim());
  if (corpo.length > DOSSIE_MAX_CHARS) {
    console.warn(`corrigirDossieCliente: correção para "${empresa}" excedeu ${DOSSIE_MAX_CHARS} caracteres (${corpo.length}) — truncando.`);
    corpo = corpo.slice(0, DOSSIE_MAX_CHARS).trim();
  }
  const dossieCompleto = montarDossieCompleto({ empresa, nivelRisco, corpo, dataISO: new Date().toISOString() });
  salvarDossieCliente(clientId, empresa, dossieCompleto);
  return dossieCompleto;
}

/**
 * Garante que todo cliente com reunião nova (concluída/cancelada/reagendada)
 * desde a última rodada tenha uma `AnaliseIA` atualizada. Chamada pelo cron
 * semanal e 1x no boot do servidor (mesmo padrão de
 * `relatoriosAutomaticos.gerarRelatoriosPendentes`) — erros por cliente são
 * isolados (logados, não interrompem os demais).
 *
 * Recebe `repo` injetável (padrão `repoPlanilha()`) para ser testável com
 * `repoMemoria()` sem tocar no banco real. `opts.apenasClientId` restringe a
 * 1 cliente — mesmo padrão de `relatoriosAutomaticos.gerarRelatoriosPendentes`,
 * útil pra validar o fluxo manualmente sem rodar a carteira inteira.
 */
/**
 * Impressão digital do conteúdo de uma ata. Curta de propósito: o que importa
 * é detectar MUDANÇA, não guardar o texto (que já vive na Agenda).
 */
function hashAta(texto) {
  return crypto.createHash('sha1').update(String(texto ?? '')).digest('hex').slice(0, 12);
}

/** `{ eventoId: hashDaAta }` dos eventos relevantes de um cliente. */
function assinaturaAtas(eventos) {
  const mapa = {};
  for (const ev of eventos) mapa[String(ev.id)] = hashAta(ev.ata);
  return mapa;
}

/**
 * Eventos que a análise ainda não viu NO ESTADO ATUAL: novos, ou já conhecidos
 * porém com a ata mudada desde a última rodada (preenchida depois da reunião,
 * corrigida, complementada).
 */
function eventosParaAnalisar(eventosRelevantes, analiseAnterior) {
  const desde = analiseAnterior?.ultimoEventoAnalisadoData ? new Date(analiseAnterior.ultimoEventoAnalisadoData) : null;
  const jaLidas = analiseAnterior?.atasAnalisadas ?? null;

  return eventosRelevantes.filter((ev) => {
    if (!desde || new Date(ev.date) > desde) return true;
    // Sem mapa (análise anterior ao campo existir): não reprocessa o passado
    // inteiro sozinho — seria uma enxurrada de chamadas ao modelo sem ninguém
    // pedir. O backlog é resolvido sob demanda (`apenasClientId`).
    if (!jaLidas) return false;
    return jaLidas[String(ev.id)] !== hashAta(ev.ata);
  });
}

async function gerarAnalisesPendentes(opts = {}) {
  const repo = opts.repo || repoPlanilha();
  const apenasClientId = opts.apenasClientId;
  const clientes = repo.get('Clientes');
  const agenda = repo.get('Agenda');
  const analises = repo.get('AnalisesIA');
  let processados = 0;

  for (const cliente of clientes) {
    try {
      if (apenasClientId && String(cliente.id) !== String(apenasClientId)) continue;
      const analiseAnterior = analises.find((a) => String(a.clientId) === String(cliente.id));
      const desde = analiseAnterior?.ultimoEventoAnalisadoData ? new Date(analiseAnterior.ultimoEventoAnalisadoData) : null;

      const eventosRelevantes = agenda
        .filter((a) => String(a.clientId) === String(cliente.id))
        .filter((a) => EVENTO_RELEVANTE.test(a.status || ''))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      // `forcar` (usado pelo "reanalisar este cliente") ignora o que já foi
      // lido e reprocessa o histórico relevante inteiro — é como se recupera
      // uma ata escrita depois, sem esperar um evento novo.
      const eventosNovos = opts.forcar ? eventosRelevantes : eventosParaAnalisar(eventosRelevantes, analiseAnterior);

      if (eventosNovos.length === 0) continue;

      const dossieAnterior = lerDossieCliente(cliente.id);
      const resultado = await gerarAnaliseIA({ cliente, eventosNovos, dossieAnterior, ollama: opts.ollama, repo });

      // Data do evento mais recente CONHECIDO (não só dos reprocessados): se
      // a reanálise foi disparada por uma ata antiga, manter a data do evento
      // antigo faria toda rodada seguinte reprocessar os eventos no meio.
      const ultimoEventoAnalisadoData = eventosRelevantes[eventosRelevantes.length - 1].date;
      const dossieCompleto = montarDossieCompleto({
        empresa: cliente.empresa,
        nivelRisco: resultado.nivelRisco,
        corpo: resultado.dossieAtualizado,
        dataISO: ultimoEventoAnalisadoData,
      });
      salvarDossieCliente(cliente.id, cliente.empresa, dossieCompleto);

      const novaLinha = {
        id: crypto.randomUUID(),
        clientId: cliente.id,
        nivelRisco: resultado.nivelRisco,
        resumo: resultado.resumo,
        fatores: resultado.fatores,
        sugestaoProximaPauta: resultado.sugestaoProximaPauta,
        ultimoEventoAnalisadoData,
        atasAnalisadas: assinaturaAtas(eventosRelevantes),
        geradoEm: new Date().toISOString(),
      };

      const semAnalisesAntigas = analises.filter((a) => String(a.clientId) !== String(cliente.id));
      analises.length = 0;
      analises.push(...semAnalisesAntigas, novaLinha);
      processados++;
    } catch (err) {
      console.warn(`gerarAnalisesPendentes: falha para o cliente "${cliente && cliente.empresa}":`, err.message);
    }
  }

  if (processados > 0) repo.save('AnalisesIA', analises);
  return processados;
}

module.exports = { gerarAnalisesPendentes, lerDossieCliente, corrigirDossieCliente, eventosParaAnalisar, assinaturaAtas, hashAta, EVENTO_RELEVANTE };
