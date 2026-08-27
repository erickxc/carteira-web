const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/**
 * HTML autocontido (sem dependência externa — abre via `file://`, não pode
 * contar com servidor nenhum rodando ainda) da tela de carregamento do
 * launcher. Mesma identidade visual do resto do app (preto e branco, ícone
 * de seta ascendente — ver `src/components/Sidebar.tsx`), só que como uma
 * página solta: o launcher ainda não tem (e não precisa de) React/build
 * próprio pra isso.
 *
 * O próprio HTML faz o polling em `/api/status/base` na porta do servidor e
 * redireciona pra ele quando responder — assim o launcher só precisa abrir
 * o navegador UMA vez, direto no início, em vez de esperar o servidor subir
 * pra só então abrir (que deixaria a pessoa olhando pra nada por alguns
 * segundos sem feedback nenhum).
 */
function gerarHtml(porta, caminhoLog) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>CARTEIRA 2D</title>
<style>
  :root { color-scheme: light dark; }
  html, body {
    margin: 0; height: 100%; display: flex; align-items: center; justify-content: center;
    background: #0a0a0a; color: #fff;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .caixa { text-align: center; width: 220px; }
  .icone-wrap { width: 48px; height: 48px; margin: 0 auto 20px; }
  h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 16px; letter-spacing: 0.02em; }
  .barra-fundo { width: 100%; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.14); overflow: hidden; }
  .barra-preenchimento { height: 100%; width: 0%; background: #fff; border-radius: 2px; transition: width 0.4s linear; }
  #status { font-size: 0.8rem; color: #999; margin: 12px 0 0; min-height: 1.2em; }
  .erro { color: #ff6b6b; display: none; margin-top: 14px; font-size: 0.8rem; }
  .erro a { color: #fff; text-decoration: underline; cursor: pointer; }
  .log-caminho { color: #666; font-size: 0.7rem; margin-top: 10px; word-break: break-all; user-select: all; }
</style>
</head>
<body>
  <div class="caixa">
    <svg class="icone-wrap" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
      <polyline points="17 6 23 6 23 12"></polyline>
    </svg>
    <h1>CARTEIRA 2D</h1>
    <div class="barra-fundo"><div class="barra-preenchimento" id="barra"></div></div>
    <p id="status">Carregando...</p>
    <div class="erro" id="erro">
      <p>Não foi possível abrir o sistema. <a onclick="location.href = location.href">Tentar de novo</a></p>
      ${caminhoLog ? `<p class="log-caminho">Envie este arquivo pro suporte: ${caminhoLog}</p>` : ''}
    </div>
  </div>
  <script>
    const PORTA = ${porta};
    const URL_STATUS = "http://127.0.0.1:" + PORTA + "/api/status/base";
    const URL_APP = "http://127.0.0.1:" + PORTA + "/";
    // O launcher agora tenta subir o servidor de novo sozinho até ~45s (ver
    // MAX_TENTATIVAS_BOOT em launcher/index.cjs — cobre o OneDrive ainda
    // montando no boot do Windows) — o limite aqui precisa ser folgado o
    // bastante pra não desistir ANTES do launcher terminar de tentar.
    const LIMITE_TENTATIVAS = 180; // ~90s (500ms cada)
    let tentativas = 0;

    // Barra de progresso simples, sem etapas/legendas trocando de texto — só
    // avança em direção ao limite de tentativas (não é medição real de
    // progresso, o launcher e esta página não têm canal de status ao vivo
    // entre si, mas dá uma leitura visual de "está andando" sem o ruído de
    // várias frases diferentes).
    function tentar() {
      tentativas++;
      document.getElementById('barra').style.width = Math.min(100, (tentativas / LIMITE_TENTATIVAS) * 100) + '%';
      fetch(URL_STATUS).then((r) => {
        if (r.ok) {
          document.getElementById('barra').style.width = '100%';
          document.getElementById('status').textContent = 'Pronto — abrindo...';
          location.href = URL_APP;
          return;
        }
        agendarProxima();
      }).catch(agendarProxima);
    }
    function agendarProxima() {
      if (tentativas >= LIMITE_TENTATIVAS) {
        document.getElementById('status').textContent = 'Demorando mais que o esperado...';
        document.getElementById('erro').style.display = 'block';
        return;
      }
      setTimeout(tentar, 500);
    }
    tentar();
  </script>
</body>
</html>`;
}

/** Escreve a tela num arquivo temporário e abre no navegador padrão via
 * `file://` — chamado uma vez, no início do launcher, antes/junto de subir o
 * servidor de verdade (ver `launcher/index.cjs`). */
function abrirTelaCarregando(porta, caminhoLog) {
  const arquivo = path.join(os.tmpdir(), 'carteira-launcher-carregando.html');
  fs.writeFileSync(arquivo, gerarHtml(porta, caminhoLog), 'utf8');
  const comando = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  // `windowsHide` é obrigatório aqui: `shell: true` no Windows roda isto
  // dentro de um `cmd.exe`, que é um executável de console. Como o launcher é
  // GUI (sem console nenhum — ver `marcarComoGui.cjs`), o Windows abre um
  // console NOVO pra esse `cmd` — era essa a janela preta que aparecia ao
  // abrir o `.exe`. Mesmo motivo (e mesma correção) do spawn do servidor em
  // `index.cjs`.
  spawn(comando, ['', arquivo], { shell: true, stdio: 'ignore', windowsHide: true });
  return arquivo;
}

module.exports = { gerarHtml, abrirTelaCarregando };
