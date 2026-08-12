import { Field, Textarea } from '../../ui';
import type { usePreAnalise } from './usePreAnalise';

interface PreAnaliseFieldProps {
  pa: ReturnType<typeof usePreAnalise>;
}

/** Bloco "Pré-Análise" do formulário de evento — só aparece na edição. */
export function PreAnaliseField({ pa }: PreAnaliseFieldProps) {
  return (
    <Field
      label={
        <>
          Pré-Análise{' '}
          <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>
            · anotação breve de preparação
          </span>
        </>
      }
    >
      <Textarea
        tone="modal"
        rows={3}
        value={pa.texto}
        onChange={(e) => pa.setTexto(e.target.value)}
        placeholder="O que precisa ser olhado antes da reunião (ex.: curva A com margem caindo, rever fornecedor X)"
      />
    </Field>
  );
}
