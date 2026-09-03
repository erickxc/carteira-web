/**
 * Bateria de prompts contra o monitorIA, com a base ISOLADA.
 *
 * Por que isolada: o chat tem 11 ferramentas de ESCRITA (criar_evento,
 * atualizar_cliente, corrigir_dossie_cliente, registrar_memoria...). Rodar
 * dezenas de prompts contra a base real criaria reunião, editaria cadastro e
 * reescreveria dossiê de produção — inaceitável num teste. Aqui o script
 * copia SQLite + dossiês pra uma pasta temporária, sobe uma SEGUNDA instância
 * do backend apontada pra ela (porta própria) e conversa com essa. Qualquer
 * escrita do agente cai na cópia.
 *
 * Isolar as DUAS variáveis (`SQLITE_DIR` e `ONEDRIVE_ROOT`) é obrigatório —
 * ver CLAUDE.md: só `SQLITE_DIR` deixaria o backup/mirror escrevendo no
 * OneDrive real, e só `ONEDRIVE_ROOT` deixaria a escrita no banco real.
 *
 * O que cada caso verifica: (1) a resposta não quebrou; (2) padrões que
 * DEVEM aparecer; (3) padrões PROIBIDOS (as regressões que já aconteceram —
 * "não tenho acesso à ata", "a edição é manual no sistema", "o critério não
 * está explícito"); (4) nenhuma ferramenta de escrita chamada em pergunta que
 * era só consulta.
 *
 * Uso:
 *   node server/scripts/testarPromptsIA.cjs            # todos
 *   node server/scripts/testarPromptsIA.cjs --limite=5 # amostra
 *   node server/scripts/testarPromptsIA.cjs --porta=3099
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const limiteArg = process.argv.find((a) => a.startsWith('--limite='));
const LIMITE = limiteArg ? Number(limiteArg.split('=')[1]) : Infinity;
const portaArg = process.argv.find((a) => a.startsWith('--porta='));
const PORTA = portaArg ? Number(portaArg.split('=')[1]) : 3099;

const { SQLITE_FILE, DOSSIES_DIR, CLAUDE_STATE_FILE } = require('../config.cjs');

/** Ferramentas que ALTERAM dado — nenhuma deve ser chamada num caso de consulta. */
const ESCRITA = new Set([
  'registrar_memoria', 'remover_memoria', 'corrigir_dossie_cliente', 'criar_evento',
  'atualizar_evento', 'atualizar_cliente', 'criar_lembrete', 'definir_status_acompanhamento',
  'definir_ficha_cliente_final', 'gerar_ata_pdf',
]);

/**
 * Frases que já saíram do agente e são REGRESSÃO — cada uma custou uma
 * conversa real de suporte. Valem pra todos os casos, além dos `proibido`
 * específicos.
 */
const PROIBIDO_GLOBAL = [
  { re: /n[ãa]o tenho acesso (a|à|ao)s? (ata|anexo|documento|arquivo)/i, motivo: 'nega acesso à ata/anexo (a ferramenta devolve o texto completo)' },
  { re: /(edi[çc][ãa]o|editar).{0,40}(é|e) manual no sistema/i, motivo: 'diz que edição é manual (existe atualizar_evento/atualizar_cliente)' },
  { re: /crit[ée]rio (n[ãa]o )?(est[áa] )?(n[ãa]o )?expl[íi]cito/i, motivo: 'diz que o critério do risco não está explícito (está em ultimaAnalise.fatores)' },
  { re: /raz[õo]es prov[áa]veis/i, motivo: 'especula "razões prováveis" em vez de citar os fatores' },
  { re: /\b(Write|Bash|Read)\b.{0,30}(ferramenta|permiss)/i, motivo: 'cita ferramenta do Claude Code em vez das da carteira' },
  { re: /habilit(e|ar) (as )?permiss/i, motivo: 'pede pro usuário habilitar permissão do Claude Code' },
];

/**
 * Os casos. `cliente` é resolvido por nome no início (pra pegar o id real da
 * cópia). `esperado`/`proibido` são regex sobre a resposta; `semEscrita`
 * (padrão true) reprova se alguma ferramenta de escrita foi chamada.
 */
const CASOS = [
  // --- Identidade e cadastro ---
  { id: 1, p: 'Quantos clientes ativos temos na carteira?', esperado: [/\d+/] },
  { id: 2, p: 'Quais clientes estão suspensos?' },
  { id: 3, p: 'O cliente 27 de setembro existe na carteira?' },
  { id: 4, p: 'Me fala sobre o cliente Xpto Inexistente Ltda.', esperado: [/n[ãa]o (encontr|exist)/i] },
  { id: 5, p: 'Quais lojas fazem parte do grupo Altese?' },
  { id: 6, p: 'Quais clientes são do segmento Autopeça?' },
  { id: 7, p: 'Quantos clientes têm Precificação contratada?', esperado: [/\d+/] },

  // --- Risco e dossiê (os bugs corrigidos) ---
  { id: 8, cliente: 'Altese - Recreio + Barra', p: 'Por que o risco desse cliente está nesse nível? Cite os motivos registrados.', esperado: [/./] },
  { id: 9, cliente: 'Altese - Recreio + Barra', p: 'Me dá o dossiê desse cliente.' },
  { id: 10, cliente: 'Gomec', p: 'Qual o nível de risco e por quê?' },
  { id: 11, cliente: 'Cativo', p: 'Tem algum ponto de atenção registrado nesse cliente?' },
  { id: 12, p: 'Quais clientes estão com risco alto?' },
  { id: 13, cliente: 'Vitorinos', p: 'Qual a próxima pauta sugerida?' },
  { id: 14, cliente: 'Maniacar', p: 'Esse cliente já foi analisado?' },

  // --- Serviço independente (correção nova) ---
  { id: 15, cliente: 'Altese - Recreio + Barra', p: 'Quais serviços desse cliente dependem de reunião?', esperado: [/monitoria/i] },
  { id: 16, cliente: 'Altese - Recreio + Barra', p: 'Preciso agendar reunião de Precificação pra esse cliente?' },
  { id: 17, p: 'Tem algum cliente que faz algum serviço sozinho, sem depender de reunião?' },

  // --- Cadência e métricas (números têm de vir de ferramenta) ---
  { id: 18, p: 'Quantos % da carteira está com a cadência em dia?', esperado: [/\d+/] },
  { id: 19, p: 'Quem eu devo agendar essa semana?' },
  { id: 20, p: 'Quais clientes estão sem contato há mais de 30 dias?' },
  { id: 21, p: 'Algum cliente vence a cadência nos próximos 5 dias?' },
  { id: 22, p: 'Quem contratou Precificação e não está sendo atendido?' },
  { id: 23, p: 'Qual a cobertura da carteira no mês?' },
  { id: 24, p: 'Quantas reuniões foram concluídas neste ano?', esperado: [/\d+/] },
  { id: 25, p: 'Me dá um panorama de risco da carteira.' },

  // --- Ata e histórico (não pode negar acesso) ---
  { id: 26, cliente: 'Altese - Recreio + Barra', p: 'Qual foi a última reunião desse cliente e o que dizia a ata?' },
  { id: 27, cliente: 'Gomec', p: 'O que ficou combinado na última reunião?' },
  { id: 28, cliente: 'Cativo', p: 'Tem algum arquivo anexado nas reuniões desse cliente?' },
  { id: 29, cliente: 'Vitorinos', p: 'Quantas reuniões esse cliente já teve?', esperado: [/\d+/] },
  { id: 30, cliente: 'Paralama', p: 'Alguma reunião desse cliente foi cancelada ou remarcada?' },

  // --- Produto e margem ---
  { id: 31, cliente: 'Altese - Recreio + Barra', p: 'Quais produtos apareceram em queda nas últimas reuniões?' },
  { id: 32, cliente: 'Gomec', p: 'O que foi precificado na última reunião?' },
  { id: 33, cliente: 'Cativo', p: 'Algum cliente final desse cliente parou de comprar?' },

  // --- Contatos e agenda ---
  { id: 34, cliente: 'Gomec', p: 'Com quem eu falo nesse cliente?' },
  { id: 35, cliente: 'Altese - Recreio + Barra', p: 'Tem reunião marcada pra esse cliente?' },
  { id: 36, p: 'O que tem na agenda pros próximos 7 dias?' },

  // --- Valor que não existe (correção nova) ---
  { id: 37, cliente: 'Vitorinos', p: 'Cria uma reunião pra esse cliente dia 20/10/2026 às 15h com status Rascunho.', esperado: [/pendente/i], semEscrita: false },
  { id: 38, cliente: 'Vitorinos', p: 'Quais status de evento existem no sistema?', esperado: [/agendado|pendente|conclu/i] },
  { id: 39, cliente: 'Maniacar', p: 'Marca reunião com o monitor Erick amanhã às 10h.', semEscrita: false },

  // --- Edição (não pode dizer que é manual) ---
  { id: 40, cliente: 'Maniacar', p: 'Como faço pra trocar o monitor de uma reunião já criada?' },
  { id: 41, cliente: 'Gomec', p: 'Muda o segmento desse cliente pra Oficina. Pode?' },

  // --- Postura: ambiguidade, escopo, premissa errada ---
  { id: 42, p: 'Como está esse cliente?', esperado: [/qual|quais|especific|informe|me diga/i] },
  { id: 43, p: 'Qual o risco jurídico de rescindir o contrato com um cliente?', esperado: [/fora do escopo|n[ãa]o (é|e) (do )?escopo|jur[íi]dico/i] },
  { id: 44, p: 'Todos os nossos clientes estão em dia com a cadência, certo?' },
  { id: 45, p: 'Me diz o faturamento total da 2D no ano.' },

  // --- Memória do processo ---
  { id: 46, p: 'Que regras do processo você tem guardadas?' },
  { id: 47, p: 'A ata só é preenchida ao final da reunião. Guarda isso?', semEscrita: false },

  // --- Robustez ---
  { id: 48, p: 'oi' },
  { id: 49, p: 'Compara a Altese com a Gomec: qual está em situação melhor e por quê?' },
  { id: 50, p: 'Quantos clientes cada monitor atende?', esperado: [/\d+/] },
];

// ---------------------------------------------------------------------------

function copiarBaseIsolada() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-teste-ia-'));
  const sqliteDir = path.join(raiz, 'sqlite');
  const dataDir = path.join(raiz, 'Carteira Web');
  fs.mkdirSync(sqliteDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'dossies'), { recursive: true });

  fs.copyFileSync(SQLITE_FILE, path.join(sqliteDir, path.basename(SQLITE_FILE)));

  // CRÍTICO: sem isto, `provedorAtivo()` (estado.cjs) não acha nenhum estado
  // no SQLITE_DIR novo e cai no padrão `ollama` — silenciosamente testando o
  // modelo local fraco em vez do Claude CLI/Haiku que está em uso real. Já
  // aconteceu (rodada anterior deste script, sem isto): 3 "falhas" que eram
  // na verdade o Ollama, relatadas por engano como se fossem do monitorIA real.
  const estadoOrigem = CLAUDE_STATE_FILE;
  if (fs.existsSync(estadoOrigem)) {
    fs.copyFileSync(estadoOrigem, path.join(sqliteDir, path.basename(estadoOrigem)));
  } else {
    console.warn(`AVISO: ${estadoOrigem} não existe — a instância de teste vai cair no provedor padrão (ollama), não no provedor real em uso.`);
  }

  let dossies = 0;
  if (fs.existsSync(DOSSIES_DIR)) {
    for (const nome of fs.readdirSync(DOSSIES_DIR)) {
      const origem = path.join(DOSSIES_DIR, nome);
      if (fs.statSync(origem).isFile()) {
        fs.copyFileSync(origem, path.join(dataDir, 'dossies', nome));
        dossies++;
      }
    }
  }
  return { raiz, sqliteDir, dossies };
}

function subirBackend({ raiz, sqliteDir }) {
  const env = {
    ...process.env,
    // As duas isolam: ONEDRIVE_ROOT manda no dossiê/backup, SQLITE_DIR no banco.
    ONEDRIVE_ROOT: raiz,
    SQLITE_DIR: sqliteDir,
    PORT: String(PORTA),
    HOST: '127.0.0.1',
    // Não roda cron/fila/backup competindo com a instância real.
    AUTO_ATUALIZACAO: '0',
  };
  const filho = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server.cjs')], {
    env, cwd: path.join(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  filho.stdout.on('data', (b) => logs.push(String(b)));
  filho.stderr.on('data', (b) => logs.push(String(b)));
  return { filho, logs };
}

async function esperarBackend(tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA}/api/status/base`);
      if (r.ok) return true;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const api = (rota, opts) => fetch(`http://127.0.0.1:${PORTA}/api${rota}`, opts).then((r) => r.json());

async function main() {
  console.log('Preparando base isolada (o agente pode escrever — nada disso toca produção)...');
  const iso = copiarBaseIsolada();
  console.log(`  SQLite copiado + ${iso.dossies} dossiê(s) em ${iso.raiz}\n`);

  const { filho, logs } = subirBackend(iso);
  const encerrar = () => { try { filho.kill(); } catch { /* já morreu */ } };
  process.on('exit', encerrar);

  if (!await esperarBackend()) {
    console.error('Backend de teste não subiu. Log:\n' + logs.join(''));
    encerrar();
    process.exit(1);
  }
  console.log(`Backend de teste no ar em 127.0.0.1:${PORTA}\n`);

  const clientes = await api('/clients');
  const idPorNome = new Map(clientes.map((c) => [c.empresa, c.id]));

  const casos = CASOS.slice(0, LIMITE);
  const resultados = [];

  for (const caso of casos) {
    const clientId = caso.cliente ? idPorNome.get(caso.cliente) : undefined;
    if (caso.cliente && !clientId) {
      console.log(`[${String(caso.id).padStart(2)}] PULADO — cliente "${caso.cliente}" não existe na base`);
      continue;
    }
    const acoesAntes = (await api('/ia/acoes')).length;
    const t0 = Date.now();
    let resposta = '';
    let erro = null;
    try {
      const r = await api('/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ texto: caso.p, historico: [], clientId, monitor: 'Erick Cardoso' }),
      });
      resposta = r.resposta ?? '';
      if (r.error) erro = r.error;
    } catch (e) {
      erro = e.message;
    }
    const seg = Math.round((Date.now() - t0) / 1000);
    const acoes = (await api('/ia/acoes')).slice(0, Math.max(0, (await api('/ia/acoes')).length - acoesAntes));
    const ferramentas = acoes.map((a) => a.ferramenta);

    const problemas = [];
    if (erro) problemas.push(`erro: ${erro}`);
    if (!erro && !resposta.trim()) problemas.push('resposta vazia');
    for (const { re, motivo } of PROIBIDO_GLOBAL) if (re.test(resposta)) problemas.push(`FRASE PROIBIDA — ${motivo}`);
    for (const re of caso.esperado ?? []) if (!re.test(resposta)) problemas.push(`esperado não encontrado: ${re}`);
    for (const re of caso.proibido ?? []) if (re.test(resposta)) problemas.push(`padrão proibido presente: ${re}`);
    if (caso.semEscrita !== false) {
      const escreveu = ferramentas.filter((f) => ESCRITA.has(f));
      if (escreveu.length) problemas.push(`ESCREVEU sem ser pedido: ${escreveu.join(', ')}`);
    }

    const marca = problemas.length === 0 ? 'ok  ' : 'FALHA';
    console.log(`[${String(caso.id).padStart(2)}] ${marca} (${seg}s, ${ferramentas.length} ferramenta(s)) ${caso.p.slice(0, 60)}`);
    problemas.forEach((pb) => console.log(`      → ${pb}`));
    resultados.push({ ...caso, resposta, ferramentas, problemas, seg });
  }

  const falhas = resultados.filter((r) => r.problemas.length > 0);
  console.log(`\n=== ${resultados.length} caso(s): ${resultados.length - falhas.length} ok, ${falhas.length} com problema ===`);

  const saida = path.join(iso.raiz, 'resultado.json');
  fs.writeFileSync(saida, JSON.stringify(resultados, null, 2), 'utf8');
  console.log(`Respostas completas: ${saida}`);
  if (falhas.length) {
    console.log('\nCasos com problema:');
    falhas.forEach((f) => console.log(`  [${f.id}] ${f.p.slice(0, 70)}\n        ${f.problemas.join(' | ')}`));
  }
  encerrar();
}

main().catch((err) => { console.error('Erro fatal:', err); process.exit(1); });
