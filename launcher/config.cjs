const path = require('path');
const os = require('os');

// Pasta sugerida na pergunta de primeira execução (ver `launcher/primeiraExecucao.cjs`)
// — raiz do C:\, não uma pasta funda em AppData: mais fácil de achar/lembrar
// pra quem não é técnico, e evita o limite de caminho longo do Windows (a
// pasta da release + node_modules + Node portátil já é bem aninhada por si só).
const PASTA_PADRAO_SUGERIDA = process.env.CARTEIRA_INSTALL_DIR || 'C:\\SistemaCarteira';

// Arquivo fixo que lembra ONDE a pessoa escolheu instalar — fica fora da
// própria pasta de instalação de propósito (senão seria "preciso saber onde
// está instalado pra saber onde está instalado").
const PONTEIRO_INSTALL = process.env.CARTEIRA_PONTEIRO_INSTALL
  || path.join(os.homedir(), 'AppData', 'Local', 'CarteiraLauncher', 'pasta-instalacao.txt');

function caminhosDe(installDir) {
  return {
    INSTALL_DIR: installDir,
    APP_DIR: path.join(installDir, 'app'),
    VERSAO_ARQUIVO: path.join(installDir, 'versao-instalada.txt'),
  };
}

// Mesma pasta usada pelo backup diário (server/config.cjs: BACKUP_ONEDRIVE_DIR)
// — o launcher não importa aquele módulo (ele dispara side effects como checar
// ONEDRIVE_ROOT e sair do processo se não achar; o launcher precisa continuar
// funcionando mesmo se essas checagens específicas do backend falharem).
//
// IMPORTANTE: resolvido a partir de `os.homedir()`, NUNCA um caminho fixo com
// usuário específico (`C:\Users\Kerol\...`) — esse caminho roda na máquina de
// CADA pessoa que usar o `.exe`, e cada uma tem seu próprio usuário do
// Windows (`C:\Users\<usuário dela>`). O nome da pasta do OneDrive em si
// ("OneDrive - 2dconsultores.com.br") é igual pra todo mundo da organização
// (o Microsoft 365 nomeia pelo nome do tenant, não por pessoa) — só o
// `C:\Users\<nome>` na frente varia, e é exatamente isso que `os.homedir()`
// resolve certo em cada máquina.
const RELEASES_DIR = process.env.CARTEIRA_RELEASES_DIR
  || path.join(os.homedir(), 'OneDrive - 2dconsultores.com.br', '01 - Marco + Monitores', 'Ecossistema-Monitoria', 'Carteira', 'releases');

// Precisa bater com o default de `PORT` em server/config.cjs (ver lá o porquê
// de não ser 3001) — o launcher passa esta porta pro servidor filho e é nela
// que a tela de carregamento fica batendo.
const PORTA = Number(process.env.CARTEIRA_PORTA) || 3011;

module.exports = { PASTA_PADRAO_SUGERIDA, PONTEIRO_INSTALL, caminhosDe, RELEASES_DIR, PORTA };
