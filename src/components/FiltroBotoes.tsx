import type { CSSProperties } from 'react';

interface FiltroBotoesProps {
  /** Rótulo do grupo (ex.: "Tipos", "Monitor"). */
  label: string;
  opcoes: string[];
  /** Selecionados. Vazio = todos (sem filtro). */
  valor: string[];
  onChange: (v: string[]) => void;
  /** Cor própria de cada opção (tipos de evento: a mesma da barra do card no
   *  calendário). O ativo usa essa cor no nome e no traço — sem ponto nem fundo. */
  corDe?: (opcao: string) => string;
}

/**
 * Grupo de filtro multi-seleção em botões, alternativa ao Dropdown para quando
 * as opções são poucas e a troca é frequente: um clique em vez de
 * abrir → escolher → fechar.
 *
 * Convenção de "Todos": seleção vazia significa sem filtro (mostra tudo), que é
 * como os filtros da Agenda já se comportavam — o botão "Todos" só limpa a
 * seleção, em vez de marcar todas as opções uma a uma (o que daria o mesmo
 * resultado visual, mas quebraria ao surgir uma categoria nova).
 */
export function FiltroBotoes({ label, opcoes, valor, onChange, corDe }: FiltroBotoesProps) {
  const nenhumSelecionado = valor.length === 0;

  function alternar(o: string) {
    onChange(valor.includes(o) ? valor.filter((v) => v !== o) : [...valor, o]);
  }

  return (
    <div className="agenda-filtro-linha">
      <span className="filtro-grupo-label">{label}:</span>
      <button
        className={`filtro-btn${nenhumSelecionado ? ' is-active' : ''}`}
        onClick={() => onChange([])}
        title={`Mostrar todos (${label.toLowerCase()})`}
      >
        Todos
      </button>
      {opcoes.map((o) => {
        const ativo = valor.includes(o);
        const cor = ativo ? corDe?.(o) : undefined;
        return (
          <button
            key={o}
            className={`filtro-btn${ativo ? ' is-active' : ''}`}
            aria-pressed={ativo}
            onClick={() => alternar(o)}
            style={cor ? ({ color: cor, '--filtro-cor': cor } as CSSProperties) : undefined}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
