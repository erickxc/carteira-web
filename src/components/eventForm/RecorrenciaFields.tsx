import { format, parse } from 'date-fns';
import { Plus } from 'lucide-react';
import { Badge, Button, Chip, Field, Input, Select } from '../../ui';
import { DIAS_SEMANA } from '../../utils/diasSemana';
import type { useRecorrencia } from './useRecorrencia';

interface RecorrenciaFieldsProps {
  rec: ReturnType<typeof useRecorrencia>;
}

/** Bloco "Recorrência" do formulário de evento — só aparece na criação (não edição). */
export function RecorrenciaFields({ rec }: RecorrenciaFieldsProps) {
  return (
    <>
      <Field as="div" label="Recorrência">
        <div className="flex flex-wrap gap-2">
          <Chip variant="toggle" active={rec.recorrMode === 'unica'} onClick={() => rec.setRecorrMode('unica')}>Única</Chip>
          <Chip variant="toggle" active={rec.recorrMode === 'cadencia'} onClick={() => rec.setRecorrMode('cadencia')}>Cadência</Chip>
          <Chip variant="toggle" active={rec.recorrMode === 'semana'} onClick={() => rec.setRecorrMode('semana')}>Dia da semana</Chip>
          <Chip variant="toggle" active={rec.recorrMode === 'avulso'} onClick={() => rec.setRecorrMode('avulso')}>Avulso</Chip>
        </div>
      </Field>

      {rec.recorrMode === 'cadencia' && (
        <div className="flex-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field className="w-[140px]" label="Vezes por mês">
            <Input tone="modal" type="number" min={1} max={31} value={rec.vezesPorMes} onChange={(e) => rec.setVezesPorMes(Number(e.target.value))} />
          </Field>
          <Field className="w-[140px]" label="Durante (meses)">
            <Input tone="modal" type="number" min={1} max={24} value={rec.duracaoMeses} onChange={(e) => rec.setDuracaoMeses(Number(e.target.value))} />
          </Field>
          <span className="text-text-muted" style={{ fontSize: 12, paddingBottom: 10 }}>
            = {Math.max(1, Math.min(31, rec.vezesPorMes)) * Math.max(1, Math.min(24, rec.duracaoMeses))} eventos no total
          </span>
        </div>
      )}

      {rec.recorrMode === 'semana' && (
        <div className="flex-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field className="flex-1" label="Toda">
            <Select tone="modal" value={rec.diaSemana} onChange={(e) => rec.setDiaSemana(Number(e.target.value))}>
              {DIAS_SEMANA.map((d) => (<option key={d.v} value={d.v}>{d.label}</option>))}
            </Select>
          </Field>
          <Field className="w-[120px]" label="Quantidade">
            <Input tone="modal" type="number" min={1} max={52} value={rec.ocorrencias} onChange={(e) => rec.setOcorrencias(Number(e.target.value))} />
          </Field>
        </div>
      )}

      {rec.recorrMode === 'avulso' && (
        <Field as="div" label="Datas do evento">
          <div className="flex-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input tone="modal" type="date" value={rec.novaDataAvulsa} onChange={(e) => rec.setNovaDataAvulsa(e.target.value)} style={{ width: 175 }} />
            <Button variant="secondary" onClick={rec.addDataAvulsa} disabled={!rec.novaDataAvulsa}><Plus size={14} /> Adicionar data</Button>
          </div>
          <p className="text-text-muted" style={{ fontSize: 12, marginTop: 6 }}>A data principal (acima) é a 1ª ocorrência; adicione as demais aqui.</p>
          {rec.datasAvulsas.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {rec.datasAvulsas.map((d) => (
                <Badge key={d} variant="muted">
                  {format(parse(d, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}
                  <button type="button" onClick={() => rec.removeDataAvulsa(d)} style={{ marginLeft: 6, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontSize: 14, lineHeight: 1 }}>×</button>
                </Badge>
              ))}
            </div>
          )}
        </Field>
      )}
    </>
  );
}
