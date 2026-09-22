// Roda como service worker (sobrevive ao popup fechar).
//
// Bug corrigido: essa lógica (criar aba, esperar carregar, injetar o
// formulário de login) morava toda no popup.js. `chrome.tabs.create` com a
// aba em foco tira o foco do popup — e o Chrome MATA o popup (e o JS dele)
// assim que ele perde o foco. O resultado: a aba do Price abria (GET normal,
// tela de login crua) e o `executeScript` que faria o POST de login nunca
// chegava a rodar, porque o popup já tinha sido fechado pelo navegador antes
// disso. Daí "abre a tela cru da price... não entra". Rodando aqui, a
// sequência inteira continua mesmo com o popup já fechado.

const PRICE_LOGIN_URL = 'http://77.37.126.180:5005/login';

function esperarAbaCarregar(tabId, urlEsperada, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let terminou = false;
    function pronta(aba) {
      return aba?.status === 'complete' && aba.url?.startsWith(urlEsperada);
    }
    function finalizar() {
      if (terminou) return;
      terminou = true;
      chrome.tabs.onUpdated.removeListener(ouvinte);
      clearTimeout(timer);
      resolve();
    }
    function ouvinte(id, info, aba) {
      if (id === tabId && info.status === 'complete' && pronta(aba)) finalizar();
    }
    const timer = setTimeout(finalizar, timeoutMs);
    chrome.tabs.onUpdated.addListener(ouvinte);
    chrome.tabs.get(tabId, (aba) => {
      if (pronta(aba)) finalizar();
    });
  });
}

async function abrirPriceLogado(cnpjFormatado, senhaPrice) {
  // `active: false`: a aba nasce em segundo plano, sem tirar o foco do
  // popup nem aparecer na tela — o usuário só vê o resultado final (já
  // logado), nunca a tela crua de login carregando por alguns segundos.
  const aba = await chrome.tabs.create({ url: PRICE_LOGIN_URL, active: false });
  await esperarAbaCarregar(aba.id, PRICE_LOGIN_URL);

  await chrome.scripting.executeScript({
    target: { tabId: aba.id },
    func: (cnpjParaEnviar, senha) => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'http://77.37.126.180:5005/login';
      form.style.display = 'none';
      for (const [nome, valor] of Object.entries({ cnpj: cnpjParaEnviar, senha })) {
        const campo = document.createElement('input');
        campo.type = 'hidden';
        campo.name = nome;
        campo.value = valor;
        form.appendChild(campo);
      }
      document.body.appendChild(form);
      form.submit();
    },
    args: [cnpjFormatado, senhaPrice],
  });

  // Ativa a aba logo depois do formulário enviado — não espera a navegação
  // seguinte terminar (chegou a depender disso, mas o Price pode não disparar
  // um "complete" de navegação de página inteira depois do POST — ex.: se o
  // login for tratado por AJAX/redirect via JS — e aí a aba ficava escondida
  // até estourar o timeout, parecendo que "não carregava"). O preço de ativar
  // já aqui: a chance de ver por uma fração de segundo a tela de login antes
  // do POST assentar, bem menor que o problema que isso causava.
  await chrome.tabs.update(aba.id, { active: true });
  const abaAtual = await chrome.tabs.get(aba.id);
  if (abaAtual.windowId != null) {
    await chrome.windows.update(abaAtual.windowId, { focused: true });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.tipo !== 'abrirPrice') return undefined;
  abrirPriceLogado(msg.cnpjFormatado, msg.senhaPrice)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, erro: err instanceof Error ? err.message : String(err) }));
  return true; // mantém o canal aberto pra resposta assíncrona
});
