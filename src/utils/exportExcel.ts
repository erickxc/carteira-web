import * as XLSX from 'xlsx';

/**
 * Exporta linhas (array de objetos {coluna: valor}) para um .xlsx e dispara o
 * download no navegador. `xlsx` é importado estático aqui: `ClientesPage.tsx`
 * já o importa estático para a importação de planilha, então o dynamic import
 * anterior não tirava nada do bundle principal — só gerava o aviso do Vite
 * (`INEFFECTIVE_DYNAMIC_IMPORT`) sem ganho real de code-splitting.
 */
export function exportarExcel(
  nomeArquivo: string,
  linhas: Record<string, unknown>[],
  sheetName = 'Dados'
): void {
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
