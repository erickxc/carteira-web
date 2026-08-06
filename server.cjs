const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { HOST, PORT, DATA_DIR } = require('./server/config.cjs');
const { initDB } = require('./server/db.cjs');
const { backupDiario } = require('./server/backup.cjs');
const { registerUploads } = require('./server/routes/uploads.cjs');
const { gerarRelatoriosPendentes } = require('./server/relatoriosAutomaticos.cjs');

const app = express();

app.use(cors({
  origin: [`http://${HOST}:5173`, 'http://localhost:5173', 'http://127.0.0.1:5173']
}));
app.use(express.json());

initDB();

// Snapshot diário do banco. Roda no boot (a máquina pode ter ficado desligada
// no horário do cron) e todo dia às 5h. Falha aqui nunca deve impedir o
// servidor de subir — sem backup o app funciona; sem app, ninguém trabalha.
function rodarBackup(origem) {
  try {
    const criado = backupDiario();
    if (criado) console.log(`Backup (${origem}): ${criado}`);
  } catch (err) {
    console.warn(`Falha ao gerar backup (${origem}):`, err.message);
  }
}
rodarBackup('boot');
cron.schedule('0 5 * * *', () => rodarBackup('cron diário'));

registerUploads(app); // /uploads (estático) + /api/uploads (CRUD)
app.use('/api/clients', require('./server/routes/clients.cjs'));
app.use('/api/agenda', require('./server/routes/agenda.cjs'));
app.use('/api/reminders', require('./server/routes/reminders.cjs'));
app.use('/api/categorias', require('./server/routes/categorias.cjs'));
app.use('/api/acoes', require('./server/routes/acoes.cjs'));
app.use('/api/modelos', require('./server/routes/modelos.cjs'));
app.use('/api/cadencias', require('./server/routes/cadencias.cjs'));

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} (acesso pela intranet)`);
  console.log(`Dados salvos em: ${DATA_DIR}`);
});

// Cadência de relatório por cliente: mantém sempre 1 relatório futuro pendente
// por cliente configurado, gerando o próximo quando falta. Roda 1x no boot
// (cobre a máquina ter ficado desligada/deslogada numa sexta) e depois toda
// sexta-feira às 6h — sem isso o relatório só apareceria na agenda quando
// alguém abrisse o app numa sexta, o que não é garantido nesta máquina.
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
