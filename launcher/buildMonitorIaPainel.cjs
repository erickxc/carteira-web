/**
 * Build do `2D_MonitorIA_Painel.exe` — cópia adaptada de `launcher/build.cjs`
 * (mesma sequência, mesmo ícone), só trocando entrada/saída. Ver lá pros
 * detalhes de POR QUE cada passo existe (payload do pkg descartado, ícone
 * fora do cache, Subsystem GUI).
 *
 * Rodar com `npm run build:launcher-ia`.
 */
const path = require('path');
const { exec: pkgExec } = require('@yao-pkg/pkg');
const { marcarComoGui } = require('./marcarComoGui.cjs');
const { prepararBaseComIcone, gruposDeIcone, ID_GRUPO_PRINCIPAL } = require('./aplicarIcone.cjs');
const fs = require('fs');
const os = require('os');

const ALVO = process.env.PKG_TARGET || 'node22-win-x64';
const SAIDA = path.join(__dirname, 'dist', '2D_MonitorIA_Painel.exe');
const ENTRADA = path.join(__dirname, 'indexMonitorIaPainel.cjs');
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
    if (icone.pronto) process.env.PKG_NODE_PATH = icone.caminho;
    await pkgExec([ENTRADA, '--target', ALVO, '--output', SAIDA]);

    const { alterado, subsystemAntes } = marcarComoGui(SAIDA);
    console.log(alterado ? `Subsystem ${subsystemAntes} -> GUI (2).` : 'Já era GUI (2).');

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
