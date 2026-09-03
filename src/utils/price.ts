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
 * Envia um formulário de verdade pro Price, numa aba nova — o MESMO mecanismo
 * que o navegador usa quando você digita CNPJ/senha na tela dele e aperta
 * "Entrar" (POST comum, sem AJAX). Não é possível controlar a aba depois de
 * aberta (outra origem — barreira de segurança do navegador, não uma
 * limitação nossa), então isso só pode ser chamado DEPOIS de qualquer
 * animação que a Carteira queira mostrar antes.
 */
export function enviarLoginPrice(cnpj: string, senha: string) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = PRICE_LOGIN_URL;
  form.target = '_blank';
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
