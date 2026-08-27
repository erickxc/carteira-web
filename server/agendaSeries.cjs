const crypto = require('crypto');
const { repoPlanilha } = require('./dominio/repo.cjs');
const { datasNoIntervalo, parseDataLocal } = require('./regraRecorrencia.cjs');
const { gravarReuniaoJson } = require('./reunioesJson.cjs');

/**
 * Materialização de séries recorrentes de agenda — mesmo padrão de
 * `relatoriosAutomaticos.cjs` (regra guardada + geração incremental por
 * cron/boot/on-demand), generalizado para qualquer tipo de evento recorrente
 * (Reunião, Contato, Relatório, Ligação), não só Relatório por cliente.
 *
 * Antes, o formulário de evento pedia "quantas vezes por mês × durante quantos
 * meses" e criava TODOS os eventos (até 744) de uma vez, num laço sequencial de
 * requisições. Agora o formulário só salva a REGRA (aberta) e um job cria as
 * ocorrências do mês corrente conforme ele vai passando.
 */

function parseJSON(raw, fallback) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  return fallback;
}

const ehAtiva = (s) => s.ativo === true || s.ativo === 'true' || s.ativo === 1 || s.ativo === '1';

function fimDoMes(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Desloca `alvo` (hora do evento) pelo offset (mesmo vocabulário do form: 1h/1d/2d/7d antes). */
function aplicarOffsetLembrete(dataEvento, horaEvento, offset) {
  const [h, m] = (horaEvento || '09:00').split(':').map(Number);
  const base = new Date(dataEvento);
  base.setHours(isNaN(h) ? 9 : h, isNaN(m) ? 0 : m, 0, 0);
  const MS = { '1h': 3600e3, '1d': 86400e3, '2d': 2 * 86400e3, '7d': 7 * 86400e3 };
  const delta = MS[offset];
  return delta ? new Date(base.getTime() - delta) : (offset === 'none' ? null : base);
}

function criarEventoDaSerie(serie, data) {
  const agora = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: agora,
    clientId: serie.clientId,
    clientName: serie.clientName || '',
    type: serie.type,
    subject: serie.subject || '',
    date: data.toISOString(),
    time: serie.time || '',
    duracao: serie.duracao || undefined,
    description: '',
    status: 'Agendado',
    monitores: JSON.stringify(parseJSON(serie.monitores, [])),
    servicos: JSON.stringify(parseJSON(serie.servicos, [])),
    sala: serie.sala || undefined,
    checklist: JSON.stringify([]),
    preAnalise: JSON.stringify({ orientacoes: [], clientesGeral: '', produtosGeral: '' }),
    ata: '',
    resumo: '',
    attachments: JSON.stringify([]),
    serie: serie.id,
  };
}

/**
 * Materializa as ocorrências de UMA série dentro da janela [inicio, fim].
 * Idempotente: nunca cria duas vezes o mesmo dia da mesma série (checa pelas
 * linhas de Agenda já gravadas com `serie === serie.id`).
 */
function materializarSerie(serie, agenda, lembretesSheet, janelaInicio, janelaFim) {
  const regra = parseJSON(serie.regra, null);
  if (!regra) return { criados: 0 };

  // `serie.inicio` é "yyyy-MM-dd" (data pura) — mesmo cuidado de fuso do preview.
  const inicioSerie = serie.inicio ? parseDataLocal(serie.inicio) : janelaInicio;
  const de = inicioSerie > janelaInicio ? inicioSerie : janelaInicio;
  if (de > janelaFim) return { criados: 0 };

  const datas = datasNoIntervalo(regra, de, janelaFim);
  if (datas.length === 0) return { criados: 0 };

  const jaExistentes = new Set(
    agenda
      .filter((a) => String(a.serie) === String(serie.id))
      .map((a) => { const d = new Date(a.date); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })
  );

  const lembretesOffsets = parseJSON(serie.lembretes, []);
  let criados = 0;
  for (const data of datas) {
    const chave = `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
    if (jaExistentes.has(chave)) continue;

    const novoEvento = criarEventoDaSerie(serie, data);
    agenda.push(novoEvento);
    gravarReuniaoJson(novoEvento);
    criados++;

    for (const offset of lembretesOffsets) {
      const alvo = aplicarOffsetLembrete(data, serie.time, offset);
      if (!alvo) continue;
      lembretesSheet.push({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title: `${serie.type}${serie.subject ? ': ' + serie.subject : ''}`,
        datetime: alvo.toISOString(),
        description: '',
        status: 'ativo',
        clientId: serie.clientId,
        eventId: novoEvento.id,
        recurrence: 'none',
        type: serie.type,
      });
    }
  }
  return { criados };
}

/**
 * Materializa TODAS as séries ativas para o mês corrente. Chamada no boot,
 * 1x/dia (cobre a máquina ter ficado desligada na virada do mês) e sob demanda
 * ao criar/editar uma série.
 *
 * Recebe `repo` (padrão `repoPlanilha()`, a planilha real) em vez de chamar
 * `getSheetData`/`saveSheetData` direto — mesma abstração usada pelos módulos
 * `dominio/*`, o que permite testar com `repoMemoria()` sem tocar no arquivo
 * real e mantém o caminho aberto pro overlay do cliente remoto (ver
 * `dominio/repo.cjs`).
 */
function materializarTudo(opts = {}) {
  const repo = opts.repo || repoPlanilha();
  const agora = opts.agora || new Date();
  const apenasSerieId = opts.apenasSerieId;
  const series = repo.get('AgendaSeries').filter(ehAtiva);
  const agenda = repo.get('Agenda');
  const lembretesSheet = repo.get('Lembretes');

  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMes = fimDoMes(agora);

  let totalCriados = 0;
  for (const serie of series) {
    if (apenasSerieId && String(serie.id) !== String(apenasSerieId)) continue;
    try {
      const { criados } = materializarSerie(serie, agenda, lembretesSheet, inicioMes, fimMes);
      totalCriados += criados;
    } catch (err) {
      console.warn(`materializarTudo: falha na série "${serie.subject || serie.type}" (${serie.id}):`, err.message);
    }
  }

  if (totalCriados > 0) {
    repo.save('Agenda', agenda);
    repo.save('Lembretes', lembretesSheet);
  }
  return totalCriados;
}

module.exports = { materializarTudo, materializarSerie, parseJSON };
