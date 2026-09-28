import { useIndicadorDeslizante } from '../../hooks/useIndicadorDeslizante';

interface Aba<K extends string> {
  key: K;
  label: string;
  contagem: number;
  /** Classe do número (ex.: 'vencendo-total' para destacar em cor de atenção). */
  classeContagem?: string;
}

interface AbasDeslizantesProps<K extends string> {
  abas: Aba<K>[];
  ativa: K;
  onTrocar: (k: K) => void;
  rotulo: string;
  /** Ocupa a largura toda, abas divididas por igual. */
  cheio?: boolean;
}

/** Seletor em pílula: o fundo da aba ativa é um único elemento que desliza até a escolhida. */
export function AbasDeslizantes<K extends string>({ abas, ativa, onTrocar, rotulo, cheio }: AbasDeslizantesProps<K>) {
  const [ref, estilo] = useIndicadorDeslizante<HTMLDivElement>('[aria-selected="true"]');

  return (
    <div className={cheio ? 'kpi-abas is-cheio' : 'kpi-abas'} role="tablist" aria-label={rotulo} ref={ref}>
      {estilo && <span className="kpi-abas-indicador" style={estilo} aria-hidden />}
      {abas.map((a) => (
        <button key={a.key} type="button" role="tab" aria-selected={a.key === ativa} className={a.key === ativa ? 'is-ativa' : ''} onClick={() => onTrocar(a.key)}>
          {a.label} <span className={a.classeContagem ?? 'afazer-contagem'}>{a.contagem}</span>
        </button>
      ))}
    </div>
  );
}
