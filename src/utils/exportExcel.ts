/**
 * Exporta linhas (array de objetos {coluna: valor}) para um .xlsx e dispara o
 * download no navegador. O SheetJS (`xlsx`) é pesado, então é carregado sob
 * demanda (dynamic import) — só entra no bundle quando o usuário exporta.
 */
export async function exportarExcel(
  nomeArquivo: string,
  linhas: Record<string, unknown>[],
  sheetName = 'Dados'
): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(linhas);
  // Largura automática básica das colunas pelo conteúdo.
  const cols = linhas.length ? Object.keys(linhas[0]) : [];
  ws['!cols'] = cols.map((c) => {
    const max = Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length));
    return { wch: Math.min(Math.max(max + 2, 10), 60) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, nomeArquivo);
}
