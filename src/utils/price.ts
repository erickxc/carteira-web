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
 * Abre direto na TELA REAL de login do Price, não num `about:blank`: a aba
 * fica visível por ~1s enquanto a animação roda na Carteira, e uma aba em
 * branco (ou com um HTML nosso imitando o Price) fica com cara de erro —
 * tentei as duas coisas antes, ambas ficaram ruins. Mostrando a tela de
 * verdade, a aba parece o que é: o Price abrindo.
 *
 * `enviarLoginPrice`, depois da animação, faz o POST do login NESTA MESMA
 * aba (via `form.target` com o mesmo nome de janela) — navegar uma janela que
 * já existe não é tratado como pop-up novo, então não é bloqueado.
 */
export function abrirAbaPrice(nomeJanela: string): Window | null {
  return window.open(PRICE_LOGIN_URL, nomeJanela);
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
}
