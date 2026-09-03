/**
 * Login automático no Price — mesma URL já usada no atalho "Price 2D" da
 * sidebar (`src/components/Sidebar.tsx`), aqui centralizada porque agora tem
 * um segundo consumidor (`AbrirPriceModal`, login preenchido automaticamente
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

/**
 * Abre a aba em branco NA HORA do clique (síncrono) — é o que evita o
 * bloqueio de pop-up. O navegador só permite `window.open` sem bloquear
 * quando acontece dentro do mesmo evento de clique do usuário; como a
 * Carteira mostra 1-2s de animação ANTES de navegar de verdade, abrir a aba
 * só depois (dentro de um `setTimeout`) já não conta como resultado direto
 * do clique, e o navegador bloqueia (visto na prática: apareceu o aviso de
 * pop-up bloqueado em vez da aba). A correção padrão pra isso é abrir a
 * aba (vazia) já, e só preenchê-la/navegá-la depois — chame isto no handler
 * de clique, antes de iniciar a animação.
 */
export function abrirAbaPrice(nomeJanela: string): Window | null {
  const janela = window.open('about:blank', nomeJanela);
  if (janela) {
    try {
      janela.document.title = 'Entrando no Price...';
      janela.document.body.innerHTML = '<p style="font:14px sans-serif;color:#666;padding:2rem;text-align:center;">Entrando no Price...</p>';
    } catch {
      // navegador restringiu escrever no documento — sem problema, a
      // navegação de verdade (enviarLoginPrice) ainda funciona.
    }
  }
  return janela;
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
