import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LinhaAtendimento } from '../../utils/indicadoresPrazo';
import type { GrupoPrazo } from '../../utils/gruposPrazo';

interface LegendaGruposProps {
  grupos: GrupoPrazo[];
  linhas: Map<string, LinhaAtendimento>;
  onAbrirCliente: (id: string) => void;
}

const LARGURA = 640;
const ATRASO_FECHAR = 150;

/**
 * Legenda dos cards de prazo: passar o mouse (ou focar/tocar) num grupo mostra
 * um popup com o que o grupo significa e os atendimentos dele, só com as
 * colunas que explicam por que cada um está ali. Nada no layout se move.
 * O popup vai para o <body> (portal): o card tem transform no hover, que
 * prenderia um `position: fixed` dentro dele.
 */
export function LegendaGrupos({ grupos, linhas, onAbrirCliente }: LegendaGruposProps) {
  const [aberto, setAberto] = useState<{ key: string; x: number; y: number; acima: boolean; altura: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const cancelarFechar = () => window.clearTimeout(timer.current);
  const fecharDepois = () => {
    cancelarFechar();
    timer.current = window.setTimeout(() => setAberto(null), ATRASO_FECHAR);
  };
  function abrir(key: string, el: HTMLElement) {
    cancelarFechar();
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - LARGURA - 8));
    const acima = r.bottom > window.innerHeight * 0.6;
    const y = acima ? window.innerHeight - r.top + 6 : r.bottom + 6;
    setAberto({ key, x, y, acima, altura: (acima ? r.top : window.innerHeight - r.bottom) - 14 });
  }

  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(null);
    // Rolar a lista do próprio popup não fecha; rolar a página, sim.
    const aoRolar = (e: Event) => { if (!(e.target instanceof Node && document.querySelector('.legenda-pop')?.contains(e.target))) fechar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('scroll', aoRolar, true); window.removeEventListener('keydown', tecla); };
  }, [aberto]);
  useEffect(() => cancelarFechar, []);

  const grupo = aberto ? grupos.find((g) => g.key === aberto.key) : undefined;
  const linhasDoGrupo = grupo
    ? grupo.itens.map((i) => linhas.get(i.id)).filter((l): l is LinhaAtendimento => !!l)
        .sort((a, b) => (grupo.entrega(b)?.getTime() ?? -Infinity) - (grupo.entrega(a)?.getTime() ?? -Infinity) || a.nome.localeCompare(b.nome))
    : [];

  return (
    <div className="kpi-legenda">
      {grupos.map((g) => (
        <button
          key={g.key}
          type="button"
          className={`kpi-legenda-botao${aberto?.key === g.key ? ' is-ativo' : ''}`}
          aria-expanded={aberto?.key === g.key}
          onMouseEnter={(e) => abrir(g.key, e.currentTarget)}
          onMouseLeave={fecharDepois}
          onFocus={(e) => abrir(g.key, e.currentTarget)}
          onBlur={fecharDepois}
          onClick={(e) => (aberto?.key === g.key ? setAberto(null) : abrir(g.key, e.currentTarget))}
        >
          <i style={{ background: g.cor }} />{g.label} <strong>{g.itens.length}</strong>
          {g.sufixo && <span className="text-text-muted"> · {g.sufixo}</span>}
        </button>
      ))}
      {aberto && grupo && createPortal(
        <div
          className="legenda-pop"
          role="dialog"
          aria-label={`${grupo.label}: ${grupo.itens.length} atendimentos`}
          style={{ left: aberto.x, minWidth: 360, maxWidth: LARGURA, maxHeight: Math.min(aberto.altura, 440), ...(aberto.acima ? { bottom: aberto.y } : { top: aberto.y }) }}
          onMouseEnter={cancelarFechar}
          onMouseLeave={fecharDepois}
        >
          <p className="legenda-pop-titulo"><i style={{ background: grupo.cor }} />{grupo.label} <strong>{grupo.itens.length}</strong></p>
          <p className="legenda-pop-desc">{grupo.descricao}</p>
          {linhasDoGrupo.length === 0 ? (
            <p className="legenda-pop-vazio">Nenhum atendimento.</p>
          ) : (
            <div className="legenda-pop-lista">
              <table>
                <thead>
                  <tr><th>Atendimento</th>{grupo.colunas.map((c) => <th key={c.titulo}>{c.titulo}</th>)}</tr>
                </thead>
                <tbody>
                  {linhasDoGrupo.map((l) => (
                    <tr key={l.id} onClick={() => onAbrirCliente(l.id)} title="Abrir cliente">
                      <td className="legenda-pop-nome">{l.nome}</td>
                      {grupo.colunas.map((c) => {
                        const v = c.valor(l);
                        // Data: cor do destaque, mais clara quanto mais antiga (35% a 100%).
                        const estilo = v.forca === undefined ? undefined : { color: `color-mix(in srgb, var(--accent) ${Math.round(35 + 65 * v.forca)}%, var(--text-muted))` };
                        return <td key={c.titulo} className={`is-${v.tom}`} style={estilo} title={v.dica}>{v.texto}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
