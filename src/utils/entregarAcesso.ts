/**
 * Copia pela API moderna e, sem ela, por `execCommand`: a Carteira também é
 * servida por HTTP na LAN, onde o navegador não libera `navigator.clipboard`.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      campo.remove();
    }
  }
}

/**
 * Copia a senha e SÓ DEPOIS abre o link: a aba nova tira o foco desta, e o
 * navegador recusa escrever na área de transferência de página sem foco.
 * `window.open` com `noopener` sempre devolve null, então o bloqueio de pop-up
 * só é detectável abrindo sem ele e cortando o `opener` em seguida.
 */
export async function entregarAcesso(senha: string, url?: string): Promise<{ copiou: boolean; abriu: boolean }> {
  const copiou = await copiarTexto(senha);
  if (!url) return { copiou, abriu: true };
  const aba = window.open(url, '_blank');
  if (aba) aba.opener = null;
  return { copiou, abriu: Boolean(aba) };
}
