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
const HOST = process.env.APP_HOST || '192.168.1.10';

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
// Pasta onde cada reunião é gravada como .json (integração com outro sistema).
const REUNIOES_DIR = path.join(DATA_DIR, 'reunioes_json');

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
const CLIENTES_HEADERS = ['id', 'createdAt', 'empresa', 'monitor', 'servicos', 'observacao', 'status', 'atendidoMarco', 'tipoAnalise', 'grupo', 'suspenso', 'monitoria', 'price', 'controladoria', 'lastContact', 'lastMeeting', 'userId'];
const AGENDA_HEADERS = ['id', 'createdAt', 'clientId', 'clientName', 'type', 'subject', 'date', 'time', 'duracao', 'description', 'status', 'servicos', 'checklist', 'preAnalise', 'ata', 'resumo', 'serie', 'attachments', 'userId'];
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

function seedComMetadados(rows, extra) {
  const now = new Date().toISOString();
  return rows.map((r) => ({ id: crypto.randomUUID(), createdAt: now, ...extra, ...r }));
}

// Seed inicial das categorias (a partir dos valores reais já existentes no banco).
const CATEGORIAS_SEED = [
  ['servico', ['Monitoria', 'Precificação']],
  ['tipo_evento', ['Reunião', 'Precificação', 'Contato', 'Relatório']],
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
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(seedComMetadados(MODELOS_SEED), { header: MODELOS_HEADERS }), 'Modelos');
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
      { nome: 'Modelos', header: MODELOS_HEADERS, rows: seedComMetadados(MODELOS_SEED) },
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
};

function saveSheetData(sheetName, data) {
  const wb = comRetryIO(() => xlsx.readFile(DB_FILE));
  const header = HEADERS_BY_SHEET[sheetName];
  wb.Sheets[sheetName] = header ? xlsx.utils.json_to_sheet(data, { header }) : xlsx.utils.json_to_sheet(data);
  comRetryIO(() => xlsx.writeFile(wb, DB_FILE));
}

/**
 * Atualiza (merge) a linha de id `id` na planilha `sheetName`. `transform`,
 * se passado, recebe o objeto já mesclado e devolve o objeto final a gravar
 * (usado por rotas que precisam normalizar/derivar campos, ex.: Clientes e
 * Acoes). Devolve a linha atualizada, ou `null` se nenhum id bateu — permite
 * às rotas responderem 404 em vez de "success: true" silencioso.
 */
function updateSheetRow(sheetName, id, patch, transform) {
  const data = getSheetData(sheetName);
  let updated = null;
  const next = data.map((row) => {
    if (String(row.id) !== String(id)) return row;
    const merged = { ...row, ...patch };
    updated = transform ? transform(merged) : merged;
    return updated;
  });
  if (updated) saveSheetData(sheetName, next);
  return updated;
}

/** Remove a linha de id `id` na planilha `sheetName`. Devolve `true` se algo
 * foi de fato removido — permite às rotas responderem 404 quando o id não existe. */
function deleteSheetRow(sheetName, id) {
  const data = getSheetData(sheetName);
  const next = data.filter((row) => String(row.id) !== String(id));
  const found = next.length !== data.length;
  if (found) saveSheetData(sheetName, next);
  return found;
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
  } catch {
    console.error(`syncClienteColumns: servicos não era JSON válido para "${cliente.empresa}" — resetado para [] em vez de perder o save. Valor recebido:`, cliente.servicos);
    servicos = [];
  }
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
  // id gerado aqui, não confiado do cliente (o frontend já usa a resposta desta
  // rota, não o id que ele mesmo enviou, para popular o estado local — troca
  // segura, sem mudança de contrato). O create em lote abaixo é a exceção: ainda
  // confia no id do cliente, pois o caller (criarClientesEmLote) usa os ids que
  // ele mesmo gerou para popular o estado local sem reler a resposta — mudar
  // exigiria também mudar esse contrato, fora do escopo desta correção pontual.
  const newClient = syncClienteColumns({ ...req.body, id: crypto.randomUUID() });
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
  const updated = updateSheetRow('Clientes', req.params.id, req.body, syncClienteColumns);
  if (!updated) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json({ success: true });
});

app.delete('/api/clients/:id', (req, res) => {
  const found = deleteSheetRow('Clientes', req.params.id);
  if (!found) return res.status(404).json({ error: 'Cliente não encontrado.' });

  // Cascade delete: agenda, lembretes e ações vinculados a este cliente
  // (antes só cascateava para Agenda — Lembretes/Acoes ficavam órfãos).
  const agendaRestante = getSheetData('Agenda').filter(a => String(a.clientId) !== String(req.params.id));
  saveSheetData('Agenda', agendaRestante);
  const lembretesRestantes = getSheetData('Lembretes').filter(r => String(r.clientId) !== String(req.params.id));
  saveSheetData('Lembretes', lembretesRestantes);
  const acoesRestantes = getSheetData('Acoes').filter(a => String(a.clientId) !== String(req.params.id));
  saveSheetData('Acoes', acoesRestantes);

  res.json({ success: true });
});

// --- Agenda API ---
app.get('/api/agenda', (req, res) => {
  res.json(getSheetData('Agenda'));
});

// --- Exportação de reuniões em JSON (uma por arquivo, para outro sistema) ---
function parseMaybe(v, def) {
  if (v == null) return def;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return def; }
}
function sanitizeNome(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'reuniao';
}
function eventoParaJson(ev) {
  return {
    id: ev.id, clientId: ev.clientId, clientName: ev.clientName,
    tipo: ev.type, assunto: ev.subject, data: ev.date, hora: ev.time || '', duracao: ev.duracao || null,
    status: ev.status, servicos: parseMaybe(ev.servicos, []), checklist: parseMaybe(ev.checklist, []),
    preAnalise: parseMaybe(ev.preAnalise, { orientacoes: [], clientesGeral: '', produtosGeral: '' }),
    ata: ev.ata || '', resumo: ev.resumo || '', descricao: ev.description || '',
    anexos: parseMaybe(ev.attachments, []), serie: ev.serie || '', createdAt: ev.createdAt,
    exportedAt: new Date().toISOString(),
  };
}
function nomeArquivoReuniao(ev) {
  const d = String(ev.date || '').slice(0, 10) || 'sem-data';
  return `${d}__${sanitizeNome(ev.clientName)}__${ev.id}.json`;
}
function removerReuniaoJson(id) {
  try {
    if (!fs.existsSync(REUNIOES_DIR)) return;
    for (const f of fs.readdirSync(REUNIOES_DIR)) if (f.endsWith(`__${id}.json`)) fs.unlinkSync(path.join(REUNIOES_DIR, f));
  } catch (e) { console.error('Falha ao remover JSON da reunião:', e.message); }
}
function gravarReuniaoJson(ev) {
  try {
    if (!fs.existsSync(REUNIOES_DIR)) fs.mkdirSync(REUNIOES_DIR, { recursive: true });
    removerReuniaoJson(ev.id);
    fs.writeFileSync(path.join(REUNIOES_DIR, nomeArquivoReuniao(ev)), JSON.stringify(eventoParaJson(ev), null, 2), 'utf8');
  } catch (e) { console.error('Falha ao gravar JSON da reunião:', e.message); }
}

app.post('/api/agenda', (req, res) => {
  const data = getSheetData('Agenda');
  // id gerado aqui (não confiado do cliente) — o frontend já usa a resposta
  // desta rota (não o id que ele mesmo enviou) para popular estado local e
  // encadear ações seguintes (ex.: criar lembrete vinculado ao evento recém-criado).
  const newItem = { ...req.body, id: crypto.randomUUID() };
  data.push(newItem);
  saveSheetData('Agenda', data);
  gravarReuniaoJson(newItem);
  res.json(newItem);
});

app.post('/api/agenda/bulk', (req, res) => {
  const data = getSheetData('Agenda');
  const newItems = req.body;
  const updatedData = [...data, ...newItems];
  saveSheetData('Agenda', updatedData);
  newItems.forEach(gravarReuniaoJson);
  res.json({ success: true, count: newItems.length });
});

// Backfill: (re)grava todas as reuniões existentes como JSON na pasta.
app.post('/api/agenda/export-json', (req, res) => {
  const data = getSheetData('Agenda');
  data.forEach(gravarReuniaoJson);
  res.json({ success: true, count: data.length, pasta: REUNIOES_DIR });
});

app.put('/api/agenda/:id', (req, res) => {
  const updated = updateSheetRow('Agenda', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Evento não encontrado.' });
  gravarReuniaoJson(updated);
  res.json({ success: true });
});

app.delete('/api/agenda/:id', (req, res) => {
  const found = deleteSheetRow('Agenda', req.params.id);
  if (!found) return res.status(404).json({ error: 'Evento não encontrado.' });
  removerReuniaoJson(req.params.id);
  res.json({ success: true });
});

// --- Lembretes API ---
app.get('/api/reminders', (req, res) => {
  res.json(getSheetData('Lembretes'));
});

app.post('/api/reminders', (req, res) => {
  const data = getSheetData('Lembretes');
  // id gerado aqui, mesma razão das rotas de Clientes/Agenda acima.
  const newItem = { ...req.body, id: crypto.randomUUID() };
  data.push(newItem);
  saveSheetData('Lembretes', data);
  res.json(newItem);
});

app.put('/api/reminders/:id', (req, res) => {
  const updated = updateSheetRow('Lembretes', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Lembrete não encontrado.' });
  res.json({ success: true });
});

app.delete('/api/reminders/:id', (req, res) => {
  const found = deleteSheetRow('Lembretes', req.params.id);
  if (!found) return res.status(404).json({ error: 'Lembrete não encontrado.' });
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
  const updated = updateSheetRow('Categorias', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ success: true });
});

app.delete('/api/categorias/:id', (req, res) => {
  const found = deleteSheetRow('Categorias', req.params.id);
  if (!found) return res.status(404).json({ error: 'Categoria não encontrada.' });
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
  const updated = updateSheetRow('Acoes', req.params.id, req.body, (row) => ({ ...row, updatedAt: new Date().toISOString() }));
  if (!updated) return res.status(404).json({ error: 'Ação não encontrada.' });
  res.json({ success: true });
});

app.delete('/api/acoes/:id', (req, res) => {
  const found = deleteSheetRow('Acoes', req.params.id);
  if (!found) return res.status(404).json({ error: 'Ação não encontrada.' });
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
  const updated = updateSheetRow('Modelos', req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Modelo não encontrado.' });
  res.json({ success: true });
});

app.delete('/api/modelos/:id', (req, res) => {
  const found = deleteSheetRow('Modelos', req.params.id);
  if (!found) return res.status(404).json({ error: 'Modelo não encontrado.' });
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
  for (const [chave, valor] of Object.entries(body)) {
    if (!Number.isFinite(Number(valor))) {
      return res.status(400).json({ error: `Valor inválido para "${chave}": ${JSON.stringify(valor)} não é um número.` });
    }
  }
  const rows = Object.entries(body).map(([chave, valor]) => ({ chave, valor: Number(valor) }));
  saveSheetData('Cadencias', rows);
  res.json({ success: true });
});

const PORT = 3001;
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} (acesso pela intranet)`);
  console.log(`Dados salvos em: ${DATA_DIR}`);
});
