import { useState } from 'react';
import { Copy } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { Button } from '../ui';
import { toastSuccess } from '../utils/toast';
import { CHAVE_AVISO_DISPENSADO, CHAVE_MOSTRAR_AVISO, ENDERECO_POR_NOME, estaNoEnderecoPorNome } from '../enderecoLocal/regras';

/** Aparece logo depois de a página ser levada pro endereço novo, até a pessoa marcar "Não mostrar novamente". */
export function AvisoNovoEndereco() {
  const [aberto, setAberto] = useState(
    () => estaNoEnderecoPorNome(window.location) && localStorage.getItem(CHAVE_MOSTRAR_AVISO) === '1'
  );
  const [naoMostrar, setNaoMostrar] = useState(false);

  if (!aberto) return null;

  function fechar() {
    localStorage.removeItem(CHAVE_MOSTRAR_AVISO);
    if (naoMostrar) localStorage.setItem(CHAVE_AVISO_DISPENSADO, '1');
    setAberto(false);
  }

  function copiar() {
    navigator.clipboard.writeText(`${ENDERECO_POR_NOME}/`).then(() => toastSuccess('Endereço copiado.')).catch(() => {});
  }

  return (
    <ModalShell
      title="A CARTEIRA 2D mudou de endereço"
      onClose={fechar}
      onSubmit={(e) => { e.preventDefault(); fechar(); }}
      footer={<Button type="submit" variant="primary">Entendi</Button>}
    >
      <p style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
        A partir de agora a Carteira abre em:
      </p>
      <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
        <code style={{ fontSize: '0.95rem', padding: '6px 10px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}>
          {ENDERECO_POR_NOME}/
        </code>
        <Button variant="secondary" onClick={copiar} title="Copiar endereço" aria-label="Copiar endereço">
          <Copy size={14} />
        </Button>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', display: 'grid', gap: 6 }} className="text-text-secondary">
        <li>Salve nos favoritos com <strong>Ctrl+D</strong>. O <code>2D_Carteira.exe</code> continua abrindo sozinho, como antes.</li>
        <li>Suas preferências (tema, filtro de monitor, conversa do monitorIA) vieram junto.</li>
        <li>Instalou a Carteira como app no navegador? Reinstale por este endereço.</li>
        <li>Prefere o endereço antigo? Desmarque em <strong>Configurações → Sistema</strong>.</li>
      </ul>
      <label className="flex items-center gap-2" style={{ marginTop: 14, fontSize: '0.85rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={naoMostrar} onChange={(e) => setNaoMostrar(e.target.checked)} className="accent-[var(--accent)]" />
        Não mostrar novamente
      </label>
    </ModalShell>
  );
}
