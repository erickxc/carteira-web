import { Plus, X } from 'lucide-react';
import { Button, Field, Input } from '../../ui';
import type { useProdutosSituacao } from './useProdutosSituacao';

interface ProdutosSituacaoFieldProps {
  ps: ReturnType<typeof useProdutosSituacao>;
  /** Cliente segmentado (rede/grupo): mostra a coluna extra "Cliente" (loja
   *  atende clientes finais próprios). Cliente unitário só produto+situação. */
  segmentado: boolean;
}

/**
 * Bloco "Produtos — Situação" (serviço Monitoria). Registro do que aconteceu
 * com cada produto na reunião — vira fato consumido pela análise de IA
 * (`server/ia/analiseCliente.cjs`, textoEvento), não é preparação.
 */
export function ProdutosSituacaoField({ ps, segmentado }: ProdutosSituacaoFieldProps) {
  return (
    <Field
      as="div"
      label={
        <>
          Produtos {segmentado ? '+ Cliente' : ''} — Situação{' '}
          <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>
            · o que mudou em cada produto{segmentado ? ' (e em qual cliente)' : ''}
          </span>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4, marginBottom: 8 }}>
        {ps.itens.length === 0 && <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhum produto registrado.</span>}
        {ps.itens.map((it) => (
          <div key={it.id} className="check-item">
            <span style={{ flex: 1 }}>
              <strong>{it.produto}</strong>
              {segmentado && it.cliente ? <span className="text-text-muted"> ({it.cliente})</span> : null}
              {': '}{it.situacao}
            </span>
            <Button variant="secondary" size="icon" onClick={() => ps.removeItem(it.id)} aria-label="Remover"><X size={12} /></Button>
          </div>
        ))}
      </div>
      <div className="flex-row" style={{ gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Input tone="modal" style={{ flex: segmentado ? '1 1 140px' : '1 1 180px' }} placeholder="Produto" value={ps.produto} onChange={(e) => ps.setProduto(e.target.value)} />
        {segmentado && (
          <Input tone="modal" style={{ flex: '1 1 140px' }} placeholder="Cliente (loja)" value={ps.cliente} onChange={(e) => ps.setCliente(e.target.value)} />
        )}
        <Input
          tone="modal"
          style={{ flex: '2 1 220px' }}
          placeholder="Situação (ex.: vendas zeraram em julho)"
          value={ps.situacao}
          onChange={(e) => ps.setSituacao(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ps.addItem(); } }}
        />
        <Button variant="primary" size="icon" onClick={ps.addItem} disabled={!ps.produto.trim() || !ps.situacao.trim()}><Plus size={16} /></Button>
      </div>
    </Field>
  );
}
