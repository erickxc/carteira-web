import { Check, Plus, X } from 'lucide-react';
import { Button, Chip, Field, Input } from '../../ui';
import type { useChecklist } from './useChecklist';

// Etiquetas rápidas para itens da pauta/checklist da reunião.
const ETIQUETAS = ['#Contato', '#Alvo', '#Price', '#Relatório'];

interface ChecklistFieldProps {
  ck: ReturnType<typeof useChecklist>;
}

/** Bloco "Checklist / pauta" do formulário de evento. */
export function ChecklistField({ ck }: ChecklistFieldProps) {
  return (
    <Field as="div" label="Checklist / pauta">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4, marginBottom: 8 }}>
        {ck.checklist.length === 0 && <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhum item.</span>}
        {ck.checklist.map((it) => (
          <div key={it.id} className="check-item">
            <button type="button" className={`filter-check${it.done ? ' is-on' : ''}`} onClick={() => ck.toggleItem(it.id)}>
              {it.done && <Check size={11} strokeWidth={3} />}
            </button>
            <span style={{ flex: 1, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{it.text}</span>
            <Button variant="secondary" size="icon" onClick={() => ck.removeItem(it.id)} aria-label="Remover"><X size={12} /></Button>
          </div>
        ))}
      </div>
      <div className="flex-row">
        <Input tone="modal" placeholder="Nova atividade..." value={ck.novoItem} onChange={(e) => ck.setNovoItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ck.addItem(); } }} />
        <Button variant="primary" size="icon" onClick={ck.addItem} disabled={!ck.novoItem.trim()}><Plus size={16} /></Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="text-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'center' }}>Etiquetas:</span>
        {ETIQUETAS.map((tag) => (
          <Chip key={tag} variant="toggle" onClick={() => ck.addEtiqueta(tag)}>{tag}</Chip>
        ))}
      </div>
    </Field>
  );
}
