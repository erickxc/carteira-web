// Uma reunião por máquina: liga fonte de áudio → transcritor (Python) →
// checagem de insights (3 min) → investigação → ata no fim. Estado em memória:
// a sessão vive enquanto o backend desta máquina vive (queda = pasta órfã,
// limpa no boot; o áudio fica para não perder a reunião).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { lerSegmentos, descartarEco, rotular, formatarTranscricao } = require('./transcricao.cjs');
const { listaJSON } = require('../../shared/cadenciaServico.cjs');

const CHECAGEM_MS = 3 * 60_000;
const SILENCIO_MS = 5 * 60_000;
const MAXIMO_MS = 3 * 60 * 60_000;
const ESPERA_TRANSCRITOR_MS = 10 * 60_000;
const PASSO_MS = 10_000;

let atual = null;

function erroStatus(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

function depsReais() {
  const { SQLITE_DIR, PORT } = require('../config.cjs');
  const { dirMotor, pythonDoMotor } = require('./motor.cjs');
  const provider = require('../ia/provider.cjs');
  return {
    raiz: path.join(SQLITE_DIR, 'reunioes'),
    agora: () => Date.now(),
    spawnTranscritor: ({ pasta, vocabArquivo, threads }) => spawn(pythonDoMotor(),
      [path.join(__dirname, 'transcritor.py'), '--pasta', pasta, '--vocab', vocabArquivo, '--threads', String(threads)],
      { env: { ...process.env, HF_HOME: path.join(dirMotor(), 'hf'), PYTHONIOENCODING: 'utf-8' }, windowsHide: true, stdio: 'ignore' }),
    iniciarFonte: require('./fonteSimulada.cjs').iniciarFonteSimulada,
    finalizar: require('./finalizar.cjs').finalizarReuniao,
    criarCicloInsights: require('./insights.cjs').criarCicloInsights,
    criarPastaReuniao: require('./pastaReuniao.cjs').criarPastaReuniao,
    vocabulario: require('./vocabulario.cjs').vocabularioDoEvento,
    notificar: require('./notificacaoReuniao.cjs').notificarReuniao,
    llm: provider.clienteLLM(),
    investigar: provider.investigador(),
    urlBase: process.env.CARTEIRA_URL_LOCAL || `http://carteira-2d.localhost:${PORT}`,
    intervaloMs: PASSO_MS,
  };
}

function iniciarSessao({ repo, eventId, simularArquivo, velocidade = 1, deps: injetadas }) {
  if (atual && (atual.fase === 'ouvindo' || atual.fase === 'finalizando')) throw erroStatus(409, 'Já existe uma reunião em andamento nesta máquina.');
  const evento = repo.get('Agenda').find((e) => String(e.id) === String(eventId));
  if (!evento) throw erroStatus(404, 'Evento não encontrado.');

  const deps = { ...(injetadas ? {} : depsReais()), ...injetadas };
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(evento.clientId));
  const nome = cliente?.empresa ?? evento.subject ?? 'reunião';
  const link = deps.urlBase ? `${deps.urlBase}/agenda?evento=${encodeURIComponent(eventId)}` : undefined;
  const id = crypto.randomUUID();
  const pasta = path.join(deps.raiz, id);
  fs.mkdirSync(pasta, { recursive: true });

  const vocabArquivo = path.join(pasta, 'vocabulario.txt');
  fs.writeFileSync(vocabArquivo, deps.vocabulario(repo, evento), 'utf8');
  const pastaCliente = deps.criarPastaReuniao({ repo, evento, pastaSessao: pasta });

  const notificar = (n) => deps.notificar({ titulo: n.titulo, texto: n.mensagem ?? n.texto, acao: n.acao, fontes: n.fontes, link });
  let investigador = null;
  const ciclo = deps.criarCicloInsights({
    repo, evento, llm: deps.llm, notificar, agora: deps.agora,
    aoInvestigar: (item) => investigador?.pedir(item),
  });
  if (deps.investigar) {
    const { criarInvestigador } = require('./investigacao.cjs');
    investigador = criarInvestigador({ cwd: pastaCliente, repo, investigar: deps.investigar, aoConcluir: (i) => ciclo.adicionar(i) });
  }

  atual = {
    id, eventId, pasta, pastaCliente, nome, link, deps, repo, ciclo,
    nomeMonitor: listaJSON(evento.monitores)[0] || 'Monitor',
    fase: 'ouvindo', erro: null,
    inicio: deps.agora(), ultimaChecagem: deps.agora(), ultimoSegmentoEm: null,
    segmentosVistos: 0, segmentosChecados: 0,
    transcritor: deps.spawnTranscritor({ pasta, vocabArquivo, threads: Math.max(2, Math.floor(os.cpus().length / 2)) }),
    fonte: deps.iniciarFonte({ arquivo: simularArquivo, pasta, velocidade: Number(velocidade) || 1 }),
    timer: null, finalizacao: null,
  };
  if (deps.intervaloMs) atual.timer = setInterval(() => { passo().catch((err) => console.warn(`reunião: ${err.message}`)); }, deps.intervaloMs);
  return estadoSessao();
}

async function passo() {
  const s = atual;
  if (!s || s.fase !== 'ouvindo') return;
  const agora = s.deps.agora();
  const segs = lerSegmentos(s.pasta);
  if (segs.length > s.segmentosVistos) {
    s.segmentosVistos = segs.length;
    s.ultimoSegmentoEm = agora;
  }

  if (agora - s.ultimaChecagem >= CHECAGEM_MS) {
    s.ultimaChecagem = agora;
    const novos = segs.slice(s.segmentosChecados);
    s.segmentosChecados = segs.length;
    try {
      require('./pastaReuniao.cjs').atualizarTranscricaoNaPasta(s.pastaCliente, formatarTranscricao(rotular(descartarEco(segs), s.nomeMonitor)));
    } catch { /* pasta do cliente é apoio; sem ela a reunião segue */ }
    await s.ciclo.rodar(formatarTranscricao(rotular(descartarEco(novos), s.nomeMonitor)));
  }
  s.ciclo.despachar();

  const silencio = s.ultimoSegmentoEm !== null && agora - s.ultimoSegmentoEm >= SILENCIO_MS;
  if (silencio || agora - s.inicio >= MAXIMO_MS) encerrarSessao();
}

function esperarTranscritor(pasta) {
  const limite = Date.now() + ESPERA_TRANSCRITOR_MS;
  return new Promise((ok) => {
    const t = setInterval(() => {
      if (fs.existsSync(path.join(pasta, 'transcritor.fim')) || Date.now() > limite) { clearInterval(t); ok(); }
    }, 500);
  });
}

function encerrarSessao() {
  const s = atual;
  if (!s || s.fase !== 'ouvindo') throw erroStatus(409, 'Não há reunião sendo ouvida nesta máquina.');
  s.fase = 'finalizando';
  if (s.timer) clearInterval(s.timer);
  try { s.fonte?.parar(); } catch { /* fonte já terminou */ }
  fs.writeFileSync(path.join(s.pasta, 'PARAR'), '');

  s.finalizacao = (async () => {
    await esperarTranscritor(s.pasta);
    try { s.transcritor?.kill?.(); } catch { /* já saiu */ }
    const r = await s.deps.finalizar({ repo: s.repo, eventId: s.eventId, pasta: s.pasta, insights: s.ciclo.enviados(), nomeMonitor: s.nomeMonitor });
    try { require('./pastaReuniao.cjs').apagarPastaReuniao(s.pasta); } catch { /* limpa no próximo boot */ }
    if (r.ok) {
      s.fase = 'concluida';
      s.deps.notificar({ titulo: `Ata pronta · ${s.nome}`, texto: 'A ata da reunião foi gravada no evento, com a transcrição anexada. Revise antes de concluir.', link: s.link });
    } else {
      s.fase = 'erro';
      s.erro = r.erro;
      s.deps.notificar({ titulo: `Ata não gerada · ${s.nome}`, texto: `A transcrição foi salva no evento, mas a ata falhou: ${r.erro}`, link: s.link });
    }
  })().catch((err) => { s.fase = 'erro'; s.erro = err.message; });
  return estadoSessao();
}

function estadoSessao() {
  const s = atual;
  if (!s) return { ativa: false, fase: null };
  const agora = s.deps.agora();
  return {
    ativa: s.fase === 'ouvindo' || s.fase === 'finalizando',
    fase: s.fase, eventId: s.eventId, erro: s.erro,
    minutos: Math.floor((agora - s.inicio) / 60_000),
    insights: s.ciclo.enviados().length,
  };
}

module.exports = {
  iniciarSessao, encerrarSessao, estadoSessao, passo,
  // para testes
  _pastaAtual: () => atual?.pasta,
  _finalizacao: () => atual?.finalizacao,
};
