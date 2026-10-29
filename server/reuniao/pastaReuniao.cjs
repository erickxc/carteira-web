// Pasta temporária da reunião: o que o agente de investigação (Claude CLI) lê
// durante a conversa. Fica dentro da pasta da sessão (SQLITE_DIR, nunca
// OneDrive) e é apagada ao encerrar; o boot apaga as que sobraram de queda.
const fs = require('fs');
const path = require('path');

const NOME = 'pasta-cliente';
const MAX_ATAS = 5;

// Só cache válido: ler o parquet frio leva ~40 s e, síncrono, travava o servidor
// inteiro no início da reunião. O cache frio é aquecido por `completarAlvos`.
function alvosReais() {
  const consulta = require('../alvos/consulta.cjs');
  return {
    analise: (c) => consulta.analiseEstrategicaDoCliente(c),
    resumo: (c) => consulta.resumoGeralDoCliente(c),
    aquecer: (c) => consulta.aquecerClienteAsync(c.id),
  };
}

const dataBr = (iso) => String(iso ?? '').slice(0, 10).split('-').reverse().join('/');

function criarPastaReuniao({ repo, evento, pastaSessao, alvos = alvosReais(), lerDossie }) {
  const pasta = path.join(pastaSessao, NOME);
  fs.mkdirSync(pasta, { recursive: true });
  const escrever = (nome, texto) => fs.writeFileSync(path.join(pasta, nome), texto, 'utf8');
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(evento?.clientId));

  escrever('pauta.md', [
    `# ${evento?.subject ?? 'Reunião'}`,
    cliente ? `Cliente: ${cliente.empresa}` : 'Reunião sem cliente vinculado.',
    evento?.date ? `Data: ${dataBr(evento.date)}` : '',
    '', evento?.description ?? '',
  ].join('\n'));
  escrever('transcricao.txt', '');
  if (!cliente) return pasta;

  let dossie = null;
  try { dossie = (lerDossie ?? require('../ia/analisesAutomaticas.cjs').lerDossieCliente)(cliente.id); } catch { dossie = null; }
  escrever('dossie.md', dossie || '(sem dossiê para este cliente)');

  const analise = repo.get('AnalisesIA').find((a) => String(a.clientId) === String(cliente.id));
  escrever('analise.md', analise ? `Risco: ${analise.nivelRisco ?? '?'}\n\n${analise.resumo ?? ''}` : '(sem análise)');

  const atas = repo.get('Agenda')
    .filter((e) => String(e.clientId) === String(cliente.id) && String(e.id) !== String(evento.id) && String(e.ata ?? '').trim())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX_ATAS);
  escrever('atas-anteriores.md', atas.length
    ? atas.map((e) => `## ${dataBr(e.date)} — ${e.subject ?? ''}\n\n${e.ata}`).join('\n\n')
    : '(nenhuma ata anterior)');

  escreverAlvos(pasta, cliente, alvos);
  return pasta;
}

// Alvos lê arquivo grande do OneDrive: falha ou estado diferente de "ok"
// simplesmente não gera o arquivo — o agente não deve achar número que não existe.
function escreverAlvos(pasta, cliente, alvos) {
  try {
    const c = { id: cliente.id, empresa: cliente.empresa };
    const analiseEstrategica = alvos.analise(c);
    const resumoVendas = alvos.resumo(c);
    if (analiseEstrategica?.estado === 'ok' || resumoVendas?.estado === 'ok') {
      fs.writeFileSync(path.join(pasta, 'alvos.json'), JSON.stringify({ analiseEstrategica, resumoVendas }, null, 2), 'utf8');
    }
  } catch { /* sem Alvos nesta reunião */ }
}

/** Aquece o cache do cliente em segundo plano e regrava `alvos.json` com os números. */
async function completarAlvos({ repo, evento, pastaSessao, alvos = alvosReais() }) {
  const cliente = repo.get('Clientes').find((c) => String(c.id) === String(evento?.clientId));
  const pasta = path.join(pastaSessao, NOME);
  if (!cliente || !alvos.aquecer || fs.existsSync(path.join(pasta, 'alvos.json'))) return;
  await alvos.aquecer({ id: cliente.id, empresa: cliente.empresa });
  if (fs.existsSync(pasta)) escreverAlvos(pasta, cliente, alvos); // reunião pode ter acabado
}

function atualizarTranscricaoNaPasta(pasta, texto) {
  fs.writeFileSync(path.join(pasta, 'transcricao.txt'), texto, 'utf8');
}

function apagarPastaReuniao(pastaSessao) {
  fs.rmSync(path.join(pastaSessao, NOME), { recursive: true, force: true });
}

function limparPastasOrfas(raizReunioes, sessaoAtivaId) {
  if (!fs.existsSync(raizReunioes)) return;
  for (const id of fs.readdirSync(raizReunioes)) {
    if (id !== sessaoAtivaId) apagarPastaReuniao(path.join(raizReunioes, id));
  }
}

module.exports = { criarPastaReuniao, completarAlvos, atualizarTranscricaoNaPasta, apagarPastaReuniao, limparPastasOrfas };
