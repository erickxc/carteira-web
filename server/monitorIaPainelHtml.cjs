/**
 * HTML autocontido (sem build, sem dependência externa — abre via `file://`)
 * do "Painel monitorIA": mapa da ESTRUTURA do agente (quais ferramentas
 * existem, o que cada uma recebe como parâmetro, se lê ou grava dado) e como
 * o fluxo se conecta — não é um log de execuções passadas.
 *
 * Mesmo padrão de `server/telaCarregando.cjs` (HTML gerado por função Node,
 * escrito num arquivo temp e aberto no navegador padrão). Nenhuma rota HTTP
 * nova foi criada: os dados vêm de `GET /api/ia/claude/mcp` (catálogo real de
 * `FERRAMENTAS`, `server/ia/tools.cjs` — provider-agnóstico apesar do nome da
 * rota, usado igual por `ollama` e `claude-cli`) e `GET /api/ia/provedor`.
 *
 * URLs fixas em `127.0.0.1:3011`: é HTML puro rodando no navegador via
 * `file://`, sem acesso a `require('./config.cjs')` — CORS já libera origem
 * ausente/`'null'` desse caso (`server.cjs`).
 */
function gerarHtmlPainel() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Painel monitorIA</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; min-height: 100%;
    background: #0a0a0a; color: #eee;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  body { padding: 24px; max-width: 980px; margin: 0 auto; }
  h1 { font-size: 1.3rem; font-weight: 600; margin: 0 0 4px; letter-spacing: 0.01em; }
  .subtitulo { color: #999; font-size: 0.85rem; margin: 0 0 20px; }
  .topo { display: flex; flex-wrap: wrap; gap: 16px; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }
  .provedor { font-size: 0.8rem; color: #999; }
  .provedor b { color: #fff; }
  button {
    background: #161616; color: #eee; border: 1px solid #333; border-radius: 6px;
    padding: 6px 12px; font-size: 0.8rem; font-family: inherit; cursor: pointer;
  }
  button:hover { border-color: #555; }

  .fluxo {
    background: #121212; border: 1px solid #242424; border-radius: 8px;
    padding: 14px 16px; margin-bottom: 24px; font-size: 0.82rem; color: #bbb; line-height: 1.6;
  }
  .fluxo b { color: #fff; }
  .fluxo .passos { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
  .fluxo .passo { background: #1c1c1c; border: 1px solid #2e2e2e; border-radius: 6px; padding: 6px 10px; font-size: 0.76rem; }
  .fluxo .seta { color: #555; }

  h2 { font-size: 0.95rem; font-weight: 600; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #262626; }
  .contagem { font-weight: 400; color: #888; font-size: 0.8rem; }

  .ferramenta {
    background: #121212; border: 1px solid #242424; border-radius: 8px;
    padding: 12px 14px; margin-bottom: 10px;
  }
  .ferramenta .cabecalho { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
  .ferramenta .nome { font-size: 0.9rem; font-weight: 600; font-family: ui-monospace, Consolas, monospace; }
  .badge-escreve { font-size: 0.68rem; color: #ffb84d; border: 1px solid #664; white-space: nowrap; padding: 2px 8px; border-radius: 10px; }
  .badge-leitura { font-size: 0.68rem; color: #7fd1ff; border: 1px solid #345; white-space: nowrap; padding: 2px 8px; border-radius: 10px; }
  .descricao { font-size: 0.8rem; color: #bbb; margin: 8px 0 0; }
  .params-tabela { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.76rem; }
  .params-tabela th, .params-tabela td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #1e1e1e; }
  .params-tabela th { color: #888; font-weight: 500; }
  .params-tabela td.nome-param { font-family: ui-monospace, Consolas, monospace; color: #ddd; }
  .obrigatorio { color: #ff9a6b; font-size: 0.68rem; }
  .sem-params { font-size: 0.76rem; color: #777; margin-top: 8px; font-style: italic; }
  .vazio { color: #777; font-size: 0.85rem; padding: 16px 0; }
</style>
</head>
<body>
  <div class="topo">
    <div>
      <h1>Painel monitorIA</h1>
      <p class="subtitulo">Estrutura do agente — quais ferramentas existem, o que cada uma recebe, como o fluxo se conecta.</p>
    </div>
    <div style="display:flex; gap:12px; align-items:center;">
      <div class="provedor" id="provedor">Carregando provedor…</div>
      <button id="btn-atualizar">Atualizar</button>
    </div>
  </div>

  <div class="fluxo">
    <div><b>Como funciona:</b> um único agente (não há sub-agentes) recebe a pergunta, decide sozinho quais ferramentas chamar — pode encadear várias na mesma resposta — e cada ferramenta lê ou grava direto no banco da Carteira.</div>
    <div class="passos">
      <span class="passo">Pergunta do usuário</span>
      <span class="seta">→</span>
      <span class="passo" id="passo-provedor">Provedor (Ollama / Claude CLI)</span>
      <span class="seta">→</span>
      <span class="passo">Ferramenta(s) chamada(s)</span>
      <span class="seta">→</span>
      <span class="passo">Banco (SQLite → espelho Excel)</span>
      <span class="seta">→</span>
      <span class="passo">Resposta</span>
    </div>
  </div>

  <h2>Ferramentas de escrita <span class="contagem" id="contagem-escrita"></span></h2>
  <div id="lista-escrita"><p class="vazio">Carregando…</p></div>

  <h2>Ferramentas de leitura <span class="contagem" id="contagem-leitura"></span></h2>
  <div id="lista-leitura"><p class="vazio">Carregando…</p></div>

  <script>
    const BASE = 'http://127.0.0.1:3011';

    function esc(s) {
      return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    }

    function tabelaParametros(schema) {
      const props = schema && schema.properties ? schema.properties : {};
      const nomes = Object.keys(props);
      if (nomes.length === 0) return '<p class="sem-params">Sem parâmetros.</p>';
      const obrigatorios = new Set(schema.required || []);
      const linhas = nomes.map((nome) => {
        const p = props[nome] || {};
        return \`<tr>
          <td class="nome-param">\${esc(nome)}\${obrigatorios.has(nome) ? ' <span class="obrigatorio">obrigatório</span>' : ''}</td>
          <td>\${esc(p.type || '—')}</td>
          <td>\${esc(p.description || '')}</td>
        </tr>\`;
      }).join('');
      return \`<table class="params-tabela">
        <thead><tr><th>Parâmetro</th><th>Tipo</th><th>Descrição</th></tr></thead>
        <tbody>\${linhas}</tbody>
      </table>\`;
    }

    function cartaoFerramenta(f) {
      return \`
        <div class="ferramenta">
          <div class="cabecalho">
            <span class="nome">\${esc(f.nome)}</span>
            <span class="\${f.escreve ? 'badge-escreve' : 'badge-leitura'}">\${f.escreve ? 'grava dado' : 'só leitura'}</span>
          </div>
          <p class="descricao">\${esc(f.descricao)}</p>
          \${tabelaParametros(f.parametros)}
        </div>
      \`;
    }

    async function carregarProvedor() {
      try {
        const r = await fetch(BASE + '/api/ia/provedor');
        const d = await r.json();
        document.getElementById('provedor').innerHTML = 'Provedor ativo: <b>' + esc(d.provedor) + '</b>' + (d.travado ? ' (travado por .env)' : '');
        document.getElementById('passo-provedor').textContent = 'Provedor ativo: ' + d.provedor;
      } catch {
        document.getElementById('provedor').textContent = 'Não foi possível ler o provedor ativo.';
      }
    }

    async function carregarFerramentas() {
      const elEscrita = document.getElementById('lista-escrita');
      const elLeitura = document.getElementById('lista-leitura');
      try {
        const r = await fetch(BASE + '/api/ia/claude/mcp');
        const d = await r.json();
        const todas = d.ferramentas || [];
        const escrita = todas.filter((f) => f.escreve).sort((a, b) => a.nome.localeCompare(b.nome));
        const leitura = todas.filter((f) => !f.escreve).sort((a, b) => a.nome.localeCompare(b.nome));

        document.getElementById('contagem-escrita').textContent = '(' + escrita.length + ')';
        document.getElementById('contagem-leitura').textContent = '(' + leitura.length + ')';

        elEscrita.innerHTML = escrita.length ? escrita.map(cartaoFerramenta).join('') : '<p class="vazio">Nenhuma.</p>';
        elLeitura.innerHTML = leitura.length ? leitura.map(cartaoFerramenta).join('') : '<p class="vazio">Nenhuma.</p>';
      } catch {
        elEscrita.innerHTML = '<p class="vazio">Não foi possível carregar — o backend está rodando em 127.0.0.1:3011?</p>';
        elLeitura.innerHTML = '';
      }
    }

    function carregarTudo() {
      carregarProvedor();
      carregarFerramentas();
    }

    document.getElementById('btn-atualizar').addEventListener('click', carregarTudo);
    carregarTudo();
  </script>
</body>
</html>`;
}

module.exports = { gerarHtmlPainel };
