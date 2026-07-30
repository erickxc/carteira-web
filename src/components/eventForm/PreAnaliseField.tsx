import { Plus, X } from 'lucide-react';
import { Button, Field, Input, Textarea } from '../../ui';
import type { usePreAnalise } from './usePreAnalise';

// Inputs da tabela de Pré-Análise são mais compactos que o padrão (grade
// apertada de 4 colunas) — antiga regra `.pa-row .field-input`.
const PA_INPUT_STYLE = { padding: '0.4rem 0.55rem', fontSize: '0.85rem' };

interface PreAnaliseFieldProps {
  pa: ReturnType<typeof usePreAnalise>;
}

/** Bloco "Pré-Análise" do formulário de evento — só aparece na edição. */
export function PreAnaliseField({ pa }: PreAnaliseFieldProps) {
  return (
    <Field as="div" label={<>Pré-Análise <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· preparação da reunião</span></>}>
      <div className="pa-table">
        <div className="pa-row pa-head"><span>Cliente</span><span>Produto</span><span>Orientação</span><span /></div>
        {pa.orientacoes.length === 0 && <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none', padding: '2px 0' }}>Nenhuma orientação.</span>}
        {pa.orientacoes.map((o) => (
          <div key={o.id} className="pa-row">
            <Input tone="modal" style={PA_INPUT_STYLE} value={o.cliente} placeholder="Cliente" onChange={(e) => pa.updOrientacao(o.id, 'cliente', e.target.value)} />
            <Input tone="modal" style={PA_INPUT_STYLE} value={o.produto} placeholder="Produto" onChange={(e) => pa.updOrientacao(o.id, 'produto', e.target.value)} />
            <Input tone="modal" style={PA_INPUT_STYLE} value={o.orientacao} placeholder="Orientação" onChange={(e) => pa.updOrientacao(o.id, 'orientacao', e.target.value)} />
            <Button variant="danger" size="icon" onClick={() => pa.removeOrientacao(o.id)} aria-label="Remover"><X size={13} /></Button>
          </div>
        ))}
        <Button variant="secondary" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={pa.addOrientacao}><Plus size={14} /> Orientação</Button>
      </div>
      <Field className="mt-3" label="Clientes em geral">
        <Textarea tone="modal" rows={2} value={pa.clientesGeral} onChange={(e) => pa.setClientesGeral(e.target.value)} />
      </Field>
      <Field label="Produtos em geral">
        <Textarea tone="modal" rows={2} value={pa.produtosGeral} onChange={(e) => pa.setProdutosGeral(e.target.value)} />
      </Field>
    </Field>
  );
}
