import { Download } from 'lucide-react';
import { Button, Card } from '../../ui';

/**
 * Extensão "2D Acessos" (Chrome/Edge) — abre Price já logado e os BIs de
 * Serviço/Cliente já cadastrados, sem instalar/publicar na Chrome Web Store
 * (uso interno, LAN). O .zip é gerado por `scripts/gerarZipExtensao.cjs` a
 * partir de `extensao-price-login/` e servido como asset estático (mesmo
 * caminho de favicon/ícones PWA) — não passa pelo backend. `npm run build`
 * já roda esse script antes do build do Vite (ver package.json), então toda
 * release publicada leva o .zip atualizado sem precisar lembrar — ele só
 * fica desatualizado em dev sem um build recente (`npm run build:extensao`
 * regenera isolado, sem rodar o build inteiro).
 */
export default function ExtensaoAcessosCard() {
  return (
    <Card flat>
      <div className="section-header">
        <h3>Extensão de acessos rápidos</h3>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
        Abre o Price já logado e os links de BI (Serviço/Cliente) direto do navegador, sem precisar abrir a Carteira.
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
      </ol>
      <Button variant="secondary" onClick={() => window.open('/extensao-2d-acessos.zip', '_blank')}>
        <Download size={15} /> Baixar extensão (.zip)
      </Button>
    </Card>
  );
}
