const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Carrega `.env` manualmente, sem dependência nenhuma (não tem `dotenv`
 * instalado). Bug real encontrado em produção: nem `npm start` nem o launcher
 * (`inicio.cjs`) passam `--env-file`, então `OLLAMA_API_KEY` sempre ficou
 * vazia lá — o app caía pro Ollama local (default de `OLLAMA_URL` sem a key),
 * que só tem `llama3.1:8b` baixado, devolvendo 404 pra qualquer modelo da
 * nuvem, sempre, silenciosamente.
 *
 * Dois candidatos, nesta ordem — o primeiro que existir é usado:
 *  1. Raiz do projeto (dev: `C:\projects\Carteira Web\.env`, 1 nível acima
 *     deste arquivo).
 *  2. Um nível ACIMA da pasta do app instalado (`C:\SistemaCarteira\.env`,
 *     não `C:\SistemaCarteira\app\.env`) — de propósito fora de `appDir`:
 *     toda atualização troca a pasta `app` inteira por uma nova
 *     (`launcher/atualizar.cjs`, rename atômico + apaga a antiga), então
 *     qualquer `.env` deixado DENTRO de `app/` seria apagado na atualização
 *     seguinte. Aqui sobrevive.
 *
 * Só seta se a env ainda não existir (mesma precedência do `dotenv`: env real
 * do processo sempre vence o `.env`).
 */
/**
 * Aplica as linhas `CHAVE=valor` de um arquivo no estilo `.env` sobre
 * `process.env`. Nunca sobrescreve chave que já exista (mesma precedência do
 * `dotenv`). Devolve `false` se o arquivo não existir/não puder ser lido.
 *
 * `permitidas`, quando passado, restringe as chaves que o arquivo pode setar —
 * usado no config COMPARTILHADO do OneDrive (ver `CONFIG_IA_COMPARTILHADO`
 * abaixo), que mora numa pasta corporativa e não deve poder mexer em nada
 * estrutural. `CARTEIRA_HOSTNAME_SERVIDOR` em especial: ela decide, em
 * `server/modo.cjs`, se esta máquina é a dona do banco ou uma cliente da fila.
 */
function aplicarEnvDeArquivo(caminho, { permitidas } = {}) {
  let conteudo;
  try {
    conteudo = fs.readFileSync(caminho, 'utf8');
  } catch {
    return false;
  }
  for (const linha of conteudo.split('\n')) {
    const l = linha.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i === -1) continue;
    const chave = l.slice(0, i).trim();
    const valor = l.slice(i + 1).trim();
    if (!chave || chave in process.env) continue;
    if (permitidas && !permitidas.includes(chave)) continue;
    process.env[chave] = valor;
  }
  return true;
}

(function carregarEnv() {
  const candidatos = [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', '.env')];
  for (const envPath of candidatos) aplicarEnvDeArquivo(envPath);
})();

// Em produção (Apache/XAMPP como proxy reverso), o Node só precisa ser
// alcançável pelo Apache na própria máquina — por isso o default é loopback,
// nunca exposto direto na rede. Defina APP_HOST se precisar rodar `npm start`
// (dev, sem Apache) acessível por outras máquinas na LAN diretamente.
// O app NÃO tem autenticação: expor na rede deixa os dados acessíveis a
// qualquer um que alcance essa porta — decisão explícita do usuário.
const HOST = process.env.APP_HOST || '127.0.0.1';
// 3011, não 3001: a 3001 é porta padrão de meio mundo (outro projeto na
// própria máquina de produção subia um Express nela e roubava a porta —
// quem bootasse primeiro levava). Sobrescrevível por `PORT`.
const PORT = Number(process.env.PORT) || 3011;

// Agenda do CEO (Google Calendar, somente leitura via OAuth) — camada isolada
// em server/ceoAgenda.cjs. Autorizado uma única vez com a própria conta dona
// da agenda (negocios@2dconsultores.com.br) via server/scripts/authorizeCeoAgenda.cjs
// (script local, fora do fluxo HTTP normal). calendarId não é segredo (é só
// um e-mail/ID de agenda); os caminhos abaixo apontam pra fora do repositório
// (dentro do OneDrive, junto dos outros dados sensíveis do app) — os arquivos
// .json em si (client_secret, refresh_token) nunca devem ir pro git.
const CEO_AGENDA_CALENDAR_ID = process.env.CEO_AGENDA_CALENDAR_ID || 'negocios@2dconsultores.com.br';

/**
 * Todos os dados (planilha + anexos) vivem DENTRO do OneDrive do usuário —
 * nunca na pasta do projeto nem em qualquer outro lugar. É intencional:
 * o backup/sincronização fica a cargo do OneDrive, e não deve existir um
 * segundo caminho onde os dados possam acabar sendo gravados por engano.
 * Não adicione fallback para pasta local aqui — se o OneDrive não estiver
 * disponível, o servidor deve falhar ao iniciar, não gravar em outro lugar.
 *
 * Resolvido a partir de `os.homedir()`, NUNCA um caminho fixo com usuário
 * específico (`C:\Users\Kerol\...`) — a partir da Etapa 2-4 (fila/controller,
 * acesso remoto) este `.exe` roda em 4 máquinas diferentes, cada uma com seu
 * próprio usuário do Windows. O nome da pasta do OneDrive em si ("OneDrive -
 * 2dconsultores.com.br") é igual pra todo mundo da organização (Microsoft 365
 * nomeia pelo tenant, não por pessoa) — só o `C:\Users\<nome>` na frente
 * varia, e é exatamente isso que `os.homedir()` resolve certo em cada
 * máquina (mesmo padrão já usado em `launcher/config.cjs:RELEASES_DIR`).
 */
const ONEDRIVE_ROOT = process.env.ONEDRIVE_ROOT
  || path.join(os.homedir(), 'OneDrive - 2dconsultores.com.br', '01 - Marco + Monitores', '6 - Erick');
const DATA_DIR = path.join(ONEDRIVE_ROOT, 'Carteira Web');
// Credenciais OAuth (Google Cloud) usadas só para ler a Agenda do CEO — ficam
// fora do repositório, junto com o resto dos dados sensíveis no OneDrive.
const CEO_AGENDA_OAUTH_CLIENT_PATH = process.env.CEO_AGENDA_OAUTH_CLIENT_PATH || path.join(DATA_DIR, 'ceo-agenda-oauth-client.json');
const CEO_AGENDA_OAUTH_TOKEN_PATH = process.env.CEO_AGENDA_OAUTH_TOKEN_PATH || path.join(DATA_DIR, 'ceo-agenda-oauth-token.json');
// Pasta onde cada reunião é gravada como .json (integração com outro sistema).
const REUNIOES_DIR = path.join(DATA_DIR, 'reunioes_json');

/**
 * "Dados Alvos" — vendas por loja/cliente/produto/mês, geradas por OUTRO
 * sistema (Ecossistema-Monitoria). Fonte SOMENTE LEITURA: nada aqui é escrito
 * por este app, e o conteúdo NÃO entra no SQLite — é lido, agregado e cacheado.
 *
 * Fica FORA de `DATA_DIR` de propósito: é irmã de "6 - Erick" dentro de
 * "01 - Marco + Monitores", não é dado da Carteira. Por isso o default sobe um
 * nível a partir de `ONEDRIVE_ROOT`. Sobrescrevível por `ALVOS_DIR` no `.env`.
 *
 * Não faz `process.exit` se não existir: diferente da planilha do app, isto é
 * integração opcional — sem a pasta, as telas que a consomem ficam vazias e o
 * app sobe normalmente.
 */
const ALVOS_DIR = process.env.ALVOS_DIR
  || path.join(ONEDRIVE_ROOT, '..', 'Ecossistema-Monitoria', 'Dados Alvos');
// Nome do arquivo dentro da pasta de cada empresa — igual nas 4 pastas
// verificadas. A ABA, ao contrário, varia ("Sheet1", "Dados", "Dados (2)") e no
// Gomec a PRIMEIRA aba está vazia: por isso a aba é escolhida pelo conteúdo,
// nunca pela posição (ver server/alvos/leitor.cjs).
const ALVOS_ARQUIVO = 'Dados Mais Atacado.xlsx';

// Falha alto e claro se o OneDrive não estiver sincronizado nesta máquina —
// nunca cria essa árvore de pastas do zero, para não fingir estar "salvo no
// OneDrive" quando na verdade é só uma pasta local desconectada da nuvem.
if (!fs.existsSync(ONEDRIVE_ROOT)) {
  console.error(
    `Pasta do OneDrive não encontrada: ${ONEDRIVE_ROOT}\n` +
    `Verifique se o OneDrive está instalado, sincronizado e com essa pasta disponível nesta máquina.`
  );
  process.exit(1);
}
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

/**
 * Config de IA COMPARTILHADO entre as máquinas, dentro do OneDrive (ao lado do
 * banco). Existe para que uma máquina cliente nova (`APP_MODE=client`, ver
 * `server/modo.cjs`) já nasça capaz de usar o monitorIA sem ninguém editar um
 * `.env` nela à mão — sem `OLLAMA_API_KEY`, `OLLAMA_URL` cai no default do
 * Ollama LOCAL (`127.0.0.1:11434`), que nessas máquinas não existe, e toda
 * pergunta ao agente falhava com "Ollama inacessível".
 *
 * Cabe compartilhar porque a key do Ollama Cloud é credencial de SERVIÇO (tier
 * gratuito, cota por modelo, pensada para ser usada por várias máquinas), não
 * de pessoa — e quem lê esta pasta já lê todos os dados de cliente que estão
 * nela. O oposto vale para o Claude CLI: aquele login é assinatura PESSOAL, é
 * detectado por máquina (`server/ia/claudeCli/auth.cjs`) e cada uma usa o
 * próprio — nada dele entra neste arquivo.
 *
 * Lido só agora, e não junto do `.env` da máquina, porque depende de
 * `DATA_DIR` — que por sua vez pode vir do próprio `.env` local. Com
 * allowlist: o `.env` da máquina continua vencendo (precedência de
 * `aplicarEnvDeArquivo`), então uma máquina com key própria não é atrapalhada
 * por este arquivo.
 */
const CONFIG_IA_COMPARTILHADO = path.join(DATA_DIR, 'config-ia.env');
aplicarEnvDeArquivo(CONFIG_IA_COMPARTILHADO, { permitidas: ['OLLAMA_API_KEY', 'OLLAMA_URL', 'OLLAMA_MODELS'] });

// Banco de desenvolvimento/sandbox (schema novo). O banco real da 2D fica em
// ../database.xlsx (pasta "6 - Erick"); a virada para ele será feita depois.
const DB_FILE = path.join(DATA_DIR, 'database_dev.xlsx');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Dossiê de IA por cliente (texto, atualizado incrementalmente pela análise
// semanal) — mesma regra dos demais dados: dentro do OneDrive, nunca fallback
// local (ver aviso em ONEDRIVE_ROOT acima).
const DOSSIES_DIR = path.join(DATA_DIR, 'dossies');
if (!fs.existsSync(DOSSIES_DIR)) fs.mkdirSync(DOSSIES_DIR, { recursive: true });

// LLM: Ollama Cloud (ollama.com), tier gratuito — mesma API HTTP do Ollama
// local (`/api/generate`, `/api/chat`), só que com `Authorization: Bearer` e
// modelos hospedados (não são modelos Claude/Anthropic; free tier não expõe
// isso). Sai do "100% local" original (ver Segurança no CLAUDE.md), decisão
// explícita do usuário pra evitar custo por token de API paga. Com
// `OLLAMA_API_KEY` setado, aponta pra nuvem por padrão; sem a key, cai para
// um Ollama local (`ollama serve`) como antes.
// `OLLAMA_MODELS`: lista separada por vírgula, em ordem de preferência —
// `ollamaClient.chamarComFallback` tenta o próximo da lista se o atual
// estourar cota/rate limit (a cota do tier gratuito é POR MODELO, não pela
// conta — visto na prática: gpt-oss:120b/gemma4:31b esgotados no mesmo
// instante em que nemotron-3-nano:30b, menos usado, respondia normal) ou
// ficar indisponível (404/429/5xx). Lista longa de propósito — mais opção de
// fallback = menos chance de TODOS os modelos usados estarem esgotados ao
// mesmo tempo. Modelos gratuitos hoje no Ollama Cloud (ver conta): gpt-oss:120b,
// gpt-oss:20b, gemma4:31b, nemotron-3-ultra, nemotron-3-super,
// nemotron-3-nano:30b, minimax-m3.
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const OLLAMA_URL = process.env.OLLAMA_URL || (OLLAMA_API_KEY ? 'https://ollama.com' : 'http://127.0.0.1:11434');
const OLLAMA_MODELS = (process.env.OLLAMA_MODELS || 'gpt-oss:120b,gpt-oss:20b,nemotron-3-super,gemma4:31b,nemotron-3-nano:30b,minimax-m3,nemotron-3-ultra')
  .split(',').map((m) => m.trim()).filter(Boolean);
const OLLAMA_MODEL = OLLAMA_MODELS[0];


/**
 * SQLite passa a ser o motor real (Etapa 1.5) — mora FORA do OneDrive, de
 * propósito: SQLite corrompe com sincronização concorrente de pasta tipo
 * OneDrive/Dropbox (aviso explícito da documentação oficial do SQLite, pior
 * que o risco equivalente do Excel). Só este processo local abre esse
 * arquivo; o Excel/backup do SQLite viram export periódico (ver
 * `server/backupSqlite.cjs`), nunca a fonte viva.
 */
const SQLITE_DIR = process.env.SQLITE_DIR || path.join(process.env.LOCALAPPDATA || require('os').homedir(), 'CarteiraWeb');
const SQLITE_FILE = path.join(SQLITE_DIR, 'carteira.sqlite');
if (!fs.existsSync(SQLITE_DIR)) fs.mkdirSync(SQLITE_DIR, { recursive: true });

/**
 * Provedor de LLM do monitorIA. Dois caminhos, mesma interface
 * (`server/ia/provider.cjs`):
 *
 *  - `ollama`     — HTTP direto no Ollama local/nuvem (`ollamaClient.cjs`).
 *  - `claude-cli` — dirige o **Claude Code CLI** como subprocesso
 *                   (`server/ia/claudeCli/`), NÃO a API da Anthropic. Sem
 *                   `ANTHROPIC_API_KEY`: a credencial é o login da conta
 *                   Claude (assinatura Pro/Max/Team), obtido pela GUI em
 *                   Configurações → monitorIA com o fluxo de link + código
 *                   do `claude setup-token`.
 *
 * `IA_PROVIDER` no `.env`, quando setado, MANDA e trava a escolha (deploy
 * controlado). Sem ele, vale o que estiver gravado no estado local
 * (`CLAUDE_STATE_FILE`), que é o que a GUI escreve.
 */
const IA_PROVIDER = (process.env.IA_PROVIDER || '').trim();
const IA_PROVIDERS = ['ollama', 'claude-cli'];

/**
 * Estado local do provedor Claude CLI: `{ provedor, token, atualizadoEm }`.
 *
 * Fica em `SQLITE_DIR` (LOCALAPPDATA), NUNCA no OneDrive — é uma credencial
 * de conta pessoal com validade de 1 ano: sincronizar isso pro OneDrive
 * corporativo publicaria o token pra todo mundo com acesso à pasta e pra
 * todas as máquinas que sincronizam. Mesmo motivo do SQLite morar fora do
 * OneDrive, com o agravante de ser segredo, não só arquivo frágil.
 */
const CLAUDE_STATE_FILE = process.env.CLAUDE_STATE_FILE || path.join(SQLITE_DIR, 'claude-cli.json');

/**
 * Caminho do executável do Claude Code CLI. Vazio = autodetecção
 * (`server/ia/claudeCli/localizar.cjs`). Não assuma `claude` no PATH: em
 * produção o backend sobe pelo launcher (`.exe`), que herda um ambiente
 * sem o PATH de usuário completo — mesmo motivo de `NODE_PORTATIL_PATH`
 * existir pro Node portátil.
 */
const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH || '';

// Alias de modelo aceito pelo próprio CLI (`--model`). Sonnet é o default por
// ser o equilíbrio custo/qualidade da assinatura pra tarefa de análise curta.
//
// `CLAUDE_CLI_MODEL` no `.env`, quando setado, TRAVA a escolha (mesma regra de
// `IA_PROVIDER`); sem ele, vale o que a GUI gravou no estado local. A lista
// abaixo é só o que a tela oferece — o CLI aceita id completo também, mas um
// campo livre aqui só serviria pra digitar errado um nome de modelo.
const CLAUDE_CLI_MODEL = process.env.CLAUDE_CLI_MODEL || '';
const CLAUDE_CLI_MODEL_PADRAO = 'sonnet';
const CLAUDE_CLI_MODELOS = ['sonnet', 'opus', 'haiku', 'fable'];

// Teto de tempo de UMA chamada ao CLI (spawn → resposta final). O CLI roda o
// loop de ferramentas por conta própria, então não existe
// `MAX_ITERACOES_FERRAMENTA` aqui pra segurar loop — o timeout É o limite.
const CLAUDE_CLI_TIMEOUT_MS = Number(process.env.CLAUDE_CLI_TIMEOUT_MS) || 180000;

/**
 * Diretório de trabalho dos subprocessos do CLI — pasta VAZIA e dedicada, de
 * propósito. Rodar o CLI dentro do repositório faria ele carregar o
 * `CLAUDE.md`, o `.claude/` e as regras do projeto no próprio system prompt
 * (é o comportamento normal dele), poluindo o contexto do monitorIA com
 * instruções de desenvolvimento que não têm nada a ver com monitoria.
 */
const CLAUDE_CLI_CWD = process.env.CLAUDE_CLI_CWD || path.join(SQLITE_DIR, 'claude-cwd');

// Nome do servidor MCP que expõe as ferramentas da carteira pro CLI. Entra no
// nome qualificado das ferramentas do lado dele (`mcp__carteira__<nome>`) —
// mudar aqui muda o filtro de `--allowed-tools`, então os dois vivem juntos.
const CLAUDE_MCP_SERVER = 'carteira';

/**
 * Destino do backup/export diário (SQLite snapshot + `.xlsx`) — pasta própria,
 * SEPARADA do `ONEDRIVE_ROOT` acima (que continua sendo onde vivem uploads e
 * as credenciais da Agenda do CEO). Caminho pedido pelo usuário para esse
 * fluxo novo; não implica mudar `ONEDRIVE_ROOT`. Só cria a pasta se o
 * OneDrive já estiver montado nesta máquina — mesma cautela do `ONEDRIVE_ROOT`,
 * não finge estar "salvo no OneDrive" se a pasta não existe de verdade.
 */
// Mesmo motivo do `ONEDRIVE_ROOT` acima: `os.homedir()`, nunca `C:\Users\Kerol`.
const BACKUP_ONEDRIVE_DIR = process.env.BACKUP_ONEDRIVE_DIR
  || path.join(os.homedir(), 'OneDrive - 2dconsultores.com.br', '01 - Marco + Monitores', 'Ecossistema-Monitoria', 'Carteira');

/**
 * Snapshot somente-leitura do SQLite real, publicado periodicamente pelo
 * controller (`server/fila/controller.cjs`, Etapa 4 do plano de fila) dentro
 * do OneDrive — é a única forma das 3 máquinas remotas (`APP_MODE=client`)
 * verem dado atualizado, já que o SQLite vivo é local-only na Karol-2D (nunca
 * sincronizado, ver `SQLITE_DIR` acima). Fica em `DATA_DIR` (não em
 * `BACKUP_ONEDRIVE_DIR`) porque é operacional — lido a cada ciclo do
 * controller (minutos), não um backup de retenção longa.
 */
const SNAPSHOT_DIR = path.join(DATA_DIR, 'filas', 'leitura');
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'carteira-snapshot.sqlite');

// Colunas alinhadas ao banco real (6 - Erick\database.xlsx) + adições do app
// (monitor, servicos, subject, attachments). As colunas antigas
// monitoria/price/controladoria + suspenso são mantidas e sincronizadas a
// partir de servicos/status no save, para não quebrar o schema real na virada.
// `lastPricing`/`lojas` (Clientes) e `sala`/`notifiedDay`/`notes` (Agenda) já
// existem na planilha real mas faltavam aqui — saveSheetData reescreve a aba
// inteira com json_to_sheet(dados, { header }), então qualquer coluna fora
// dessa lista era apagada de TODAS as linhas a cada save (`sala` é campo ativo,
// gravado pelo EventFormModal — bug real de perda de dado, não só legado).
const CLIENTES_HEADERS = ['id', 'createdAt', 'empresa', 'monitor', 'servicos', 'servicosIndependentes', 'contatos', 'observacao', 'estado', 'status', 'tipoAnalise', 'grupo', 'suspenso', 'monitoria', 'price', 'controladoria', 'lastContact', 'lastMeeting', 'lastPricing', 'userId', 'lojas', 'relatorioCadencia', 'local', 'linkPowerBI', 'linkPlataforma'];
// `origem` = de quem partiu a interação ('nos' | 'cliente'). Vazio nos eventos
// antigos (tratado como não informado, nunca como 'nos') — é o que permite
// separar contato que NÓS fizemos de contato que o CLIENTE fez.
const AGENDA_HEADERS = ['id', 'createdAt', 'clientId', 'clientName', 'type', 'subject', 'date', 'time', 'duracao', 'description', 'status', 'motivo', 'monitores', 'sala', 'origem', 'reagendamentos', 'datasAnteriores', 'servicos', 'checklist', 'preAnalise', 'ata', 'resumo', 'transcricao', 'serie', 'attachments', 'userId', 'notifiedDay', 'notes', 'produtosSituacao', 'precificacoes'];
const LEMBRETES_HEADERS = ['id', 'createdAt', 'title', 'datetime', 'description', 'status', 'clientId', 'eventId', 'recurrence', 'type', 'userId'];
const CATEGORIAS_HEADERS = ['id', 'tipo', 'valor', 'ordem', 'createdAt'];
const ACOES_HEADERS = ['id', 'clientId', 'tipo', 'segmento', 'status', 'servico', 'monitor', 'notes', 'dueAt', 'createdAt', 'updatedAt'];
const MODELOS_HEADERS = ['id', 'segmento', 'titulo', 'conteudo', 'createdAt'];
const CADENCIAS_HEADERS = ['chave', 'valor'];
// workspaceId: área de trabalho dona do board (obrigatório dali pra frente).
// iniciativasBoardId: opcional — outro board (da mesma workspace) que funciona
// como o quadro de Iniciativas deste board (1 board de Iniciativas ↔ 1 board
// de Tarefas, empilhados na mesma tela — ver AgilTarefas.iniciativaId).
const AGIL_WORKSPACES_HEADERS = ['id', 'nome', 'descricao', 'ordem', 'createdAt'];
// ehIniciativas: marca o board "companheiro" de Iniciativas, criado junto com
// todo board novo (Kanbanize: Initiatives Workflow é padrão embutido, não algo
// que se vincula manualmente) — some do seletor de boards, só aparece
// empilhado acima do board de Tarefas que aponta pra ele.
const AGIL_BOARDS_HEADERS = ['id', 'workspaceId', 'iniciativasBoardId', 'ehIniciativas', 'nome', 'descricao', 'createdAt'];
// wipLimit: 0/vazio = sem limite (coluna sem WIP configurado).
// parentId: vazio = coluna de topo; preenchido = sub-coluna daquele pai
// (2 níveis, como o parent/child column do Kanbanize). Só as colunas-FOLHA
// recebem tarefas — uma coluna de topo que ganha sub-colunas passa a ser só
// um agrupador.
// cor: opcional, hex #RRGGBB — usada só no indicador de Iniciativas (bolinha
// colorida por tarefa vinculada, na cor da coluna onde ela está). Sem cor,
// cinza neutro no indicador; não afeta o resto da UI (identidade preto-e-branco).
const AGIL_COLUNAS_HEADERS = ['id', 'boardId', 'parentId', 'titulo', 'ordem', 'wipLimit', 'cor', 'createdAt'];
// labels é string[] serializado como JSON (mesmo padrão de servicos/attachments
// em Clientes/Agenda) — SheetJS não persiste arrays/objetos direto na célula.
// `numero`: id curto sequencial POR BOARD (o "#12" que as pessoas usam pra
// falar do card) — o uuid não serve pra isso.
// iniciativaId: opcional — id de uma tarefa do board de Iniciativas vinculado
// ao board desta tarefa (ver AgilBoards.iniciativasBoardId).
const AGIL_TAREFAS_HEADERS = ['id', 'numero', 'boardId', 'colunaId', 'swimlaneId', 'frenteId', 'iniciativaId', 'titulo', 'descricao', 'ordem', 'prioridade', 'labels', 'responsavel', 'dueAt', 'clientId', 'bloqueado', 'motivoBloqueio', 'createdAt', 'updatedAt'];
// Série recorrente de agenda: guarda a REGRA (aberta, sem "durante N meses") +
// o molde do evento. As ocorrências do mês são materializadas pelo servidor
// (server/agendaSeries.cjs) — mesmo padrão de relatoriosAutomaticos.cjs.
// `regra`, `monitores`, `servicos` e `lembretes` são JSON string na célula.
const AGENDA_SERIES_HEADERS = ['id', 'clientId', 'subject', 'type', 'time', 'duracao', 'monitores', 'servicos', 'sala', 'regra', 'lembretes', 'inicio', 'ativo', 'createdAt', 'updatedAt'];
const AGIL_SWIMLANES_HEADERS = ['id', 'boardId', 'titulo', 'ordem', 'createdAt'];
// Frente: categoria colorida da tarefa (ex.: Bug/Correção/Implementação),
// gerenciável pelo próprio usuário — lista de opções + cor, por board (cada
// board tem seu próprio conjunto, como colunas e swimlanes).
const AGIL_FRENTES_HEADERS = ['id', 'boardId', 'titulo', 'cor', 'ordem', 'createdAt'];
const AGIL_SUBTAREFAS_HEADERS = ['id', 'tarefaId', 'titulo', 'concluida', 'ordem', 'createdAt'];
const AGIL_COMENTARIOS_HEADERS = ['id', 'tarefaId', 'autor', 'texto', 'createdAt'];
// fatores é string[] serializado como JSON (mesmo padrão de servicos/labels
// noutras entidades). ultimoEventoAnalisadoData marca até onde a Agenda já
// foi lida — a próxima rodada só reprocessa o cliente se houver evento
// concluído/cancelado/reagendado mais recente que essa data.
// `atasAnalisadas`: mapa `{ eventoId: hashDaAta }` do que a última análise de
// fato LEU. Sem ele o gatilho era só `data do evento > última analisada` — e
// ata preenchida DEPOIS da reunião (o fluxo normal: conclui, depois escreve)
// nunca disparava reanálise. Efeito real medido na base: 38 de 45 atas
// escritas jamais chegaram ao dossiê.
const ANALISES_IA_HEADERS = ['id', 'clientId', 'nivelRisco', 'resumo', 'fatores', 'sugestaoProximaPauta', 'ultimoEventoAnalisadoData', 'geradoEm', 'atasAnalisadas'];
// Log de auditoria de toda ação que o agente de IA executa de verdade (criar
// evento, criar lembrete etc.) — argumentos/resultado como JSON string.
// origem: 'chat' (usuário pediu) ou 'analise_semanal' (futuro uso automático).
/**
 * Memória GERAL do agente: regras do processo que não pertencem a nenhum
 * cliente ("a ata só é preenchida ao fim da reunião"). O dossiê
 * (`corrigir_dossie_cliente`) é por cliente e não servia pra isso — o agente
 * ficava sem onde guardar, e um deles chegou a culpar permissão de arquivo em
 * vez de dizer que a ferramenta não existia.
 */
const MEMORIA_IA_HEADERS = ['id', 'texto', 'origem', 'criadoEm'];

// `turnId` correlaciona cada ferramenta chamada com a PERGUNTA que a
// disparou (uma pergunta pode chamar várias ferramentas) — sem isso, o
// painel de uso não tem como agrupar "o que aconteceu nesta resposta".
// `monitor`: identidade voluntária de QUEM perguntou (o filtro global de
// monitor do header, "quem sou eu nesta máquina" — CarteiraContext). NÃO é
// autenticação (o app não tem login) — é uma etiqueta que a própria pessoa
// escolhe, e o painel "Ações do agente" usa pra mostrar só o que é de quem
// está com aquele filtro ativo. Sem filtro definido ("Todos"), continua
// tudo visível — não dá pra impor privacidade sem identidade real.
const ACOES_IA_HEADERS = ['id', 'ferramenta', 'clientId', 'argumentos', 'resultado', 'origem', 'criadoEm', 'descricao', 'turnId', 'monitor'];

/**
 * Consumo de IA por pergunta (um turno de `conversar()`, nos dois
 * provedores). Existe porque nem o Claude Code CLI nem o Ollama expõem
 * "quanto da cota da assinatura resta até resetar" — isso só aparece no site
 * da Anthropic (sessão de navegador, não a credencial OAuth do CLI). O que dá
 * pra medir de verdade, e é o que fica aqui: tokens e custo de CADA resposta,
 * o que sustenta um painel de gasto acumulado (hoje, 7 dias, por origem) —
 * não um contador de cota do plano.
 */
// `pergunta`/`resposta`: texto truncado do turno. Sem isso o painel de uso
// mostrava QUAIS ferramentas rodaram mas não O QUE foi perguntado — e uma
// queixa real ("ele respondeu coisa que não devia") ficava impossível de
// diagnosticar, porque justamente os turnos problemáticos são os que NÃO
// chamam ferramenta nenhuma e por isso não deixavam rastro algum.
const USO_IA_HEADERS = [
  'id', 'criadoEm', 'origem', 'provedor', 'modelo', 'turnId',
  'inputTokens', 'outputTokens', 'cacheCreationTokens', 'cacheReadTokens',
  'custoUsd', 'duracaoMs', 'numFerramentas', 'erro', 'pergunta', 'resposta',
];

// Headers explícitos por planilha — evita que o SheetJS derive as colunas
// apenas das chaves da primeira linha do array (se a primeira linha for uma
// legada faltando algum campo novo, a coluna inteira sumiria da planilha).
const HEADERS_BY_SHEET = {
  Clientes: CLIENTES_HEADERS,
  Agenda: AGENDA_HEADERS,
  Lembretes: LEMBRETES_HEADERS,
  Categorias: CATEGORIAS_HEADERS,
  Acoes: ACOES_HEADERS,
  Modelos: MODELOS_HEADERS,
  Cadencias: CADENCIAS_HEADERS,
  AgendaSeries: AGENDA_SERIES_HEADERS,
  AgilWorkspaces: AGIL_WORKSPACES_HEADERS,
  AgilBoards: AGIL_BOARDS_HEADERS,
  AgilColunas: AGIL_COLUNAS_HEADERS,
  AgilTarefas: AGIL_TAREFAS_HEADERS,
  AgilSwimlanes: AGIL_SWIMLANES_HEADERS,
  AgilFrentes: AGIL_FRENTES_HEADERS,
  AgilSubtarefas: AGIL_SUBTAREFAS_HEADERS,
  AgilComentarios: AGIL_COMENTARIOS_HEADERS,
  AnalisesIA: ANALISES_IA_HEADERS,
  AcoesIA: ACOES_IA_HEADERS,
  MemoriaIA: MEMORIA_IA_HEADERS,
  UsoIA: USO_IA_HEADERS,
};

// Cadências padrão (dias) — prazos das recomendações.
const CADENCIAS_SEED = [
  { chave: 'reuniao_dias', valor: 30 },
  { chave: 'relatorio_dias', valor: 45 },
  { chave: 'primeiro_contato_dias', valor: 14 },
  { chave: 'esfriando_dias', valor: 45 },
  // Cadência-alvo por serviço (dias) — usada na fila de priorização por serviço.
  { chave: 'monitoria_dias', valor: 30 },
  { chave: 'price_dias', valor: 30 },
  { chave: 'recontato_dias', valor: 5 },
  { chave: 'peso_contato_recente', valor: 50 },
];

// Modelos/materiais por segmento (o que enviar).
const MODELOS_SEED = [
  { segmento: 'frio', titulo: 'Apresentação institucional', conteudo: 'Olá, {empresa}! Aqui é da 2D Consultores. Trabalhamos com monitoria e precificação para melhorar sua margem. Podemos agendar um diagnóstico rápido?' },
  { segmento: 'frio', titulo: 'Case de resultado', conteudo: 'Olá, {empresa}! Um cliente do seu segmento reduziu perdas e ganhou margem com nossa monitoria. Posso te mostrar como em 20 min?' },
  { segmento: 'esfriando', titulo: 'Retomada de contato', conteudo: 'Olá, {empresa}! Faz um tempo que não conversamos. Preparei um panorama atualizado — quando podemos reunir?' },
  { segmento: 'engajado', titulo: 'Pauta de reunião mensal', conteudo: 'Pauta {empresa}: 1) Resultados do mês 2) Precificação 3) Próximas ações 4) Dúvidas.' },
  { segmento: 'engajado', titulo: 'Envio de relatório mensal', conteudo: 'Olá, {empresa}! Segue o relatório de monitoria do mês. Fico à disposição para comentar os pontos de atenção.' },
];

// Seed inicial das categorias (a partir dos valores reais já existentes no banco).
const CATEGORIAS_SEED = [
  ['servico', ['Monitoria', 'Precificação', 'Controladoria', 'OptiMarco', 'AutoTech', 'Book Fiscal', 'Raptor', 'Protocolo GPS']],
  ['tipo_evento', ['Reunião', 'Contato', 'Relatório', 'Ligação', 'Precificação']],
  ['status_cliente', ['Regular', 'Suspenso', 'Problemas Externos', 'Gratuidade', 'Atendido pelo Marco']],
  ['status_evento', ['Agendado', 'Pendente', 'Concluído', 'Cancelado', 'Realizado', 'Reagendado']],
  ['monitor', ['Yann Cruz', 'Erick Cardoso', 'Karol Santana', 'Administrador']],
  ['tipo_lembrete', ['Contato', 'Reunião', 'Relatório', 'Alvo', 'Outro']],
  ['prioridade_tarefa', ['Baixa', 'Média', 'Alta', 'Urgente']],
  // Segmento de negócio do cliente — contexto pra análise/dossiê/conversa (não
  // é o "estado"/"status" de atendimento, que já existem). Seed alinhado ao
  // perfil real da carteira (2D atende autopeças/oficinas/distribuidoras);
  // editável em Configurações como qualquer outra categoria.
  ['local_cliente', ['Autopeça', 'Oficina', 'Distribuidora', 'Atacado', 'Indústria', 'Varejo']],
];

module.exports = {
  HOST, PORT, CEO_AGENDA_CALENDAR_ID, CEO_AGENDA_OAUTH_CLIENT_PATH, CEO_AGENDA_OAUTH_TOKEN_PATH,
  ONEDRIVE_ROOT, DATA_DIR, REUNIOES_DIR, DB_FILE, UPLOADS_DIR, SQLITE_DIR, SQLITE_FILE, BACKUP_ONEDRIVE_DIR,
  ALVOS_DIR, ALVOS_ARQUIVO,
  SNAPSHOT_DIR, SNAPSHOT_FILE, DOSSIES_DIR, OLLAMA_URL, OLLAMA_MODEL, OLLAMA_MODELS, OLLAMA_API_KEY,
  CONFIG_IA_COMPARTILHADO,
  IA_PROVIDER, IA_PROVIDERS, CLAUDE_STATE_FILE, CLAUDE_CLI_PATH, CLAUDE_CLI_MODEL,
  CLAUDE_CLI_MODEL_PADRAO, CLAUDE_CLI_MODELOS,
  CLAUDE_CLI_TIMEOUT_MS, CLAUDE_CLI_CWD, CLAUDE_MCP_SERVER,
  CLIENTES_HEADERS, AGENDA_HEADERS, LEMBRETES_HEADERS, CATEGORIAS_HEADERS, ACOES_HEADERS, MODELOS_HEADERS, CADENCIAS_HEADERS,
  AGENDA_SERIES_HEADERS,
  AGIL_WORKSPACES_HEADERS, AGIL_BOARDS_HEADERS, AGIL_COLUNAS_HEADERS, AGIL_TAREFAS_HEADERS, AGIL_SWIMLANES_HEADERS, AGIL_SUBTAREFAS_HEADERS, AGIL_COMENTARIOS_HEADERS, AGIL_FRENTES_HEADERS,
  ANALISES_IA_HEADERS, ACOES_IA_HEADERS, MEMORIA_IA_HEADERS, USO_IA_HEADERS,
  HEADERS_BY_SHEET,
  CADENCIAS_SEED, MODELOS_SEED, CATEGORIAS_SEED,
};
