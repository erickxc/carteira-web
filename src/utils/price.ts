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
 * Envia o formulário de login de verdade pro Price DENTRO de uma janela já
 * aberta com o nome `nomeJanela` — o MESMO mecanismo que o navegador usa
 * quando alguém digita CNPJ/senha na tela dele e aperta "Entrar" (POST comum
 * de formulário, sem AJAX), então o Price responde com a sessão real lá.
 *
 * Não é possível manipular a aba depois de navegada (outra origem — barreira
 * de segurança do navegador, não limitação nossa): por isso a animação mora
 * na Carteira, não lá dentro.
 */
function enviarFormularioLogin(cnpj: string, senha: string, nomeJanela: string) {
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

/**
 * Abre a aba do Price SÓ no fim, depois da animação — nada de aba/janela
 * nasce antes disso (nem em `about:blank`), porque qualquer `window.open`
 * síncrono já aparece na barra de abas do navegador, mesmo sem foco, e isso
 * confundia quem estava vendo a animação ("cria outra sessão").
 *
 * O preço dessa escolha: o navegador só garante que `window.open` funcione
 * sem bloqueio dentro do MESMO evento de clique do usuário ("ativação
 * transitória", ~5s no Chrome) — como aqui já passou por uma busca de
 * credencial (rede) + a animação inteira, pode passar desse prazo e ser
 * bloqueado. Por isso a função devolve `false` nesse caso: quem chama deve
 * mostrar um botão real pro usuário clicar (`abrirEEnviarLoginManual`), o
 * que é um gesto novo e sempre funciona.
 */
export function abrirEEnviarLoginPrice(cnpj: string, senha: string, nomeJanela: string): boolean {
  const aba = window.open(PRICE_LOGIN_URL, nomeJanela);
  if (!aba) return false;
  enviarFormularioLogin(cnpj, senha, nomeJanela);
  return true;
}
