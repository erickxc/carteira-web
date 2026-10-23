import { Plus, X } from 'lucide-react';
import { Button, Input } from '../../ui';
import { formatarCNPJ } from '../../utils/cnpj';
import { cnpjIncompleto, type LojaEmEdicao } from '../../utils/lojas';

/**
 * Lojas do atendimento no cadastro (1.6.8): o atendimento é a unidade de
 * análise; cada loja tem o próprio nome, CNPJ e endereço.
 */
export function EditorLojas({ lojas, onChange }: { lojas: LojaEmEdicao[]; onChange: (l: LojaEmEdicao[]) => void }) {
  const mudar = (i: number, campo: keyof LojaEmEdicao, valor: string) =>
    onChange(lojas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  return (
    <div className="grid gap-2">
      {lojas.length === 0 && <p className="text-text-muted" style={{ fontSize: 12.5, margin: 0 }}>Nenhuma loja cadastrada.</p>}
      {lojas.map((l, i) => (
        <div key={i} className="grid gap-1">
          <div className="grid gap-2 items-center" style={{ gridTemplateColumns: 'minmax(0, 1fr) 168px 30px' }}>
            <Input tone="modal" aria-label={`Nome da loja ${i + 1}`} placeholder="Loja (ex.: Altese GM)" value={l.nome} onChange={(e) => mudar(i, 'nome', e.target.value)} />
            <Input tone="modal" aria-label={`CNPJ da loja ${i + 1}`} placeholder="00.000.000/0000-00" value={l.cnpj} aria-invalid={cnpjIncompleto(l.cnpj)} onChange={(e) => mudar(i, 'cnpj', e.target.value)} onBlur={(e) => mudar(i, 'cnpj', formatarCNPJ(e.target.value))} />
            <Button variant="ghost" size="icon" aria-label={`Remover loja ${l.nome || i + 1}`} onClick={() => onChange(lojas.filter((_, j) => j !== i))}><X /></Button>
          </div>
          <Input tone="modal" aria-label={`Endereço da loja ${i + 1}`} placeholder="Endereço" value={l.endereco} onChange={(e) => mudar(i, 'endereco', e.target.value)} />
          {cnpjIncompleto(l.cnpj) && <span className="text-[0.75rem] text-[color:var(--danger-fg)]">CNPJ incompleto: precisa ter 14 dígitos.</span>}
        </div>
      ))}
      <div>
        <Button size="sm" onClick={() => onChange([...lojas, { nome: '', cnpj: '', endereco: '' }])}><Plus /> Adicionar loja</Button>
      </div>
    </div>
  );
}
