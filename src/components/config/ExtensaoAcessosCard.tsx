import { Download } from 'lucide-react';
import { Button, Card } from '../../ui';
import { urlDownloadExtensao } from '../../api/client';

/**
 * Extensão de acessos (Chrome/Edge), instalada "sem compactação" — uso
 * interno, fora da Chrome Web Store. A versão em uso vive na pasta do OneDrive
 * do Ecossistema; o backend monta o .zip na hora do clique a partir dela
 * (`server/routes/extensao.cjs`), então o download é sempre o mais recente.
 * Antes era um .zip estático gerado no build, que só mudava a cada release e
 * ficou preso numa versão antiga.
 */
export default function ExtensaoAcessosCard() {
  return (
    <Card flat>
      <div className="section-header">
        <h3>Extensão de acessos rápidos</h3>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
        Abre o Price já logado direto do navegador, sem precisar abrir a Carteira. O download é sempre a versão mais recente.
      </p>
      <ol style={{ margin: '0 0 14px', paddingLeft: 20, display: 'grid', gap: 6, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <li>Baixe o .zip abaixo e extraia numa pasta fixa (não apague depois de instalar).</li>
        <li>
          No Chrome/Edge, acesse <code>chrome://extensions</code> (ou <code>edge://extensions</code>).
        </li>
        <li>Ative o "Modo do desenvolvedor" (canto superior direito).</li>
        <li>
          Clique em "Carregar sem compactação" e escolha a pasta <code>2D Acessos</code> extraída do .zip.
        </li>
        <li>Para atualizar depois: baixe de novo, substitua a pasta e clique em "Recarregar" na extensão.</li>
      </ol>
      <Button variant="secondary" onClick={() => window.open(urlDownloadExtensao(), '_blank')}>
        <Download size={15} /> Baixar extensão (.zip)
      </Button>
    </Card>
  );
}
