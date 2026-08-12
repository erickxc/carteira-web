interface FiltroBotoesProps {
  /** Rótulo do grupo (ex.: "Tipos", "Monitor"). */
  label: string;
  opcoes: string[];
  /** Selecionados. Vazio = todos (sem filtro). */
  valor: string[];
  onChange: (v: string[]) => void;
  /** Quando informado, o botão ativo usa a cor da própria opção (tipos de evento). */
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
        const cor = corDe?.(o);
        return (
          <button
            key={o}
            className={`filtro-btn${ativo ? ' is-active' : ''}`}
            aria-pressed={ativo}
            onClick={() => alternar(o)}
            // Cor por opção só quando ativo: assim o botão marcado repete a cor
            // do chip no calendário, ligando filtro e conteúdo sem legenda.
            style={ativo && cor
              ? { borderColor: cor, color: cor, background: `color-mix(in srgb, ${cor} 16%, transparent)` }
              : undefined}
          >
            {cor && (
              <i
                aria-hidden
                style={{
                  width: 8, height: 8, borderRadius: 2, background: cor,
                  display: 'inline-block', marginRight: 5, verticalAlign: 'middle',
                  opacity: ativo ? 1 : 0.65,
                }}
              />
            )}
            {o}
          </button>
        );
      })}
    </div>
  );
}
