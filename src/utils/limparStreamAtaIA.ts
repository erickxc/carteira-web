/**
 * O modelo gera a ata como um JSON `{ oQueFoiTratado, decisoes, proximosPassos }`
 * (ver `server/ia/geracaoAta.cjs`), e o streaming (`gerarAtaComIAStream`)
 * expõe o texto BRUTO acumulado enquanto chega — sem tratamento, isso
 * aparecia no campo Ata como JSON quebrado crescendo (`{"oQueFoiTratado":
 * "Real...`), em vez de texto legível. Aqui não fazemos parsing de verdade
 * (o JSON está incompleto até o fim, não dá pra `JSON.parse` no meio) — só
 * removemos a "sintaxe" visível (chaves, aspas, nomes de campo) por regex,
 * pra sobrar só o texto sendo escrito, mantendo a sensação de "ata sendo
 * digitada ao vivo" que o usuário pediu pra preservar.
 */
export function limparStreamAtaIA(bufferBruto: string): string {
  return bufferBruto
    // Nome do campo + aspas de abertura do valor vira quebra de seção.
    .replace(/^\s*\{?\s*"oQueFoiTratado"\s*:\s*"/, '')
    .replace(/"\s*,\s*"decisoes"\s*:\s*"/g, '\n\nDecisões:\n')
    .replace(/"\s*,\s*"proximosPassos"\s*:\s*"/g, '\n\nPróximos passos:\n')
    // Aspas/chave de fechamento no final (só aparecem quando o campo atual
    // já terminou de streamar) — remove se estiverem penduradas no final.
    .replace(/"\s*\}?\s*$/, '')
    // Escapes JSON: quebra de linha e aspas escapadas.
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"');
}
