import { ArrowDown, ArrowRight, ArrowUp, Plus, X } from 'lucide-react';
import { Badge, Button, Field, Input } from '../../ui';
import { Dropdown } from '../Dropdown';
import type { BadgeVariant } from '../../ui';
import { MARGEM_PRECIFICACAO_LABEL, type MargemPrecificacao } from '../../types';
import type { usePrecificacao } from './usePrecificacao';

const MARGEM_VARIANT: Record<MargemPrecificacao, BadgeVariant> = { subiu: 'success', desceu: 'danger', manteve: 'muted' };
const MARGEM_ICON: Record<MargemPrecificacao, typeof ArrowUp> = { subiu: ArrowUp, desceu: ArrowDown, manteve: ArrowRight };

interface PrecificacaoFieldProps {
  pc: ReturnType<typeof usePrecificacao>;
}

/**
 * Marcadores de produto precificado + direção da margem (tipo de evento
 * "Precificação", registro avulso). Vira fato consumido pela análise de IA
 * (`server/ia/analiseCliente.cjs`, textoEvento).
 */
export function PrecificacaoField({ pc }: PrecificacaoFieldProps) {
  return (
    <Field
      as="div"
      label={
        <>
          Produtos precificados{' '}
          <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>
            · marque cada produto e a direção da margem
          </span>
        </>
      }
    >
      <div className="flex flex-wrap gap-2" style={{ marginTop: 4, marginBottom: 8 }}>
        {pc.itens.length === 0 && <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhum produto marcado.</span>}
        {pc.itens.map((it) => {
          const Icone = MARGEM_ICON[it.margem];
          return (
            <Badge key={it.id} variant={MARGEM_VARIANT[it.margem]} style={{ gap: 5 }}>
              <Icone size={11} /> {it.produto} — {MARGEM_PRECIFICACAO_LABEL[it.margem]}
              <button type="button" onClick={() => pc.removeItem(it.id)} aria-label="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'inherit' }}>
                <X size={11} />
              </button>
            </Badge>
          );
        })}
      </div>
      <div className="flex-row" style={{ gap: 6 }}>
        <Input
          tone="modal"
          style={{ flex: 1 }}
          placeholder="Produto"
          value={pc.produto}
          onChange={(e) => pc.setProduto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pc.addItem(); } }}
        />
        <div style={{ width: 130 }}>
          <Dropdown
            variant="campo"
            label="Margem"
            value={pc.margem}
            onChange={(v) => pc.setMargem(v as MargemPrecificacao)}
            options={(Object.keys(MARGEM_PRECIFICACAO_LABEL) as MargemPrecificacao[]).map((m) => ({ value: m, label: MARGEM_PRECIFICACAO_LABEL[m] }))}
          />
        </div>
        <Button variant="primary" size="icon" onClick={pc.addItem} disabled={!pc.produto.trim()} title="Adicionar produto"><Plus size={16} /></Button>
      </div>
    </Field>
  );
}
