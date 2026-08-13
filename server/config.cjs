const fs = require('fs');
const path = require('path');

// Em produção (Apache/XAMPP como proxy reverso), o Node só precisa ser
// alcançável pelo Apache na própria máquina — por isso o default é loopback,
// nunca exposto direto na rede. Defina APP_HOST se precisar rodar `npm start`
// (dev, sem Apache) acessível por outras máquinas na LAN diretamente.
// O app NÃO tem autenticação: expor na rede deixa os dados acessíveis a
// qualquer um que alcance essa porta — decisão explícita do usuário.
const HOST = process.env.APP_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3001;

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
 */
const ONEDRIVE_ROOT = process.env.ONEDRIVE_ROOT || 'C:/Users/Kerol/OneDrive - 2dconsultores.com.br/01 - Marco + Monitores/6 - Erick';
const DATA_DIR = path.join(ONEDRIVE_ROOT, 'Carteira Web');
// Credenciais OAuth (Google Cloud) usadas só para ler a Agenda do CEO — ficam
// fora do repositório, junto com o resto dos dados sensíveis no OneDrive.
const CEO_AGENDA_OAUTH_CLIENT_PATH = process.env.CEO_AGENDA_OAUTH_CLIENT_PATH || path.join(DATA_DIR, 'ceo-agenda-oauth-client.json');
const CEO_AGENDA_OAUTH_TOKEN_PATH = process.env.CEO_AGENDA_OAUTH_TOKEN_PATH || path.join(DATA_DIR, 'ceo-agenda-oauth-token.json');
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
// `lastPricing`/`lojas` (Clientes) e `sala`/`notifiedDay`/`notes` (Agenda) já
// existem na planilha real mas faltavam aqui — saveSheetData reescreve a aba
// inteira com json_to_sheet(dados, { header }), então qualquer coluna fora
// dessa lista era apagada de TODAS as linhas a cada save (`sala` é campo ativo,
// gravado pelo EventFormModal — bug real de perda de dado, não só legado).
const CLIENTES_HEADERS = ['id', 'createdAt', 'empresa', 'monitor', 'servicos', 'servicosIndependentes', 'contatos', 'observacao', 'estado', 'status', 'tipoAnalise', 'grupo', 'suspenso', 'monitoria', 'price', 'controladoria', 'lastContact', 'lastMeeting', 'lastPricing', 'userId', 'lojas', 'relatorioCadencia'];
// `origem` = de quem partiu a interação ('nos' | 'cliente'). Vazio nos eventos
// antigos (tratado como não informado, nunca como 'nos') — é o que permite
// separar contato que NÓS fizemos de contato que o CLIENTE fez.
const AGENDA_HEADERS = ['id', 'createdAt', 'clientId', 'clientName', 'type', 'subject', 'date', 'time', 'duracao', 'description', 'status', 'motivo', 'monitores', 'sala', 'origem', 'reagendamentos', 'servicos', 'checklist', 'preAnalise', 'ata', 'resumo', 'serie', 'attachments', 'userId', 'notifiedDay', 'notes'];
const LEMBRETES_HEADERS = ['id', 'createdAt', 'title', 'datetime', 'description', 'status', 'clientId', 'eventId', 'recurrence', 'type', 'userId'];
const CATEGORIAS_HEADERS = ['id', 'tipo', 'valor', 'ordem', 'createdAt'];
const ACOES_HEADERS = ['id', 'clientId', 'tipo', 'segmento', 'status', 'servico', 'monitor', 'notes', 'dueAt', 'createdAt', 'updatedAt'];
const MODELOS_HEADERS = ['id', 'segmento', 'titulo', 'conteudo', 'createdAt'];
const CADENCIAS_HEADERS = ['chave', 'valor'];

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
  ['servico', ['Monitoria', 'Precificação']],
  ['tipo_evento', ['Reunião', 'Contato', 'Relatório', 'Ligação']],
  ['status_cliente', ['Regular', 'Suspenso', 'Problemas Externos', 'Gratuidade', 'Atendido pelo Marco']],
  ['status_evento', ['Agendado', 'Pendente', 'Concluído', 'Cancelado', 'Realizado', 'Reagendado']],
  ['monitor', ['Yann Cruz', 'Erick Cardoso', 'Karol Santana', 'Administrador']],
  ['tipo_lembrete', ['Contato', 'Reunião', 'Relatório', 'Alvo', 'Outro']],
];

module.exports = {
  HOST, PORT, CEO_AGENDA_CALENDAR_ID, CEO_AGENDA_OAUTH_CLIENT_PATH, CEO_AGENDA_OAUTH_TOKEN_PATH,
  ONEDRIVE_ROOT, DATA_DIR, REUNIOES_DIR, DB_FILE, UPLOADS_DIR,
  CLIENTES_HEADERS, AGENDA_HEADERS, LEMBRETES_HEADERS, CATEGORIAS_HEADERS, ACOES_HEADERS, MODELOS_HEADERS, CADENCIAS_HEADERS,
  HEADERS_BY_SHEET,
  CADENCIAS_SEED, MODELOS_SEED, CATEGORIAS_SEED,
};
