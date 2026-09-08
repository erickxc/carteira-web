const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { PORTA } = require('./config.cjs');
const { gerarHtmlPainel } = require('../server/monitorIaPainelHtml.cjs');

/**
 * Entrypoint do `.exe` do Painel monitorIA — deliberadamente MUITO mais
 * simples que `launcher/index.cjs` (o launcher principal): esta ferramenta
 * não instala nada, não atualiza nada, não sobe servidor nenhum — só
 * confere se a Carteira já está rodando nesta máquina e abre um HTML local
 * (mesmo padrão de `server/telaCarregando.cjs`) que consulta a API já viva.
 *
 * Sem lockfile de instância única, sem `primeiraExecucao.cjs`, sem bandeja,
 * sem autostart: tudo isso resolve problema de CICLO DE VIDA de instalação,
 * que esta ferramenta não tem (ela não instala nada, só lê).
 */

/** Timeout maior que o do launcher principal (400ms): lá "não respondeu" cai
 *  pro caminho de SUBIR o servidor (então um timeout curto não atrasa nada
 *  visível); aqui não há esse fallback — um timeout curto geraria falso
 *  negativo com o backend saudável. */
function servidorJaNoAr(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORTA}/api/status/base`, { timeout: timeoutMs }, (res) => {
      res.resume();
      // 200 = saudável; 503 = processo de pé mas sem dado (ex.: modo cliente
      // sem SQLITE_FILE) — o painel depende de dado de verdade, então trata
      // como não-disponível, diferente do launcher principal (que só
      // confere conectividade, já que ele mesmo vai subir o servidor).
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  if (!(await servidorJaNoAr())) {
    spawn('cmd', ['/c', 'msg', '*', 'Carteira Web não está rodando nesta máquina — abra o 2D_Carteira.exe primeiro.'], { shell: false, stdio: 'ignore', windowsHide: true });
    return;
  }
  const arquivo = path.join(os.tmpdir(), 'carteira-monitor-ia-painel.html');
  fs.writeFileSync(arquivo, gerarHtmlPainel(), 'utf8');
  // `start` (não `cmd /c start` de URL) porque é um arquivo local via
  // `file://` — mesmo comando exato de `server/telaCarregando.cjs`.
  // `windowsHide` junto de `shell:true` evita a janela de console piscando
  // (shell:true no Windows roda dentro de um cmd.exe, que é console).
  spawn('start', ['', arquivo], { shell: true, stdio: 'ignore', windowsHide: true });
}

if (require.main === module) main();
module.exports = { main, servidorJaNoAr };
