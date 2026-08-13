import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarPlus, Plus } from 'lucide-react';
import { rotuloData, sugestoes, type Item } from '../../utils/acoesHelpers';
import { contatoRecenteNaoRefletido, rotuloRelogio, type CadStatus, type ClassificacaoCadencia, type RelogioServico } from '../../utils/cadenciaServico';
import { isAtendidoMarco, isGratuidade } from '../../utils/badges';
import { Badge, Button, Card, Chip } from '../../ui';
import { ACAO_TIPO_LABEL, type AcaoTipo, type Cliente } from '../../types';

interface CardClienteProps {
  c: Cliente;
  comHistorico?: boolean;
  ultimoContato: Date | null;
  totalReunioes: number;
  /** Últimos itens do histórico (já limitado, ex.: 3 mais recentes). */
  historico: Item[];
  produtos: string[];
  /** Relógios de cadência por serviço (fila de priorização). Quando presente,
   *  substitui a linha "Último contato" pelos status por serviço. */
  relogios?: RelogioServico[];
  /** Classificação pela pior cadência (mesma usada pra agrupar em Vencidos/
   *  Vencendo/Em dia) — dá a borda esquerda de severidade do card. */
  severidade?: ClassificacaoCadencia;
  onRegistrar: (clienteId: string, tipo?: AcaoTipo) => void;
  onAgendar: (clienteId: string) => void;
}

const CLASSE_DOT: Record<CadStatus, string> = {
  vencido: 'is-danger', nunca: 'is-danger', vencendo: 'is-warn', coberto: 'is-ok', em_dia: 'is-ok',
};
const COR_TEXTO: Record<CadStatus, string> = {
  vencido: 'var(--danger)', nunca: 'var(--danger)', vencendo: 'var(--warning)', coberto: 'var(--text-secondary)', em_dia: 'var(--text-secondary)',
};
const COR_SEVERIDADE: Record<ClassificacaoCadencia, string | undefined> = {
  vencido: 'var(--danger)', vencendo: 'var(--warning)', em_dia: undefined,
};

/** Card de cliente usado em todos os grupos de Acompanhamento (Recorrentes,
 * Sem contato, Marco, Sugestão da semana) — extraído de AcoesPage para não
 * ser redefinido a cada render e poder ser reutilizado/testado isoladamente. */
export function CardCliente({ c, comHistorico, ultimoContato, totalReunioes, historico, produtos, relogios, severidade, onRegistrar, onAgendar }: CardClienteProps) {
  const navigate = useNavigate();

  // Puramente visual aqui (não muda severidade) — mesma regra usada em
  // buildFilaCadencia pra empurrar o cliente pro fim da própria seção.
  const temContatoRecente = contatoRecenteNaoRefletido(relogios, ultimoContato);

  const corSeveridade = severidade ? COR_SEVERIDADE[severidade] : undefined;
  const gratuidade = isGratuidade(c.status);

  return (
    <Card
      flat
      className="acao-card"
      style={{
        ...(corSeveridade ? { borderLeftColor: corSeveridade, borderLeftWidth: 4 } : undefined),
        ...(gratuidade ? { background: 'var(--gratuidade-pastel-bg)' } : undefined),
      }}
    >
      <div className="acao-card-head">
        <div style={{ minWidth: 0 }}>
          <button className="link-button" style={{ fontWeight: 600, fontSize: '1rem' }} onClick={() => navigate(`/clientes/${c.id}`, { state: { from: '/acoes', fromLabel: 'Ações' } })}>{c.empresa}</button>
          <div className="acao-card-badges">
            {gratuidade && <Badge variant="gratuidade">Gratuidade</Badge>}
            {isAtendidoMarco(c.status) && <Badge variant="accent">Marco</Badge>}
            {produtos.map((p) => <Badge key={p} variant="accent">{p}</Badge>)}
          </div>
        </div>
        {c.monitor
          ? <Badge variant="accent" style={{ fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>👤 {c.monitor}</Badge>
          : <span className="acao-tipo">sem monitor</span>}
      </div>

      {relogios && relogios.length > 0 ? (
        <div
          className="acao-card-info is-stack"
          style={temContatoRecente ? { border: '1px solid var(--accent)', borderRadius: 8, padding: '0.5rem 0.6rem' } : undefined}
          title={temContatoRecente ? `Contato mais recente: ${rotuloData(ultimoContato!)}` : undefined}
        >
          {relogios.map((r) => (
            <span key={r.servico} className="acao-clock">
              <span className={`acao-dot ${CLASSE_DOT[r.status]}`} />
              <span style={{ color: COR_TEXTO[r.status], fontWeight: r.status === 'vencido' || r.status === 'nunca' ? 600 : 400 }}>{rotuloRelogio(r)}</span>
            </span>
          ))}
          {/* Relógio por serviço já mostra o atraso da CADÊNCIA (reunião/relatório),
              mas não necessariamente a última interação de verdade (ex.: um Contato
              leve não zera o relógio) — esta linha mostra isso à parte. */}
          <span className="text-text-muted" style={{ fontSize: 11.5 }}>
            {ultimoContato ? `Últ. contato há ${Math.max(0, Math.floor((Date.now() - ultimoContato.getTime()) / 86400000))} dias` : 'Sem registro de contato'}
          </span>
        </div>
      ) : (
        <div className="acao-card-info">
          <span className="acao-dot is-ok" />
          {ultimoContato ? <>Último contato · {rotuloData(ultimoContato)}{totalReunioes ? ` · ${totalReunioes} reuniões` : ''}</> : 'Sem registro de contato'}
        </div>
      )}

      {comHistorico && (
        <div className="acao-hist">
          <span className="acao-hist-label">Últimas ações</span>
          {historico.length === 0 ? <span className="text-text-muted" style={{ fontSize: 12 }}>Nenhuma ação.</span> :
            historico.map((i) => (
              <div key={i.key} className="acao-hist-item">
                <span>{i.tipoLabel}</span>
                <span className="text-text-muted">{format(i.date, 'dd/MM/yy')}</span>
                <Badge variant={i.statusBadge}>{i.statusLabel}</Badge>
              </div>
            ))}
          <div className="acao-sug">
            <span className="acao-hist-label">Sugestões</span>
            {sugestoes(ultimoContato).map((t) => (
              <Chip variant="toggle" key={t} className="px-[0.6rem] py-[0.25rem] text-[0.75rem]" onClick={() => onRegistrar(c.id, t)}>+ {ACAO_TIPO_LABEL[t]}</Chip>
            ))}
          </div>
        </div>
      )}

      <div className="acao-card-actions">
        <Button variant="primary" style={{ padding: '0.4rem 0.7rem', fontSize: 13 }} onClick={() => onRegistrar(c.id)}><Plus size={14} /> Registrar</Button>
        <Button variant="secondary" style={{ padding: '0.4rem 0.7rem', fontSize: 13 }} onClick={() => onAgendar(c.id)}><CalendarPlus size={14} /> Agendar</Button>
      </div>
    </Card>
  );
}
