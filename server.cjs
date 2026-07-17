const express = require('express');
const cors = require('cors');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();

// Host de acesso na intranet. Se o IP da máquina mudar (DHCP), ajuste aqui
// (ou defina a env APP_HOST). O app NÃO tem autenticação: expor na rede deixa
// os dados acessíveis a qualquer um na intranet — decisão explícita do usuário.
const HOST = process.env.APP_HOST || '192.168.1.18';

app.use(cors({
  origin: [`http://${HOST}:5173`, 'http://localhost:5173', 'http://127.0.0.1:5173']
}));
app.use(express.json());

/**
 * Todos os dados (planilha + anexos) vivem DENTRO do OneDrive do usuário —
 * nunca na pasta do projeto nem em qualquer outro lugar. É intencional:
 * o backup/sincronização fica a cargo do OneDrive, e não deve existir um
 * segundo caminho onde os dados possam acabar sendo gravados por engano.
 * Não adicione fallback para pasta local aqui — se o OneDrive não estiver
 * disponível, o servidor deve falhar ao iniciar, não gravar em outro lugar.
 */
const ONEDRIVE_ROOT = 'C:/Users/Monitor1-2D/OneDrive - 2dconsultores.com.br/01 - Marco + Monitores/6 - Erick';
const DATA_DIR = path.join(ONEDRIVE_ROOT, 'Carteira Web');

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

// Banco de desenvolvimento/sandbox (schema novo). O banco real da 2D fica em
// ../database.xlsx (pasta "6 - Erick"); a virada para ele será feita depois.
const DB_FILE = path.join(DATA_DIR, 'database_dev.xlsx');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Colunas alinhadas ao banco real (6 - Erick\database.xlsx) + adições do app
// (monitor, servicos, subject, attachments). As colunas antigas
// monitoria/price/controladoria + suspenso são mantidas e sincronizadas a
// partir de servicos/status no save, para não quebrar o schema real na virada.
const CLIENTES_HEADERS = ['id', 'createdAt', 'empresa', 'monitor', 'servicos', 'observacao', 'status', 'atendidoMarco', 'tipoAnalise', 'lojas', 'suspenso', 'monitoria', 'price', 'controladoria', 'lastContact', 'lastMeeting', 'userId'];
const AGENDA_HEADERS = ['id', 'createdAt', 'clientId', 'clientName', 'type', 'subject', 'date', 'description', 'status', 'servicos', 'attachments', 'userId'];
const LEMBRETES_HEADERS = ['id', 'createdAt', 'title', 'datetime', 'description', 'status', 'clientId', 'eventId', 'recurrence', 'type', 'userId'];
const CATEGORIAS_HEADERS = ['id', 'tipo', 'valor', 'ordem', 'createdAt'];
const ACOES_HEADERS = ['id', 'clientId', 'tipo', 'segmento', 'status', 'notes', 'dueAt', 'createdAt', 'updatedAt'];
const MODELOS_HEADERS = ['id', 'segmento', 'titulo', 'conteudo', 'createdAt'];
const CADENCIAS_HEADERS = ['chave', 'valor'];

// Cadências padrão (dias) — prazos das recomendações.
const CADENCIAS_SEED = [
  { chave: 'reuniao_dias', valor: 30 },
  { chave: 'relatorio_dias', valor: 45 },
  { chave: 'primeiro_contato_dias', valor: 14 },
  { chave: 'esfriando_dias', valor: 45 },
];

// Modelos/materiais por segmento (o que enviar).
const MODELOS_SEED = [
  { segmento: 'frio', titulo: 'Apresentação institucional', conteudo: 'Olá, {empresa}! Aqui é da 2D Consultores. Trabalhamos com monitoria e precificação para melhorar sua margem. Podemos agendar um diagnóstico rápido?' },
  { segmento: 'frio', titulo: 'Case de resultado', conteudo: 'Olá, {empresa}! Um cliente do seu segmento reduziu perdas e ganhou margem com nossa monitoria. Posso te mostrar como em 20 min?' },
  { segmento: 'esfriando', titulo: 'Retomada de contato', conteudo: 'Olá, {empresa}! Faz um tempo que não conversamos. Preparei um panorama atualizado — quando podemos reunir?' },
  { segmento: 'engajado', titulo: 'Pauta de reunião mensal', conteudo: 'Pauta {empresa}: 1) Resultados do mês 2) Precificação 3) Próximas ações 4) Dúvidas.' },
  { segmento: 'engajado', titulo: 'Envio de relatório mensal', conteudo: 'Olá, {empresa}! Segue o relatório de monitoria do mês. Fico à disposição para comentar os pontos de atenção.' },
];

function seedMwith(rows, extra) {
  const now = new Date().toISOString();
  return rows.map((r) => ({ id: crypto.randomUUID(), createdAt: now, ...extra, ...r }));
}

// Seed inicial das categorias (a partir dos valores reais já existentes no banco).
const CATEGORIAS_SEED = [
  ['servico', ['Monitoria', 'Precificação']],
  ['tipo_evento', ['Reunião', 'Precificação', 'Contato']],
  ['status_cliente', ['Ativo', 'Suspenso']],
  ['status_evento', ['Agendado', 'Concluído', 'Cancelado', 'Realizado']],
  ['monitor', ['Yann Cruz', 'Erick Cardoso', 'Karol Santana', 'Administrador']],
  ['tipo_lembrete', ['Reunião', 'Relatório', 'Alvo', 'Outro']],
];

function buildCategoriasSeed() {
  const now = new Date().toISOString();
  const rows = [];
  for (const [tipo, valores] of CATEGORIAS_SEED) {
    valores.forEach((valor, i) => {
      rows.push({ id: crypto.randomUUID(), tipo, valor, ordem: i, createdAt: now });
    });
  }
  return rows;
}

function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: CLIENTES_HEADERS }), 'Clientes');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: AGENDA_HEADERS }), 'Agenda');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: LEMBRETES_HEADERS }), 'Lembretes');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(buildCategoriasSeed(), { header: CATEGORIAS_HEADERS }), 'Categorias');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([], { header: ACOES_HEADERS }), 'Acoes');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(seedMwith(MODELOS_SEED), { header: MODELOS_HEADERS }), 'Modelos');
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(CADENCIAS_SEED, { header: CADENCIAS_HEADERS }), 'Cadencias');
    comRetryIO(() => xlsx.writeFile(wb, DB_FILE));
  } else {
    // Banco já existe: garante a planilha Categorias e faz seed idempotente dos
    // tipos que ainda não existem (ex.: tipo_lembrete adicionado depois), sem
    // tocar nas categorias já cadastradas pelo usuário.
    const wb = comRetryIO(() => xlsx.readFile(DB_FILE));
    let mudou = false;
    let categorias = wb.SheetNames.includes('Categorias')
      ? xlsx.utils.sheet_to_json(wb.Sheets['Categorias'])
      : [];
    if (!wb.SheetNames.includes('Categorias')) {
      categorias = buildCategoriasSeed();
      mudou = true;
    } else {
      const now = new Date().toISOString();
      for (const [tipo, valores] of CATEGORIAS_SEED) {
        if (!categorias.some((c) => c.tipo === tipo)) {
          valores.forEach((valor, i) => categorias.push({ id: crypto.randomUUID(), tipo, valor, ordem: i, createdAt: now }));
          mudou = true;
        }
      }
    }
    if (mudou) {
      wb.Sheets['Categorias'] = xlsx.utils.json_to_sheet(categorias, { header: CATEGORIAS_HEADERS });
      if (!wb.SheetNames.includes('Categorias')) wb.SheetNames.push('Categorias');
      comRetryIO(() => xlsx.writeFile(wb, DB_FILE));
    }

    // Garante as planilhas novas (Acoes/Modelos/Cadencias) sem tocar nas existentes.
    const novas = [
      { nome: 'Acoes', header: ACOES_HEADERS, rows: [] },
      { nome: 'Modelos', header: MODELOS_HEADERS, rows: seedMwith(MODELOS_SEED) },
      { nome: 'Cadencias', header: CADENCIAS_HEADERS, rows: CADENCIAS_SEED },
    ];
    let mudou2 = false;
    for (const s of novas) {
      if (!wb.SheetNames.includes(s.nome)) {
        xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(s.rows, { header: s.header }), s.nome);
        mudou2 = true;
      }
    }
    if (mudou2) comRetryIO(() => xlsx.writeFile(wb, DB_FILE));
  }
}
initDB();

// Sleep síncrono (bloqueia o event loop por poucos ms). Uso pontual para
// aguardar o OneDrive liberar o lock do arquivo entre tentativas de I/O.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * O OneDrive abre o database.xlsx com lock exclusivo durante a sincronização,
 * fazendo leituras/escritas falharem com EBUSY/EPERM de forma intermitente.
 * Reexecuta a operação de I/O algumas vezes com backoff curto antes de desistir.
 */
function comRetryIO(fn) {
  const MAX = 10;
  let ultimoErro;
  for (let tentativa = 1; tentativa <= MAX; tentativa++) {
    try {
      return fn();
    } catch (err) {
      if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
        ultimoErro = err;
        sleepSync(150 * tentativa); // backoff crescente: 150ms, 300ms, ...
        continue;
      }
      throw err;
    }
  }
  throw ultimoErro;
}

function getSheetData(sheetName) {
  const wb = comRetryIO(() => xlsx.readFile(DB_FILE));
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return xlsx.utils.sheet_to_json(sheet) || [];
}

function saveSheetData(sheetName, data) {
  const wb = comRetryIO(() => xlsx.readFile(DB_FILE));
  wb.Sheets[sheetName] = xlsx.utils.json_to_sheet(data);
  comRetryIO(() => xlsx.writeFile(wb, DB_FILE));
}

/**
 * Mantém as colunas legadas do schema real coerentes com os campos novos:
 * - monitoria/price/controladoria (bool) derivados da lista `servicos`
 * - suspenso (bool) derivado do `status`
 * Assim, quando o app virar para o banco real, o app antigo continua enxergando
 * dados consistentes nessas colunas. Recebe/devolve o objeto do cliente.
 */
function syncClienteColumns(cliente) {
  let servicos = [];
  try {
    servicos = Array.isArray(cliente.servicos) ? cliente.servicos : JSON.parse(cliente.servicos || '[]');
  } catch { servicos = []; }
  const has = (nome) => servicos.some((s) => String(s).toLowerCase() === nome);
  return {
    ...cliente,
    monitoria: has('monitoria'),
    price: has('precificação') || has('precificacao') || has('price'),
    controladoria: has('controladoria'),
    suspenso: String(cliente.status || '').toLowerCase() === 'suspenso',
  };
}

// --- Anexos (upload local de arquivos, dentro do OneDrive) ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}-${file.originalname}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use('/uploads', express.static(UPLOADS_DIR));

app.post('/api/uploads', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  res.json({
    id: req.file.filename,
    filename: req.file.filename,
    originalName: req.file.originalname,
    uploadedAt: new Date().toISOString(),
  });
});

app.delete('/api/uploads/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') return res.status(500).json({ error: 'Falha ao remover arquivo.' });
    res.json({ success: true });
  });
});

// --- Clientes API ---
app.get('/api/clients', (req, res) => {
  res.json(getSheetData('Clientes'));
});

app.post('/api/clients', (req, res) => {
  const data = getSheetData('Clientes');
  const newClient = syncClienteColumns(req.body);
  data.push(newClient);
  saveSheetData('Clientes', data);
  res.json(newClient);
});

app.post('/api/clients/bulk', (req, res) => {
  const data = getSheetData('Clientes');
  const newClients = req.body.map(syncClienteColumns); // Array of clients
  const updatedData = [...data, ...newClients];
  saveSheetData('Clientes', updatedData);
  res.json({ success: true, count: newClients.length });
});

app.put('/api/clients/:id', (req, res) => {
  let data = getSheetData('Clientes');
  data = data.map(c => c.id === req.params.id ? syncClienteColumns({ ...c, ...req.body }) : c);
  saveSheetData('Clientes', data);
  res.json({ success: true });
});

app.delete('/api/clients/:id', (req, res) => {
  let data = getSheetData('Clientes');
  data = data.filter(c => String(c.id) !== String(req.params.id));
  saveSheetData('Clientes', data);

  // Cascade delete agenda items
  let agendaData = getSheetData('Agenda');
  agendaData = agendaData.filter(a => String(a.clientId) !== String(req.params.id));
  saveSheetData('Agenda', agendaData);

  res.json({ success: true });
});

// --- Agenda API ---
app.get('/api/agenda', (req, res) => {
  res.json(getSheetData('Agenda'));
});

app.post('/api/agenda', (req, res) => {
  const data = getSheetData('Agenda');
  const newItem = req.body;
  data.push(newItem);
  saveSheetData('Agenda', data);
  res.json(newItem);
});

app.post('/api/agenda/bulk', (req, res) => {
  const data = getSheetData('Agenda');
  const newItems = req.body;
  const updatedData = [...data, ...newItems];
  saveSheetData('Agenda', updatedData);
  res.json({ success: true, count: newItems.length });
});

app.put('/api/agenda/:id', (req, res) => {
  let data = getSheetData('Agenda');
  data = data.map(a => a.id === req.params.id ? { ...a, ...req.body } : a);
  saveSheetData('Agenda', data);
  res.json({ success: true });
});

app.delete('/api/agenda/:id', (req, res) => {
  let data = getSheetData('Agenda');
  data = data.filter(a => String(a.id) !== String(req.params.id));
  saveSheetData('Agenda', data);
  res.json({ success: true });
});

// --- Lembretes API ---
app.get('/api/reminders', (req, res) => {
  res.json(getSheetData('Lembretes'));
});

app.post('/api/reminders', (req, res) => {
  const data = getSheetData('Lembretes');
  const newItem = req.body;
  data.push(newItem);
  saveSheetData('Lembretes', data);
  res.json(newItem);
});

app.put('/api/reminders/:id', (req, res) => {
  let data = getSheetData('Lembretes');
  data = data.map(r => r.id === req.params.id ? { ...r, ...req.body } : r);
  saveSheetData('Lembretes', data);
  res.json({ success: true });
});

app.delete('/api/reminders/:id', (req, res) => {
  let data = getSheetData('Lembretes');
  data = data.filter(r => String(r.id) !== String(req.params.id));
  saveSheetData('Lembretes', data);
  res.json({ success: true });
});

// --- Categorias API (CRUD de serviços, tipos de evento, status, monitores) ---
app.get('/api/categorias', (req, res) => {
  res.json(getSheetData('Categorias'));
});

app.post('/api/categorias', (req, res) => {
  const data = getSheetData('Categorias');
  const { tipo, valor } = req.body;
  if (!tipo || !valor || !String(valor).trim()) {
    return res.status(400).json({ error: 'tipo e valor são obrigatórios.' });
  }
  const jaExiste = data.some((c) => c.tipo === tipo && String(c.valor).toLowerCase() === String(valor).trim().toLowerCase());
  if (jaExiste) return res.status(409).json({ error: 'Categoria já existe.' });
  const ordem = data.filter((c) => c.tipo === tipo).length;
  const nova = { id: crypto.randomUUID(), tipo, valor: String(valor).trim(), ordem, createdAt: new Date().toISOString() };
  data.push(nova);
  saveSheetData('Categorias', data);
  res.json(nova);
});

app.put('/api/categorias/:id', (req, res) => {
  let data = getSheetData('Categorias');
  data = data.map((c) => (String(c.id) === String(req.params.id) ? { ...c, ...req.body } : c));
  saveSheetData('Categorias', data);
  res.json({ success: true });
});

app.delete('/api/categorias/:id', (req, res) => {
  let data = getSheetData('Categorias');
  data = data.filter((c) => String(c.id) !== String(req.params.id));
  saveSheetData('Categorias', data);
  res.json({ success: true });
});

// --- Ações (recomendações tratadas: programado/concluído/dispensado) ---
app.get('/api/acoes', (req, res) => {
  res.json(getSheetData('Acoes'));
});

app.post('/api/acoes', (req, res) => {
  const data = getSheetData('Acoes');
  const now = new Date().toISOString();
  const nova = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...req.body };
  data.push(nova);
  saveSheetData('Acoes', data);
  res.json(nova);
});

app.put('/api/acoes/:id', (req, res) => {
  let data = getSheetData('Acoes');
  data = data.map((a) => (String(a.id) === String(req.params.id) ? { ...a, ...req.body, updatedAt: new Date().toISOString() } : a));
  saveSheetData('Acoes', data);
  res.json({ success: true });
});

app.delete('/api/acoes/:id', (req, res) => {
  let data = getSheetData('Acoes');
  data = data.filter((a) => String(a.id) !== String(req.params.id));
  saveSheetData('Acoes', data);
  res.json({ success: true });
});

// --- Modelos/materiais por segmento ---
app.get('/api/modelos', (req, res) => {
  res.json(getSheetData('Modelos'));
});

app.post('/api/modelos', (req, res) => {
  const data = getSheetData('Modelos');
  const nova = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...req.body };
  data.push(nova);
  saveSheetData('Modelos', data);
  res.json(nova);
});

app.put('/api/modelos/:id', (req, res) => {
  let data = getSheetData('Modelos');
  data = data.map((m) => (String(m.id) === String(req.params.id) ? { ...m, ...req.body } : m));
  saveSheetData('Modelos', data);
  res.json({ success: true });
});

app.delete('/api/modelos/:id', (req, res) => {
  let data = getSheetData('Modelos');
  data = data.filter((m) => String(m.id) !== String(req.params.id));
  saveSheetData('Modelos', data);
  res.json({ success: true });
});

// --- Cadências (prazos das recomendações) ---
app.get('/api/cadencias', (req, res) => {
  const rows = getSheetData('Cadencias');
  const obj = {};
  rows.forEach((r) => { obj[r.chave] = Number(r.valor); });
  res.json(obj);
});

app.put('/api/cadencias', (req, res) => {
  // Recebe objeto { chave: valor } e regrava a planilha inteira.
  const body = req.body || {};
  const rows = Object.entries(body).map(([chave, valor]) => ({ chave, valor: Number(valor) }));
  saveSheetData('Cadencias', rows);
  res.json({ success: true });
});

const PORT = 3001;
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} (acesso pela intranet)`);
  console.log(`Dados salvos em: ${DATA_DIR}`);
});
