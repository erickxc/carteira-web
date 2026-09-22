// Login rápido no Price — usa a MESMA API da Carteira de Monitoria (server/routes/clients.cjs).
// A senha nunca fica salva na extensão: cada clique busca a credencial na hora,
// via POST /clients/:id/price-credenciais/revelar (mesma rota que o botão dentro
// do app usa), e ela só existe na memória do popup até ser enviada pro Price.

// Nenhum desses é garantido em toda máquina da LAN — por isso a lista, na
// ordem do mais específico pro mais genérico, e fica com o primeiro que
// responder:
//  - `carteira.local` só resolve em máquina com essa entrada manual no
//    hosts/DNS local (nem toda máquina tem).
//  - `karol-2d` é o NOME DA MÁQUINA servidora (NetBIOS) — resolve sozinho na
//    maioria das LANs do Windows, sem precisar editar hosts em lugar nenhum;
//    é o candidato que faz a extensão funcionar "de fábrica" numa máquina
//    nova. Se o nome dessa máquina mudar um dia, precisa atualizar aqui.
//  - os dois `127.0.0.1` só respondem NA PRÓPRIA máquina servidora (onde o
//    Apache/Node roda local) — inúteis em qualquer outra máquina da rede,
//    mas baratos de tentar e cobrem quem abre a extensão ali mesmo.
const API_BASES = [
  'http://carteira.local:8080/api',
  'http://karol-2d:8080/api',
  'http://127.0.0.1:8080/api',
  'http://127.0.0.1:3011/api',
];

const listaEl = document.getElementById('lista');
const filtroServicoEl = document.getElementById('filtroServico');
const buscaClienteEl = document.getElementById('buscaCliente');
const corpoEl = document.getElementById('corpo');
const animacaoEl = document.getElementById('animacao');
const animacaoRotuloEl = document.getElementById('animacaoRotulo');
const barraCarregandoEl = document.getElementById('barraCarregando');
const campoCnpjEl = document.getElementById('campoCnpj');
const valorCnpjEl = document.getElementById('valorCnpj');
const campoSenhaEl = document.getElementById('campoSenha');
const valorSenhaEl = document.getElementById('valorSenha');
const botaoEntrarEl = document.getElementById('botaoEntrar');

// Mesma cadência de `AcessosExternosButton.tsx` (o botão "Price" já existente
// dentro do app) — mantida igual de propósito, é a mesma sensação de "entrando"
// que quem usa o app já conhece.
// Mais devagar que o valor original do app — pedido explícito pra extensão
// (o app usa 22/110/160; aqui dobrado, pra dar tempo de acompanhar o passo a
// passo antes de já sair da tela).
const MS_POR_CARACTERE = 45;
const PAUSA_ENTRE_CAMPOS_MS = 220;
const PAUSA_NO_BOTAO_MS = 320;
const PAUSA_BUSCANDO_MIN_MS = 600;
const MAX_PONTOS_SENHA = 10;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let clientes = [];
let apiBase = null;

async function acharApiBase() {
  for (const base of API_BASES) {
    try {
      const resp = await fetch(`${base}/clients`, { signal: AbortSignal.timeout(2500) });
      if (resp.ok) return { base, dados: await resp.json() };
    } catch {
      // tenta a próxima
    }
  }
  return null;
}

function formatarCNPJ(valor) {
  const digitos = (valor || '').replace(/\D/g, '').slice(0, 14);
  if (digitos.length < 14) return valor || '';
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function mostrarMensagem(texto, erro = false) {
  listaEl.innerHTML = '';
  const div = document.createElement('div');
  div.className = erro ? 'msg erro' : 'msg';
  div.textContent = texto;
  listaEl.appendChild(div);
}

const PRICE_LABEL = 'Price';

/**
 * Mesmo cálculo de `AcessosExternosButton.tsx` (o botão de acessos do
 * cadastro do cliente, dentro do app): um botão por serviço com link de BI
 * cadastrado (`cliente.linksServicos`), mais o Price quando o cliente tem
 * senha salva E ainda tem o serviço "Precificação" ativo. Um cliente sem
 * nenhum acesso cadastrado não aparece na lista.
 */
function calcularAcessos(cliente) {
  const acessos = Object.entries(cliente.linksServicos ?? {})
    .filter(([, url]) => url?.trim())
    .map(([label, url]) => ({ label, url: url.trim() }));
  if (cliente.temSenhaPrice && Array.isArray(cliente.servicos) && cliente.servicos.includes('Precificação')) {
    acessos.push({ label: PRICE_LABEL });
  }
  return acessos;
}

/** O item inteiro (label + espaço em branco à direita) é clicável — não só
 *  um pill estreito em volta do texto. Numa linha de GRUPO, `cliente` é
 *  sempre o da LOJA PRINCIPAL (ver `agruparPorGrupo`) — o acesso (Price/BI)
 *  é o mesmo pra qualquer loja do grupo, confirmado caso a caso (ex.:
 *  Aliança, Piloto, Altese, CBraga entram todas pelo mesmo login). */
function criarItemAcesso(cliente, acesso) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'acesso-item';

  const label = document.createElement('span');
  label.textContent = acesso.label;
  const seta = document.createElement('span');
  seta.className = 'seta';
  seta.textContent = '→';
  btn.append(label, seta);

  if (acesso.url) {
    btn.addEventListener('click', () => chrome.tabs.create({ url: acesso.url }));
  } else {
    btn.addEventListener('click', () => abrirPrice(cliente, btn));
  }
  return btn;
}

function renderLinhaCliente(nomeExibido, cliente, acessos, sublinha) {
  const linha = document.createElement('div');
  linha.className = 'cliente-row';

  const nome = document.createElement('span');
  nome.className = 'cliente-nome';
  nome.textContent = nomeExibido;
  linha.appendChild(nome);

  if (sublinha) {
    const sub = document.createElement('span');
    sub.className = 'cliente-sublinha';
    sub.textContent = sublinha;
    linha.appendChild(sub);
  }

  const lista = document.createElement('div');
  lista.className = 'cliente-acessos';
  for (const acesso of acessos) lista.appendChild(criarItemAcesso(cliente, acesso));
  linha.appendChild(lista);
  return linha;
}

/** Porto de `src/utils/gruposLojas.ts::lojaPrincipal` — mesma regra: a loja
 *  mais ANTIGA (menor `createdAt`) do grupo é quem representa o grupo
 *  inteiro. `todosOsClientes` (não só os já filtrados) de propósito — senão
 *  qual loja é "principal" mudaria dependendo do filtro aplicado na hora,
 *  igual ao comentário original explica. */
function chaveOrdenacao(c) {
  return c.createdAt || '9999-12-31T23:59:59.999Z';
}
function lojaPrincipal(grupo, todosOsClientes) {
  const lojas = todosOsClientes.filter((c) => c.grupo === grupo);
  if (lojas.length === 0) return undefined;
  return lojas.reduce((a, b) => (chaveOrdenacao(a) <= chaveOrdenacao(b) ? a : b));
}

/** Porto de `agruparPorGrupo`: mesma regra de exibição da tabela de clientes
 *  do app — um grupo com mais de 1 loja NA LISTA JÁ FILTRADA vira uma linha
 *  só (rótulo = nome do grupo), usando os acessos da loja principal (mesma
 *  loja de onde vêm os Links de BI hoje, ver `gruposLojas.ts`). Só 1 loja do
 *  grupo sobreviveu ao filtro? Vira linha normal, sem juntar nada. */
function agruparPorGrupo(linhasFiltradas, todosOsClientes) {
  const resultado = [];
  const gruposVistos = new Set();
  for (const linha of linhasFiltradas) {
    const grupo = linha.cliente.grupo;
    if (!grupo) {
      resultado.push({ nome: linha.cliente.empresa, cliente: linha.cliente, acessos: linha.acessos });
      continue;
    }
    if (gruposVistos.has(grupo)) continue;
    gruposVistos.add(grupo);
    const doGrupo = linhasFiltradas.filter((l) => l.cliente.grupo === grupo);
    if (doGrupo.length === 1) {
      resultado.push({ nome: doGrupo[0].cliente.empresa, cliente: doGrupo[0].cliente, acessos: doGrupo[0].acessos });
      continue;
    }
    const principal = lojaPrincipal(grupo, todosOsClientes);
    const entradaPrincipal = doGrupo.find((l) => l.cliente.id === principal?.id) ?? doGrupo[0];
    const sublinha = doGrupo.map((l) => l.cliente.empresa).join(', ');
    resultado.push({ nome: grupo, cliente: entradaPrincipal.cliente, acessos: entradaPrincipal.acessos, sublinha });
  }
  return resultado;
}

/** A lista só aparece depois de algum filtro — nem serviço nem busca de
 *  cliente preenchidos mostra só uma dica, nunca a carteira inteira de uma
 *  vez. Os dois filtros combinam por E: "Serviço" restringe QUAIS acessos
 *  aparecem em cada cliente, a busca restringe QUAIS clientes aparecem. */
function renderLista() {
  listaEl.innerHTML = '';

  const servico = filtroServicoEl.value;
  const termo = buscaClienteEl.value.trim().toLowerCase();

  if (!servico && !termo) {
    mostrarMensagem('Escolha um serviço ou busque um cliente pra ver os acessos.');
    return;
  }

  const linhas = [];
  for (const cliente of clientes) {
    if (termo && !cliente.empresa.toLowerCase().includes(termo)) continue;
    const acessos = servico ? cliente.acessos.filter((a) => a.label === servico) : cliente.acessos;
    if (acessos.length === 0) continue;
    linhas.push({ cliente, acessos });
  }

  if (linhas.length === 0) {
    mostrarMensagem('Nenhum acesso encontrado com esse filtro.');
    return;
  }
  for (const { nome, cliente, acessos, sublinha } of agruparPorGrupo(linhas, clientes)) {
    listaEl.appendChild(renderLinhaCliente(nome, cliente, acessos, sublinha));
  }
}

function popularOpcoes(selectEl, opcoes, rotuloPadrao) {
  selectEl.innerHTML = '';
  const optPadrao = document.createElement('option');
  optPadrao.value = '';
  optPadrao.textContent = rotuloPadrao;
  selectEl.appendChild(optPadrao);
  for (const { valor, texto } of opcoes) {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = texto;
    selectEl.appendChild(opt);
  }
}

async function carregarClientes() {
  const encontrado = await acharApiBase();
  if (!encontrado) {
    mostrarMensagem('Não consegui falar com a Carteira de Monitoria. Verifique se o servidor está no ar.', true);
    return;
  }
  apiBase = encontrado.base;
  clientes = encontrado.dados
    .map((c) => ({ ...c, acessos: calcularAcessos(c) }))
    .filter((c) => c.acessos.length > 0)
    .sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));

  const servicos = [...new Set(clientes.flatMap((c) => c.acessos.map((a) => a.label)))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );
  popularOpcoes(filtroServicoEl, servicos.map((s) => ({ valor: s, texto: s })), 'Serviço: todos');

  renderLista();
}

// A espera pela aba carregar e a injeção do formulário de login moraram
// aqui antes; agora ficam em `background.js` (ver comentário lá pro motivo).

function mostrarAnimacao() {
  corpoEl.style.display = 'none';
  listaEl.style.display = 'none';
  animacaoEl.classList.add('ativa');
  animacaoRotuloEl.textContent = 'Buscando credenciais...';
  barraCarregandoEl.style.display = '';
  campoCnpjEl.style.display = 'none';
  campoSenhaEl.style.display = 'none';
  botaoEntrarEl.style.display = 'none';
  valorCnpjEl.innerHTML = '';
  valorSenhaEl.innerHTML = '';
  botaoEntrarEl.classList.remove('is-pressed');
}

function esconderAnimacao() {
  animacaoEl.classList.remove('ativa');
  corpoEl.style.display = '';
  listaEl.style.display = '';
}

/** Digita `texto` letra a letra dentro de `elValor`, com um cursor piscando
 *  no fim — mesmo efeito visual do modal do app (`AbrirPriceModal`). */
async function digitar(elValor, texto) {
  for (let i = 1; i <= texto.length; i++) {
    await delay(MS_POR_CARACTERE);
    elValor.textContent = texto.slice(0, i);
    const cursor = document.createElement('span');
    cursor.className = 'price-fake-cursor';
    elValor.appendChild(cursor);
  }
  await delay(PAUSA_ENTRE_CAMPOS_MS);
  elValor.querySelector('.price-fake-cursor')?.remove();
}

async function abrirPrice(cliente, btn) {
  btn.disabled = true;
  mostrarAnimacao();
  try {
    const [resp] = await Promise.all([
      fetch(`${apiBase}/clients/${cliente.id}/price-credenciais/revelar`, { method: 'POST' }),
      delay(PAUSA_BUSCANDO_MIN_MS), // segura a barra de "buscando" um tempo mínimo, mesmo se a API responder na hora
    ]);
    if (!resp.ok) throw new Error(`Falha ao revelar credenciais (${resp.status})`);
    const { loginPrice, senhaPrice } = await resp.json();
    const cnpjFormatado = formatarCNPJ(loginPrice);

    barraCarregandoEl.style.display = 'none';
    animacaoRotuloEl.textContent = '';
    campoCnpjEl.style.display = '';
    // O botão fica visível (sem "is-pressed") desde já — igual ao app, que
    // sempre renderiza o botão fora das fases de carregando/erro. Só assim dá
    // pra PERCEBER o clique depois: precisa existir um estado "solto" visível
    // antes do estado "apertado".
    botaoEntrarEl.style.display = '';
    await digitar(valorCnpjEl, cnpjFormatado);

    campoSenhaEl.style.display = '';
    const tamanhoSenha = Math.max(6, Math.min(senhaPrice.length, MAX_PONTOS_SENHA));
    await digitar(valorSenhaEl, '•'.repeat(tamanhoSenha));

    botaoEntrarEl.classList.add('is-pressed');
    await delay(PAUSA_NO_BOTAO_MS);

    // A criação da aba e a injeção do formulário rodam no background
    // (service worker), não aqui: `chrome.tabs.create` com a aba em foco
    // tira o foco do popup, e o Chrome MATA o popup (e este script) assim
    // que ele perde o foco — antes do `executeScript` rodar. Resultado era
    // a aba do Price abrir crua (só GET) e nunca receber o POST de login.
    // O background sobrevive ao popup fechar, então a sequência continua.
    const resposta = await chrome.runtime.sendMessage({
      tipo: 'abrirPrice',
      cnpjFormatado,
      senhaPrice,
    });
    if (!resposta?.ok) throw new Error(resposta?.erro || 'Falha ao abrir o Price.');

    window.close();
  } catch (err) {
    esconderAnimacao();
    btn.disabled = false;
    mostrarMensagem(err instanceof Error ? err.message : 'Erro ao abrir o Price.', true);
  }
}

filtroServicoEl.addEventListener('change', () => renderLista());
buscaClienteEl.addEventListener('input', () => renderLista());
carregarClientes();
