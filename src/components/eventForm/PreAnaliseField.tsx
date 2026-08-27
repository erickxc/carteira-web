import { Field, Textarea } from '../../ui';
import type { usePreAnalise } from './usePreAnalise';

interface PreAnaliseFieldProps {
  pa: ReturnType<typeof usePreAnalise>;
}

/** Bloco "Preparação" (antiga "Pré-Análise") do formulário de evento — só
 *  aparece na edição, porque é o que se anota depois de marcar a reunião e
 *  antes de realizá-la. */
export function PreAnaliseField({ pa }: PreAnaliseFieldProps) {
  return (
    <Field
      label={
        <>
          Preparação{' '}
          <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>
            · o que olhar antes da reunião
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
