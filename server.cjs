const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const { HOST, PORT, DATA_DIR, DB_FILE, SQLITE_FILE } = require('./server/config.cjs');
const { APP_MODE, isServer, isClient } = require('./server/modo.cjs');
const { initDbSqlite } = require('./server/dbSqlite.cjs');
const { backupDiario } = require('./server/backup.cjs');
const { rodarBackupSqlite } = require('./server/backupSqlite.cjs');
const { registerUploads } = require('./server/routes/uploads.cjs');
const { gerarRelatoriosPendentes } = require('./server/relatoriosAutomaticos.cjs');
const { materializarTudo } = require('./server/agendaSeries.cjs');
const { iniciarSincronizacaoPeriodica: iniciarSyncCeoAgenda } = require('./server/ceoAgenda.cjs');
const { rodarCicloComSnapshot } = require('./server/fila/controller.cjs');
const { gerarAnalisesPendentes } = require('./server/ia/analisesAutomaticas.cjs');

console.log(`Modo: ${APP_MODE}`);

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const permitidas = [
      `http://${HOST}:5173`, 'http://localhost:5173', 'http://127.0.0.1:5173',
      // Própria origem do app quando ele serve o front sozinho (launcher/.exe,
      // sem Apache/Vite na frente) — `PORT`, não os `:5173` do Vite dev.
      `http://${HOST}:${PORT}`, `http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`,
    ];
    // Sem Origin (ou `null`) = página aberta via `file://` — é o caso da tela
    // de carregamento do launcher (`launcher/telaCarregando.cjs`), que faz
    // fetch nesta API antes do navegador estar na origem do próprio app.
    // Mesmo nível de confiança do resto do projeto (sem autenticação, LAN
    // local) — não é uma origem de internet arbitrária.
    if (!origin || origin === 'null' || permitidas.includes(origin)) return callback(null, true);
    // `callback(err)` (em vez de `callback(null, false)`) faz o Express tratar
    // como erro de rota e devolver uma página de erro HTML — inclusive pra
    // pedidos de `.js`/`.css` com atributo `crossorigin` (o Vite sempre marca
    // esses assets assim), quebrando o carregamento da página inteira com um
    // MIME type errado em vez de só negar CORS. `callback(null, false)` nega
    // sem lançar: o navegador só não recebe o cabeçalho de CORS liberado.
    callback(null, false);
  }
}));
app.use(express.json());

app.get('/api/status/base', (_req, res) => {
  // Em modo cliente (Etapa 2+) nunca existe um SQLITE_FILE local de verdade
  // (guarda de escrita + `initDbSqlite` suprimido em `server.cjs` — ver
  // `server/modo.cjs`) — checar o arquivo aqui SEMPRE dava 503, travando pra
  // sempre a tela de carregamento do launcher nas 3 máquinas remotas (bug
  // real, encontrado só ao testar numa máquina de verdade). "Saudável" em
  // modo cliente é só "o processo Express está de pé e respondendo".
  if (isClient) {
    return res.json({ ok: true, checkedAt: new Date().toISOString() });
  }
  try {
    // Etapa 1.5: reflete o motor real (SQLite), não mais o Excel — o
    // `database_dev.xlsx` virou export/backup, não é mais lido pelo app.
    const stat = fs.statSync(SQLITE_FILE);
    res.json({ ok: true, updatedAt: stat.mtime.toISOString(), checkedAt: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message, checkedAt: new Date().toISOString() });
  }
});

// Etapa 1.5: SQLite é o motor real (mora fora do OneDrive, ver
// server/config.cjs) — `database_dev.xlsx` deixou de ser lido/escrito pelo
// app, e passa a existir só como export/backup diário (server/backupSqlite.cjs,
// quando implementado). `initDbSqlite()` cria as tabelas (uma por sheet de
// HEADERS_BY_SHEET) e semeia Categorias/Modelos/Cadencias num banco novo.
// Etapa 2: só a máquina "server" (a Karol-2D, dona do banco real) faz isso —
// em `APP_MODE=client` não existe banco local pra inicializar/semear ainda
// (a leitura remota vem do snapshot publicado pelo controller, Etapa 3+); e
// mesmo que houvesse, `initDbSqlite` grava via `saveSheetData`, bloqueado
// pela guarda de escrita em modo cliente (server/dbSqlite.cjs).
if (isServer) initDbSqlite();

// Snapshot diário do banco. Roda no boot (a máquina pode ter ficado desligada
// no horário do cron) e todo dia às 5h. Falha aqui nunca deve impedir o
// servidor de subir — sem backup o app funciona; sem app, ninguém trabalha.
// Só roda na máquina "server" — é a única com um banco real pra fazer backup.
function rodarBackup(origem) {
  try {
    const criado = backupDiario();
    if (criado) console.log(`Backup (${origem}): ${criado}`);
  } catch (err) {
    console.warn(`Falha ao gerar backup (${origem}):`, err.message);
  }
}

// Snapshot do SQLite (motor real) + export `.xlsx` (mirror legível por
// humano) pra pasta do OneDrive — ver server/backupSqlite.cjs. Roda 1x/dia,
// mesmo padrão do backup antigo acima (que continua rodando por ora, sem
// remover, ainda faz cópia do Excel legado). `.backup()` do better-sqlite3 é
// a única API assíncrona do projeto — resto do backend é 100% síncrono.
function rodarBackupSqliteELoggar(origem) {
  rodarBackupSqlite()
    .then(({ sqlitePath, xlsxPath }) => {
      if (sqlitePath) console.log(`Backup SQLite (${origem}): ${sqlitePath}`);
      console.log(`Export Excel (${origem}): ${xlsxPath}`);
    })
    .catch((err) => console.warn(`Falha ao gerar backup do SQLite (${origem}):`, err.message));
}

if (isServer) {
  rodarBackup('boot');
  cron.schedule('0 5 * * *', () => rodarBackup('cron diário'));
  rodarBackupSqliteELoggar('boot');
  cron.schedule('0 5 * * *', () => rodarBackupSqliteELoggar('cron diário'));
}

// Controller da fila (Etapa 4): aplica as operações que as máquinas remotas
// escreveram em filas/pendentes/ e publica o snapshot de leitura pra elas.
// Só na máquina "server" — é a única com o SQLite real. Roda no boot (cobre
// a máquina ter ficado desligada) e a cada minuto — latência aceita pelo
// plano (segundos a minutos até uma escrita remota aparecer como definitiva).
function rodarControllerFila(origem) {
  rodarCicloComSnapshot()
    .then(({ aplicadas, comErro, total }) => {
      if (total > 0) console.log(`Fila (${origem}): ${aplicadas} aplicada(s), ${comErro} com erro, ${total} no total.`);
    })
    .catch((err) => console.warn(`Falha ao processar a fila (${origem}):`, err.message));
}
if (isServer) {
  rodarControllerFila('boot');
  cron.schedule('*/1 * * * *', () => rodarControllerFila('cron 1min'));
}

registerUploads(app); // /uploads (estático) + /api/uploads (CRUD)
app.use('/api/clients', require('./server/routes/clients.cjs'));
// Precisa vir ANTES de '/api/agenda' — senão o router de agenda (que tem
// PUT '/:id') capturaria '/api/agenda/series/x' tratando "series" como id.
app.use('/api/agenda/series', require('./server/routes/agendaSeries.cjs'));
app.use('/api/agenda', require('./server/routes/agenda.cjs'));
app.use('/api/reminders', require('./server/routes/reminders.cjs'));
app.use('/api/categorias', require('./server/routes/categorias.cjs'));
app.use('/api/acoes', require('./server/routes/acoes.cjs'));
app.use('/api/modelos', require('./server/routes/modelos.cjs'));
app.use('/api/cadencias', require('./server/routes/cadencias.cjs'));
app.use('/api/agil/workspaces', require('./server/routes/agilWorkspaces.cjs'));
app.use('/api/agil/boards', require('./server/routes/agilBoards.cjs'));
app.use('/api/agil/colunas', require('./server/routes/agilColunas.cjs'));
app.use('/api/agil/tarefas', require('./server/routes/agilTarefas.cjs'));
app.use('/api/agil/swimlanes', require('./server/routes/agilSwimlanes.cjs'));
app.use('/api/agil/frentes', require('./server/routes/agilFrentes.cjs'));
app.use('/api/agil/subtarefas', require('./server/routes/agilSubtarefas.cjs'));
app.use('/api/agil/comentarios', require('./server/routes/agilComentarios.cjs'));
app.use('/api/fila', require('./server/routes/fila.cjs'));
app.use('/api/atualizacao', require('./server/routes/atualizacao.cjs'));
app.use('/api/sistema', require('./server/routes/sistemaLocal.cjs'));
app.use('/api/reunioes', require('./server/routes/reunioes.cjs'));
app.use('/api/ceo-agenda', require('./server/routes/ceoAgenda.cjs'));
app.use('/api/ia', require('./server/routes/analiseIA.cjs'));
// Router separado no MESMO prefixo: configuracao do provedor de IA, login da
// conta Claude (Claude Code CLI) e o canal interno do servidor MCP.
app.use('/api/ia', require('./server/routes/iaProvedor.cjs'));

// Agenda do CEO (Google Calendar, somente leitura): camada isolada, não usa
// db.cjs nem sheets do Excel — uma falha aqui nunca deve impedir o boot.
// Só na máquina "server": é ela que grava o resultado da sincronização.
if (isServer) {
  try {
    iniciarSyncCeoAgenda();
  } catch (err) {
    console.warn('Falha ao iniciar sincronização da Agenda do CEO:', err.message);
  }
}

// Serve o build do frontend (`dist/`) quando ele existe ao lado deste
// arquivo — é o caso do `.exe`/launcher (`launcher/index.cjs`), que sobe só
// este `server.cjs`, sem Apache/Vite na frente pra servir o HTML. Em
// produção normal (Apache) e em dev (Vite em :5173) isso nunca entra em jogo
// — cada um já serve o front do seu jeito, e aqui não haveria `dist/` (dev)
// ou o Apache nem chega a repassar pedidos de página pro Node (produção).
// Fallback SPA (React Router): qualquer rota que não seja `/api` ou
// `/uploads` devolve `index.html`, senão um F5 numa rota como `/clientes/123`
// daria 404 em vez de deixar o React Router decidir.
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} (acesso pela intranet)`);
  console.log(`Dados salvos em: ${DATA_DIR}`);
});

// Cadência de relatório por cliente: mantém sempre 1 relatório futuro pendente
// por cliente configurado, gerando o próximo quando falta. Roda 1x no boot
// (cobre a máquina ter ficado desligada/deslogada numa sexta) e depois toda
// sexta-feira às 6h — sem isso o relatório só apareceria na agenda quando
// alguém abrisse o app numa sexta, o que não é garantido nesta máquina.
if (isServer) {
  try {
    const criados = gerarRelatoriosPendentes();
    if (criados > 0) console.log(`Relatórios automáticos: ${criados} gerado(s) no boot.`);
  } catch (err) {
    console.warn('Falha ao gerar relatórios automáticos no boot:', err.message);
  }
  cron.schedule('0 6 * * 5', () => {
    try {
      const criados = gerarRelatoriosPendentes();
      console.log(`Relatórios automáticos (cron de sexta): ${criados} gerado(s).`);
    } catch (err) {
      console.warn('Falha ao gerar relatórios automáticos (cron):', err.message);
    }
  });
}

// Séries recorrentes de agenda (Reunião/Contato/Relatório/Ligação): mantém as
// ocorrências do mês corrente criadas conforme ele vai passando, em vez do
// formulário gerar meses inteiros de uma vez ao salvar. Roda 1x no boot (cobre
// a máquina ter ficado desligada na virada do mês) e todo dia às 6h — diário,
// não semanal como o de relatório, porque uma regra semanal/diária precisa de
// granularidade de dia, não de semana.
if (isServer) {
  try {
    const criadosSeries = materializarTudo();
    if (criadosSeries > 0) console.log(`Séries de agenda: ${criadosSeries} evento(s) gerado(s) no boot.`);
  } catch (err) {
    console.warn('Falha ao materializar séries de agenda no boot:', err.message);
  }
  cron.schedule('0 6 * * *', () => {
    try {
      const criadosSeries = materializarTudo();
      if (criadosSeries > 0) console.log(`Séries de agenda (cron diário): ${criadosSeries} evento(s) gerado(s).`);
    } catch (err) {
      console.warn('Falha ao materializar séries de agenda (cron):', err.message);
    }
  });
}

// Análise de IA por cliente (LLM local via Ollama): mantém dossiê + sinais de
// risco atualizados sempre que houve reunião nova concluída/cancelada/
// reagendada desde a última rodada. Roda 1x no boot e depois toda
// segunda-feira às 7h — mesmo padrão dos crons acima. Depende do Ollama
// (`ollama serve`) estar de pé nesta máquina; erro de conexão é isolado por
// cliente dentro de `gerarAnalisesPendentes`, não derruba o boot.
// `IA_SKIP_BOOT=1` pula só a rodada de boot (cron semanal continua registrado)
// — usado ao subir uma segunda instância local (dev/teste) contra o mesmo
// banco real de uma máquina que já tem produção rodando, pra não disparar a
// carteira inteira de novo a cada reinício de teste.
if (isServer) {
  if (process.env.IA_SKIP_BOOT) {
    console.log('Análises de IA: pulando rodada de boot (IA_SKIP_BOOT=1).');
  } else {
    gerarAnalisesPendentes()
      .then((processados) => { if (processados > 0) console.log(`Análises de IA: ${processados} cliente(s) atualizado(s) no boot.`); })
      .catch((err) => console.warn('Falha ao gerar análises de IA no boot:', err.message));
  }
  cron.schedule('0 7 * * 1', () => {
    gerarAnalisesPendentes()
      .then((processados) => console.log(`Análises de IA (cron de segunda): ${processados} cliente(s) atualizado(s).`))
      .catch((err) => console.warn('Falha ao gerar análises de IA (cron):', err.message));
  });
}
