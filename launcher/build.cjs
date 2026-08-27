/**
 * Build do `2D_Carteira.exe` — dois passos, nesta ordem:
 *
 * 1. `pkg` empacota `launcher/index.cjs` (+ os `require` locais e o `adm-zip`)
 *    num único `.exe` com o Node embutido.
 * 2. `marcarComoGui` troca o Subsystem do PE pra GUI — é o que impede o
 *    Windows de abrir uma janela de console pro launcher.
 *
 * Rodar com `npm run build:launcher`. O `.exe` gerado fica em `launcher/dist/`
 * — distribuir manualmente (ele não se atualiza sozinho; quem se atualiza é o
 * app dentro dele, pela release no OneDrive).
 */
const path = require('path');
const { exec: pkgExec } = require('@yao-pkg/pkg');
const { marcarComoGui } = require('./marcarComoGui.cjs');
const { prepararBaseComIcone, gruposDeIcone, ID_GRUPO_PRINCIPAL } = require('./aplicarIcone.cjs');
const fs = require('fs');
const os = require('os');

// Alvo do pkg: o mesmo já usado nos builds anteriores (base em ~/.pkg-cache).
// Trocar de versão de Node aqui obriga a baixar uma base nova.
const ALVO = process.env.PKG_TARGET || 'node22-win-x64';
const SAIDA = path.join(__dirname, 'dist', '2D_Carteira.exe');
const ENTRADA = path.join(__dirname, 'index.cjs');

// Ícone: entra no BINÁRIO-BASE do pkg (numa cópia fora do cache), nunca no
// `.exe` pronto — ver `aplicarIcone.cjs`, que documenta os dois erros que
// levaram a esta receita (payload do pkg descartado ao regenerar o PE; e o
// `pkg-fetch` rebaixando o base quando o SHA do cache não bate). Esta versão do
// @yao-pkg/pkg não tem `--icon`, daí o passo manual.
const ICONE = path.join(__dirname, 'icone.ico');

async function main() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-pkg-base-'));
  const icone = prepararBaseComIcone({
    target: ALVO,
    ico: ICONE,
    destino: path.join(tmpBase, 'node-com-icone.exe'),
  });
  console.log(icone.pronto
    ? `Base com ícone pronta (${icone.imagens} resoluções): ${icone.caminho}`
    : `Ícone NÃO aplicado (${icone.motivo}) — o .exe sai com o ícone padrão do Node.`);

  try {
    console.log(`Empacotando ${ENTRADA} (${ALVO})...`);
    // `PKG_NODE_PATH` faz o pkg usar ESTE base e pular a checagem de hash.
    if (icone.pronto) process.env.PKG_NODE_PATH = icone.caminho;
    await pkgExec([ENTRADA, '--target', ALVO, '--output', SAIDA]);

    const { alterado, subsystemAntes } = marcarComoGui(SAIDA);
    console.log(alterado ? `Subsystem ${subsystemAntes} -> GUI (2).` : 'Já era GUI (2).');

    // Confere que o ícone do APP (não o do Node) sobreviveu ao empacotamento,
    // comparando a quantidade de resoluções com a do `.ico`. Contar só "tem
    // grupo de ícone?" não serve: o base do Node também tem um, e foi
    // exatamente assim que um build passou "verde" com o ícone errado.
    if (icone.pronto) {
      const grupo = gruposDeIcone(SAIDA).find((g) => g.id === ID_GRUPO_PRINCIPAL);
      if (!grupo || grupo.imagens !== icone.imagens) {
        throw new Error(
          `O .exe saiu com ${grupo ? `${grupo.imagens} resoluções` : 'nenhum grupo de ícone'}, `
          + `esperado ${icone.imagens} (as do icone.ico) — o ícone do app não foi aplicado.`,
        );
      }
      console.log(`Ícone do app confirmado no .exe (${grupo.imagens} resoluções).`);
    }

    console.log(`Pronto: ${SAIDA}`);
  } finally {
    delete process.env.PKG_NODE_PATH;
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });

module.exports = { main };
