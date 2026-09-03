/**
 * Login automático no Price — mesma URL já usada no atalho "Price 2D" da
 * sidebar (`src/components/Sidebar.tsx`), aqui centralizada porque agora tem
 * um segundo consumidor (`AcessosExternosButton`, login preenchido automaticamente
 * por cliente). Ver server/crypto.cjs pra como login/senha chegam cifrados
 * até aqui.
 */
export const PRICE_LOGIN_URL = 'http://77.37.126.180:5005/login';

/** O campo do Price é CNPJ, com máscara "00.000.000/0000-00" (confirmado no
 *  HTML da própria página: `$('#cnpj').mask('00.000.000/0000-00')`) — o valor
 *  que o formulário de verdade envia é o texto JÁ formatado, não os dígitos
 *  crus. Aceita o cadastro guardado com ou sem pontuação. */
export function formatarCNPJ(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 14);
  if (digitos.length < 14) return valor; // incompleto: não força máscara errada
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/** Elementos da animação injetada na aba nova — atualizados por DOM puro
 *  (não é React: é o documento de OUTRA janela). */
export interface AnimacaoPrice {
  cnpj: HTMLElement;
  senha: HTMLElement;
  cursorCnpj: HTMLElement;
  cursorSenha: HTMLElement;
  botao: HTMLElement;
}

/**
 * Abre a aba NA HORA do clique (síncrono) e desenha DENTRO dela a réplica
 * visual do login do Price, onde a animação vai rodar.
 *
 * Duas razões pra ser assim:
 *  1. Pop-up: o navegador só permite `window.open` sem bloquear no mesmo
 *     evento de clique. Abrir depois da animação (setTimeout) é bloqueado —
 *     visto na prática ("só abriu uma tela de permitir popup").
 *  2. A animação mora AQUI, não na Carteira (pedido do usuário): antes a
 *     Carteira mostrava a animação num modal E a aba nova aparecia vazia do
 *     lado, dando a impressão de duas coisas acontecendo/uma aba "nada a
 *     ver". Agora só existe UMA coisa: a aba que abriu já se mostra
 *     preenchendo o login, e depois vira o Price de verdade.
 *
 * `about:blank` aberto por nós é mesma-origem enquanto não navega, então dá
 * pra escrever nele. Depois do `enviarLoginPrice` ele passa a ser do Price
 * (outra origem) e não é mais acessível — nem precisa ser.
 */
export function abrirAbaPriceComAnimacao(nomeJanela: string): { janela: Window; els: AnimacaoPrice | null } | null {
  const janela = window.open('about:blank', nomeJanela);
  if (!janela) return null;

  try {
    const doc = janela.document;
    doc.title = 'Entrando no Price...';
    // Estilo inline e autocontido: é outro documento, sem o CSS do app.
    doc.body.style.cssText = 'margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;';
    doc.body.innerHTML = `
      <style>
        @keyframes pisca { 50% { opacity: 0 } }
        .cursor { display:inline-block;width:1px;height:1em;margin-left:1px;vertical-align:-2px;background:#b8860b;animation:pisca .8s step-end infinite }
        .campo { background:#fff;border:1px solid #d8d8dc;border-radius:6px;padding:.5rem .7rem;display:flex;flex-direction:column;gap:3px }
        .rotulo { font-size:11px;color:#77777e;text-transform:uppercase;letter-spacing:.04em }
        .valor { font-size:.9rem;color:#1b1b1f;min-height:1.2em;font-variant-numeric:tabular-nums }
        .botao { padding:.6rem;border:none;border-radius:6px;background:#dabb6c;color:#1b1b1f;font-weight:600;font-size:.9rem;transition:transform .1s,filter .1s }
        .botao.apertado { transform:scale(.96);filter:brightness(.92) }
      </style>
      <div style="width:min(340px,90vw);display:flex;flex-direction:column;gap:14px;padding:2rem;background:#ececed;border:1px solid #d8d8dc;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.08)">
        <div style="display:flex;justify-content:center;margin-bottom:4px;font-size:1.1rem;font-weight:700;color:#1b1b1f;letter-spacing:-.01em">2D Price</div>
        <div class="campo"><span class="rotulo">CNPJ</span><div class="valor"><span id="v-cnpj"></span><span class="cursor" id="c-cnpj" style="display:none"></span></div></div>
        <div class="campo"><span class="rotulo">Senha</span><div class="valor"><span id="v-senha"></span><span class="cursor" id="c-senha" style="display:none"></span></div></div>
        <button class="botao" id="b-entrar" type="button" tabindex="-1">Entrar</button>
      </div>
    `;
    const pega = (id: string) => doc.getElementById(id);
    const cnpj = pega('v-cnpj');
    const senha = pega('v-senha');
    const cursorCnpj = pega('c-cnpj');
    const cursorSenha = pega('c-senha');
    const botao = pega('b-entrar');
    const els = cnpj && senha && cursorCnpj && cursorSenha && botao
      ? { cnpj, senha, cursorCnpj, cursorSenha, botao }
      : null;
    return { janela, els };
  } catch {
    // Navegador restringiu escrever no documento da aba — sem animação, mas
    // o login (navegação de verdade) ainda funciona.
    return { janela, els: null };
  }
}

/** Mostra uma mensagem simples na aba (usado quando dá erro ao buscar a
 *  credencial: a aba já está aberta, não pode ficar em branco pra sempre). */
export function mostrarErroNaAbaPrice(janela: Window, mensagem: string) {
  try {
    janela.document.body.innerHTML = `<p style="font:14px system-ui,sans-serif;color:#b3261e;padding:2rem;text-align:center;max-width:32rem">${mensagem}</p>`;
  } catch {
    // outra origem/janela fechada — nada a fazer.
  }
}

/**
 * Envia um formulário de verdade pro Price, DENTRO da aba já aberta por
 * `abrirAbaPrice` (via `form.target` = mesmo nome da janela — navega a
 * janela existente, não abre uma nova, então não é bloqueado mesmo rodando
 * depois da animação) — o MESMO mecanismo que o navegador usa quando você
 * digita CNPJ/senha na tela dele e aperta "Entrar" (POST comum, sem AJAX).
 * Não é possível controlar a aba depois de navegada (outra origem — barreira
 * de segurança do navegador, não uma limitação nossa).
 */
export function enviarLoginPrice(cnpj: string, senha: string, nomeJanela: string) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = PRICE_LOGIN_URL;
  form.target = nomeJanela;
  form.style.display = 'none';
  for (const [nome, valor] of Object.entries({ cnpj: formatarCNPJ(cnpj), senha })) {
    const campo = document.createElement('input');
    campo.type = 'hidden';
    campo.name = nome;
    campo.value = valor;
    form.appendChild(campo);
  }
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}
