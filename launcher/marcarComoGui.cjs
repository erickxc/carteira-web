/**
 * Troca o campo Subsystem do cabeçalho PE de um .exe Windows de "console"
 * (3, IMAGE_SUBSYSTEM_WINDOWS_CUI) para "GUI" (2, IMAGE_SUBSYSTEM_WINDOWS_GUI)
 * — é o que faz o Windows NUNCA alocar uma janela de console pra esse
 * processo, em nenhuma circunstância (garantido pelo loader do Windows, não
 * por um truque em runtime como `windowsHide`/relançamento oculto, que
 * dependia do processo já ter sido criado sem console — o `.exe` do launcher
 * é "console" por padrão porque o build oficial do Node.js sempre é).
 *
 * Só troca 2 bytes, no lugar, sem mudar o tamanho do arquivo — por isso é
 * seguro usar direto no binário-base do `pkg` antes do build (mesmo padrão
 * de `rcedit` pro ícone, ver CLAUDE.md/histórico): o `pkg` anexa seu payload
 * depois do fim da imagem PE normal, e qualquer edição que NÃO mude o
 * tamanho do arquivo nunca desloca esse payload.
 *
 * `console.log`/saída padrão continuam existindo como conceito no processo,
 * só não têm quem exibir (sem console) — não é um problema aqui porque
 * `launcher/index.cjs` já grava tudo relevante em arquivo (`registrarLog`),
 * nunca dependeu do console ser visível.
 */
const fs = require('fs');

const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;

function marcarComoGui(caminhoExe) {
  const buf = fs.readFileSync(caminhoExe);
  const peOffset = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOffset) !== 0x00004550) { // "PE\0\0"
    throw new Error(`marcarComoGui: assinatura PE não encontrada em ${caminhoExe} — arquivo inesperado.`);
  }
  // PE signature (4) + File Header (20) + campos do Optional Header antes de
  // Subsystem (68, válido tanto pra PE32 quanto PE32+ — o layout é idêntico
  // até esse ponto nas duas variantes).
  const subsystemOffset = peOffset + 4 + 20 + 68;
  const subsystemAtual = buf.readUInt16LE(subsystemOffset);
  if (subsystemAtual === IMAGE_SUBSYSTEM_WINDOWS_GUI) return { alterado: false, subsystemAntes: subsystemAtual };
  buf.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, subsystemOffset);
  fs.writeFileSync(caminhoExe, buf);
  return { alterado: true, subsystemAntes: subsystemAtual };
}

if (require.main === module) {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error('Uso: node marcarComoGui.cjs <caminho-do-exe>');
    process.exit(1);
  }
  const resultado = marcarComoGui(caminho);
  console.log(resultado.alterado
    ? `Subsystem trocado de ${resultado.subsystemAntes} para GUI (2) em ${caminho}.`
    : `${caminho} já era GUI (2) — nada a fazer.`);
}

module.exports = { marcarComoGui, IMAGE_SUBSYSTEM_WINDOWS_GUI };
