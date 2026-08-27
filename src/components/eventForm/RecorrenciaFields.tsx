import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { previewAgendaSerie } from '../../api/client';
import { Chip, Field, Input, Select } from '../../ui';
import { DIAS_SEMANA } from '../../utils/diasSemana';
import type { OffsetLembrete } from '../../types';
import type { useRecorrencia } from './useRecorrencia';

const DIAS_DO_MES = Array.from({ length: 31 }, (_, i) => i + 1);
const OPCOES_LEMBRETE: { v: OffsetLembrete; label: string }[] = [
  { v: '1h', label: '1 hora antes' },
  { v: '1d', label: '1 dia antes' },
  { v: '2d', label: '2 dias antes' },
  { v: '7d', label: '1 semana antes' },
];

interface RecorrenciaFieldsProps {
  rec: ReturnType<typeof useRecorrencia>;
  /** Data-base do evento (define o dia-do-mês em "X vezes por mês" e o início
   *  da série) — vem do campo Data do formulário. */
  baseData: Date | null;
}

/** Bloco "Recorrência" do formulário de evento — só aparece na criação (não
 *  edição). Monta uma REGRA aberta (sem "durante N meses"); o servidor
 *  materializa o mês corrente ao salvar e os seguintes conforme chegam. */
export function RecorrenciaFields({ rec, baseData }: RecorrenciaFieldsProps) {
  const [preview, setPreview] = useState<{ datas: string[]; total: number } | null>(null);
  const [previewErro, setPreviewErro] = useState(false);

  // Prévia com pequeno debounce — refaz sempre que o modo/parâmetros/data
  // mudam, pra sempre mostrar exatamente o que a regra atual vai gerar (a
  // matemática de datas só existe no servidor, ver useRecorrencia).
  useEffect(() => {
    let cancelado = false;
    const regra = rec.recorrente && baseData ? rec.montarRegra(baseData) : null;
    // Sem regra válida (modo "única" ou parâmetros incompletos): limpa a
    // prévia num microtask, não direto no corpo do efeito — chamar setState
    // síncrono ali dispara o aviso de cascata do React.
    if (!regra || !baseData) {
      const t = window.setTimeout(() => { if (!cancelado) setPreview(null); }, 0);
      return () => { cancelado = true; window.clearTimeout(t); };
    }
    const timer = window.setTimeout(async () => {
      try {
        const r = await previewAgendaSerie(regra, format(baseData, 'yyyy-MM-dd'));
        if (!cancelado) { setPreview(r); setPreviewErro(false); }
      } catch {
        if (!cancelado) { setPreview(null); setPreviewErro(true); }
      }
    }, 400);
    return () => { cancelado = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.recorrente, rec.recorrMode, rec.diaSemana, rec.vezesPorMes, rec.diasDoMes, baseData]);

  return (
    <>
      <Field as="div" label="Recorrência">
        <div className="flex flex-wrap gap-2">
          <Chip variant="toggle" active={rec.recorrMode === 'unica'} onClick={() => rec.setRecorrMode('unica')}>Única</Chip>
          <Chip variant="toggle" active={rec.recorrMode === 'semanal'} onClick={() => rec.setRecorrMode('semanal')}>Toda semana</Chip>
          <Chip variant="toggle" active={rec.recorrMode === 'mensalVezes'} onClick={() => rec.setRecorrMode('mensalVezes')}>Vezes por mês</Chip>
          <Chip variant="toggle" active={rec.recorrMode === 'diasMes'} onClick={() => rec.setRecorrMode('diasMes')}>Dias fixos do mês</Chip>
        </div>
        {rec.recorrente && (
          <p className="text-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
            Fica valendo enquanto não for desativada — sem definir "por quantos meses". Editável depois em Configurações → Séries de agenda.
          </p>
        )}
      </Field>

      {rec.recorrMode === 'semanal' && (
        <Field className="w-[180px]" label="Toda">
          <Select tone="modal" value={rec.diaSemana} onChange={(e) => rec.setDiaSemana(Number(e.target.value))}>
            {DIAS_SEMANA.map((d) => (<option key={d.v} value={d.v}>{d.label}</option>))}
          </Select>
        </Field>
      )}

      {rec.recorrMode === 'mensalVezes' && (
        <Field className="w-[160px]" label="Vezes por mês">
          <Input tone="modal" type="number" min={1} max={31} value={rec.vezesPorMes} onChange={(e) => rec.setVezesPorMes(Number(e.target.value))} />
          <span className="text-text-muted" style={{ fontSize: 12 }}>1ª ocorrência no mesmo dia-do-mês da Data acima.</span>
        </Field>
      )}

      {rec.recorrMode === 'diasMes' && (
        <Field as="div" label="Dias fixos do mês">
          <div className="flex flex-wrap gap-2">
            {DIAS_DO_MES.map((d) => (
              <Chip key={d} variant="toggle" active={rec.diasDoMes.includes(d)} onClick={() => rec.toggleDiaDoMes(d)}>{d}</Chip>
            ))}
          </div>
        </Field>
      )}

      {rec.recorrente && (
        <div className="text-[0.8rem]" style={{ marginTop: -6, marginBottom: 4 }}>
          {previewErro && <span className="text-danger">Não foi possível calcular a prévia.</span>}
          {preview && preview.datas.length > 0 && (
            <span className="text-text-secondary">
              Próximas datas: {preview.datas.slice(0, 4).map((d) => format(parseISO(d), 'dd/MM')).join(', ')}
              {preview.total > 4 ? ` (+${preview.total - 4} nos próximos 3 meses)` : ''}
            </span>
          )}
          {preview && preview.datas.length === 0 && (
            <span className="text-text-muted">Nenhuma data nos próximos 3 meses com essa configuração.</span>
          )}
        </div>
      )}

      <Field as="div" label="Lembrete automático">
        <div className="flex flex-wrap gap-2">
          {OPCOES_LEMBRETE.map((o) => (
            <Chip key={o.v} variant="toggle" active={rec.lembretesOffsets.includes(o.v)} onClick={() => rec.toggleLembrete(o.v)}>{o.label}</Chip>
          ))}
        </div>
        {rec.lembretesOffsets.length === 0 && (
          <span className="text-text-muted" style={{ fontSize: 12 }}>Sem lembrete — selecione um ou mais acima.</span>
        )}
      </Field>
    </>
  );
}
