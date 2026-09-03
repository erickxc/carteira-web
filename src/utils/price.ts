/**
 * Login automático no Price — mesma URL já usada no atalho "Price 2D" da
 * sidebar (`src/components/Sidebar.tsx`), aqui centralizada porque agora tem
 * um segundo consumidor (`AcessosExternosButton`, login preenchido
 * automaticamente por cliente). Ver server/crypto.cjs pra como login/senha
 * chegam cifrados até aqui.
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

/**
 * Abre a aba do Price NA HORA do clique (síncrono) — é o que evita o bloqueio
 * de pop-up: o navegador só permite `window.open` sem bloquear dentro do
 * mesmo evento de clique do usuário. Abrir só depois da animação (num
 * `setTimeout`) foi bloqueado na prática ("só abriu uma tela de permitir
 * popup").
 *
 * Abre em branco (`about:blank`) e SEM foco — o usuário não deve ver essa
 * aba, nem perceber que ela existe, até a animação terminar. Já tentamos
 * abrir direto na tela real do Price aqui: tecnicamente funciona, mas o
 * usuário via a aba do Price em segundo plano ANTES da animação acabar (com
 * o link de login dela, sem preenchimento) e achava confuso — "abre tela da
 * price separado" antes da hora. `window.focus()` devolve o foco pra
 * Carteira imediatamente, então a aba fica invisível até `enviarLoginPrice`
 * navegar ela pra Price de verdade e trazer o foco de volta, exatamente
 * quando a animação termina e o login é enviado.
 */
export function abrirAbaPrice(nomeJanela: string): Window | null {
  const aba = window.open('about:blank', nomeJanela);
  window.focus();
  return aba;
}

/**
 * Envia o formulário de login de verdade pro Price, DENTRO da aba já aberta
 * por `abrirAbaPrice` — o MESMO mecanismo que o navegador usa quando alguém
 * digita CNPJ/senha na tela dele e aperta "Entrar" (POST comum de formulário,
 * sem AJAX), então o Price responde com a sessão real na aba real.
 *
 * Não é possível manipular a aba depois de navegada (outra origem — barreira
 * de segurança do navegador, não limitação nossa): por isso a animação mora
 * na Carteira, não lá dentro.
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

  // Só agora traz a aba do Price pra frente — é quando o login de fato
  // acontece, então é a hora certa de o usuário ver o resultado.
  window.open('', nomeJanela)?.focus();
}
