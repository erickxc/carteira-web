import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarPlus, FileSpreadsheet, MoreHorizontal, Pencil, PhoneIncoming, Trash2 } from 'lucide-react';
import { Button, Card } from '../../ui';
import type { Cliente } from '../../types';

interface CabecalhoFichaProps {
  cliente: Cliente;
  onNovoEvento: () => void;
  onLembrete: () => void;
  onContatoCliente: () => void;
  onEditar: () => void;
  onRelatorios: () => void;
  /** A confirmação fica em quem chama, junto da exclusão. */
  onExcluir: () => void;
}

/** Topo da ficha: quem é o cliente em texto (sem pílula nem ponto colorido) e o que dá para fazer. */
export function CabecalhoFicha({ cliente, onNovoEvento, onLembrete, onContatoCliente, onEditar, onRelatorios, onExcluir }: CabecalhoFichaProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAberto(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuAberto(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuAberto]);

  const situacao = [cliente.grupo && `Rede ${cliente.grupo}`, cliente.monitor, cliente.local, cliente.status, cliente.estado].filter(Boolean).join(' · ');

  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="flex-between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{cliente.empresa}</h1>
          <span className="text-text-muted" style={{ fontSize: 13 }}>{situacao}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onNovoEvento}><CalendarPlus size={15} /> Novo evento</Button>
          <Button variant="secondary" onClick={onLembrete}><Bell size={15} /> Lembrete</Button>
          <Button variant="secondary" onClick={onContatoCliente} title="Registrar que o cliente entrou em contato"><PhoneIncoming size={15} /> Cliente entrou em contato</Button>
          <Button variant="secondary" onClick={onEditar}><Pencil size={15} /> Editar cadastro</Button>
          <div ref={menuRef} className="relative">
            <Button variant="secondary" size="icon" onClick={() => setMenuAberto((v) => !v)} aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuAberto}>
              <MoreHorizontal size={15} />
            </Button>
            {menuAberto && (
              <div role="menu" className="filter-pop absolute right-0 top-[calc(100%+4px)]">
                <button type="button" role="menuitem" className="filter-pop-item" onClick={() => { setMenuAberto(false); onRelatorios(); }}>
                  <FileSpreadsheet size={14} /> Relatórios
                </button>
                <button type="button" role="menuitem" className="filter-pop-item" style={{ color: 'var(--danger-fg)' }} onClick={() => { setMenuAberto(false); onExcluir(); }}>
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
