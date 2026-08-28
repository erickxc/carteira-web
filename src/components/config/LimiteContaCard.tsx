import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Gauge, RefreshCw } from 'lucide-react';
import { buscarLimiteContaClaude, type JanelaCota, type LimiteContaClaude } from '../../api/client';
import { Card } from '../../ui';

/**
 * Janela de 5h / limite de 7 dias da assinatura Claude — o dado que o
 * usuário viu em extensões tipo "Claude Code Usage" e que o Claude Code CLI
 * NÃO expõe (confirmado inspecionando o log de debug de uma chamada real).
 * A API de verdade devolve isso em HEADERS de resposta de toda chamada
 * (`anthropic-ratelimit-unified-5h-utilization` etc.) — só o CLI não repassa.
 *
 * `server/ia/claudeCli/limiteConta.cjs` faz uma chamada PRÓPRIA e mínima só
 * pra ler esses headers. É uma chamada real e paga (poucos tokens), por isso
 * cacheada (5 min) no backend — este card não faz polling agressivo.
 */
function Barra({ janela, rotulo }: { janela: JanelaCota | null | undefined; rotulo: string }) {
  if (!janela) return null;
  const pct = Math.round(janela.utilizacao * 100);
  const critico = janela.utilizacao >= 0.9;
  const atencao = janela.utilizacao >= 0.75;
  const cor = critico ? 'var(--danger-fg)' : atencao ? 'var(--warning-fg)' : 'var(--success-fg)';

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div className="flex items-center justify-between" style={{ fontSize: '0.78rem' }}>
        <span className="text-text-primary" style={{ fontWeight: 600 }}>{rotulo}</span>
        <span className="text-text-secondary">
          {pct}% usado
          {janela.resetaEm && ` · reseta ${new Date(janela.resetaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: cor, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

export default function LimiteContaCard() {
  const [dados, setDados] = useState<LimiteContaClaude | null>(null);
  const [carregando, setCarregando] = useState(false);

  const buscar = useCallback(() => buscarLimiteContaClaude().then(setDados).catch(() => setDados(null)), []);
  useEffect(() => { buscar(); }, [buscar]);

  function recarregar() {
    setCarregando(true);
    buscar().finally(() => setCarregando(false));
  }

  if (!dados) return null;

  // Sem credencial ainda (conta não conectada) ou API rejeitou: não é erro
  // pra assustar o usuário, o card de login já cobre isso — aqui só recua.
  if (!dados.ok) {
    if (dados.motivo === 'sem-credencial') return null;
    return (
      <Card flat>
        <div className="section-header"><h3><Gauge size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Cota da assinatura Claude</h3></div>
        <p style={{ fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          Não foi possível consultar agora ({dados.motivo}). Tente de novo em alguns minutos.
        </p>
      </Card>
    );
  }

  return (
    <Card flat>
      <div className="section-header">
        <h3><Gauge size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Cota da assinatura Claude</h3>
        <button
          type="button"
          onClick={recarregar}
          disabled={carregando}
          title="Consultar agora (chamada real e mínima — não abuse)"
          aria-label="Consultar agora"
          className="flex items-center justify-center w-6 h-6 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary transition-colors"
        >
          <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12, marginBottom: 10 }}>
        <Barra janela={dados.cincoHoras} rotulo="Janela de 5 horas" />
        <Barra janela={dados.seteDias} rotulo="Limite de 7 dias" />
      </div>

      <p className="text-text-secondary" style={{ fontSize: '0.75rem', margin: 0 }}>
        O Claude Code CLI não mostra isso — vem de uma checagem própria (chamada mínima e real, cacheada por 5
        minutos) direto na API, com a mesma conta. Compartilhada por todo mundo que usar o monitorIA nesta
        máquina, já que é uma conta só.
      </p>
    </Card>
  );
}
