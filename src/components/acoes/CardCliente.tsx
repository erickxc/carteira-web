import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays } from 'date-fns';
import { CalendarPlus, MessageSquare, Plus } from 'lucide-react';
import { rotuloDataCurto, sugestoes, type Item } from '../../utils/acoesHelpers';
import { contatoRecenteNaoRefletido, rotuloRelogio, type CadStatus, type ClassificacaoCadencia, type RelogioServico } from '../../utils/cadenciaServico';
import { isAtendidoMarco, isGratuidade } from '../../utils/badges';
import { Badge, Button, Card, Chip } from '../../ui';
import { ACAO_TIPO_LABEL, type AcaoTipo, type Cliente } from '../../types';
import type { AlertaAlvos } from '../../api/client';

interface CardClienteProps {
  c: Cliente;
  comHistorico?: boolean;
  ultimoContato: Date | null;
  totalReunioes: number;
  /** Últimos itens do histórico (já limitado e ordenado por proximidade de hoje). */
  historico: Item[];
  produtos: string[];
  /** Relógios de cadência por serviço (fila de priorização). Quando presente,
   *  substitui a linha "Último contato" pelos status por serviço. */
  relogios?: RelogioServico[];
  /** Classificação pela pior cadência (mesma usada pra agrupar em Vencidos/
   *  Vencendo/Em dia) — dá a borda esquerda de severidade do card. */
  severidade?: ClassificacaoCadencia;
  /** Alerta de "retorno do combinado" (Dados Alvos) pra este cliente, se houver
   *  — é o que puxa a recomendação de reunião pra dentro da fila de Ações,
   *  em vez de só aparecer em /clientes. `null`/ausente = sem integração ou
   *  sem nada a reportar; o card não muda em nada nesse caso. */
  alertaAlvos?: AlertaAlvos | null;
  onRegistrar: (clienteId: string, tipo?: AcaoTipo) => void;
  onAgendar: (clienteId: string) => void;
  onConversarAlvos?: (alerta: AlertaAlvos) => void;
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

/** Relógio que cobra ação (vs. os que estão resolvidos/cobertos). */
const pedeAcao = (r: RelogioServico) => r.status === 'vencido' || r.status === 'nunca' || r.status === 'vencendo';

/** Card de cliente usado em todos os grupos de Acompanhamento (Recorrentes,
 * Sem contato, Marco, Sugestão da semana).
 *
 * Hierarquia "foco no problema": o que cobra ação aparece em destaque; o que
 * está em dia é rebaixado para uma linha discreta, e o histórico usa datas
 * relativas ("hoje", "há 12d", "em 5d") para deixar óbvio o que já aconteceu e
 * o que só está agendado. Antes tudo tinha o mesmo peso, dentro de duas caixas
 * cinza aninhadas — muita tinta para pouca informação. */
export function CardCliente({ c, comHistorico, ultimoContato, totalReunioes, historico, produtos, relogios, severidade, alertaAlvos, onRegistrar, onAgendar, onConversarAlvos }: CardClienteProps) {
  const navigate = useNavigate();
  // Capturado uma vez no mount, não a cada render — chamar Date.now() direto no
  // corpo do componente é impuro (react-hooks/purity acusa em build).
  const [agora] = useState(() => new Date());

  // Puramente visual aqui (não muda severidade) — mesma regra usada em
  // buildFilaCadencia pra empurrar o cliente pro fim da própria seção.
  const temContatoRecente = contatoRecenteNaoRefletido(relogios, ultimoContato);

  const corSeveridade = severidade ? COR_SEVERIDADE[severidade] : undefined;
  const gratuidade = isGratuidade(c.status);

  const semRelogios = !relogios || relogios.length === 0;
  const problemas = (relogios ?? []).filter(pedeAcao);
  const resolvidos = (relogios ?? []).filter((r) => !pedeAcao(r));
  // Sem nenhum problema, os relógios "ok" assumem o destaque — senão o card do
  // grupo "Em dia" ficaria sem nenhuma informação legível.
  const emDestaque = problemas.length > 0 ? problemas : resolvidos;
  const rebaixados = problemas.length > 0 ? resolvidos : [];

  const dias = ultimoContato ? differenceInCalendarDays(agora, ultimoContato) : null;
  const textoContato = dias === null
    ? 'sem contato registrado'
    : dias === 0 ? 'contato hoje' : dias === 1 ? 'contato ontem' : `contato há ${dias}d`;
  const linhaSecundaria = [...rebaixados.map(rotuloRelogio), textoContato].join(' · ');

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
          <button
            className="link-button"
            style={{ fontWeight: 600, fontSize: '1rem' }}
            onClick={() => navigate(`/clientes/${c.id}`, { state: { from: '/acoes', fromLabel: 'Ações' } })}
          >
            {c.empresa}
          </button>
          {(gratuidade || isAtendidoMarco(c.status) || semRelogios) && (
            <div className="acao-card-badges">
              {gratuidade && <Badge variant="gratuidade">Gratuidade</Badge>}
              {isAtendidoMarco(c.status) && <Badge variant="accent">Marco</Badge>}
              {/* Só quando não há relógios: com eles, as linhas de situação já
                  dizem "Monitoria ..."/"Price ...", e repetir viraria ruído. */}
              {semRelogios && produtos.map((p) => <Badge key={p} variant="muted">{p}</Badge>)}
            </div>
          )}
        </div>
        {c.monitor
          ? <Badge variant="muted" style={{ flexShrink: 0 }}>{c.monitor}</Badge>
          : <span className="acao-tipo">sem monitor</span>}
      </div>

      {/* Situação: o que cobra ação em destaque, o resto rebaixado numa linha. */}
      {relogios && relogios.length > 0 ? (
        <div
          className="flex flex-col gap-1.5"
          style={temContatoRecente ? { borderLeft: '2px solid var(--accent)', paddingLeft: '0.6rem' } : undefined}
          title={temContatoRecente ? `Já houve contato depois do último toque de cadência: ${rotuloDataCurto(ultimoContato!, agora)}` : undefined}
        >
          {emDestaque.map((r) => (
            <span key={r.servico} className="flex items-center gap-2">
              <span className={`acao-dot ${CLASSE_DOT[r.status]}`} />
              <span
                className="text-[0.88rem]"
                style={{ color: COR_TEXTO[r.status], fontWeight: pedeAcao(r) ? 600 : 400 }}
              >
                {rotuloRelogio(r)}
              </span>
            </span>
          ))}
          {/* Relógio por serviço mostra o atraso da CADÊNCIA; esta linha traz o
              que está resolvido + a última interação real (um Contato leve não
              zera o relógio, mas já foi feito). */}
          <span className="text-[0.76rem] text-text-muted" style={{ paddingLeft: 17 }}>
            {linhaSecundaria}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[0.82rem] text-text-secondary">
          <span className="acao-dot is-ok" />
          {ultimoContato
            ? <>Último contato {rotuloDataCurto(ultimoContato, agora)}{totalReunioes ? ` · ${totalReunioes} reuniões` : ''}</>
            : 'Sem registro de contato'}
        </div>
      )}

      {/* Histórico — uma linha por item, data relativa, sem caixa nem rótulo. */}
      {comHistorico && (
        historico.length === 0 ? (
          <span className="text-[0.78rem] text-text-muted">Nenhuma ação registrada.</span>
        ) : (
          <div className="flex flex-col">
            {historico.map((i) => (
              <div
                key={i.key}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1 text-[0.8rem] border-b border-border last:border-b-0"
              >
                <span className="text-text-secondary truncate" title={i.obs || i.tipoLabel}>{i.tipoLabel}</span>
                <span className="text-text-muted tabular-nums">{rotuloDataCurto(i.date, agora)}</span>
                <Badge variant={i.statusBadge}>{i.statusLabel}</Badge>
              </div>
            ))}
          </div>
        )
      )}

      {/* Retorno do combinado (Dados Alvos): o que foi pautado numa reunião e
          não teve movimento depois — é sinal de "precisa de reunião" tão
          real quanto cadência vencida, só que vem de outra fonte. Fica na
          própria cor de severidade (warning), sem duplicar o texto: o
          título já é a pergunta que abriria a conversa. */}
      {alertaAlvos && (
        <div className="flex items-center gap-2 text-[0.8rem]" style={{ color: 'var(--warning-fg)' }}>
          <span className="acao-dot is-warn" />
          <span className="truncate" title={alertaAlvos.detalhe}>{alertaAlvos.titulo}</span>
          {onConversarAlvos && (
            <Button
              variant="secondary"
              style={{ padding: '0.15rem 0.5rem', fontSize: 11, flexShrink: 0, marginLeft: 'auto' }}
              onClick={() => onConversarAlvos(alertaAlvos)}
            >
              <MessageSquare size={12} /> Conversar
            </Button>
          )}
        </div>
      )}

      {/* Ações — sugestões junto dos botões, em vez de uma seção própria. */}
      <div className="acao-card-actions">
        <Button variant="primary" style={{ padding: '0.4rem 0.7rem', fontSize: 13 }} onClick={() => onRegistrar(c.id)}>
          <Plus size={14} /> Registrar
        </Button>
        <Button variant="secondary" style={{ padding: '0.4rem 0.7rem', fontSize: 13 }} onClick={() => onAgendar(c.id)}>
          <CalendarPlus size={14} /> Agendar
        </Button>
        {comHistorico && sugestoes(ultimoContato).map((t) => (
          <Chip
            variant="toggle"
            key={t}
            className="px-[0.6rem] py-[0.25rem] text-[0.75rem]"
            style={{ flex: '0 0 auto' }}
            onClick={() => onRegistrar(c.id, t)}
          >
            + {ACAO_TIPO_LABEL[t]}
          </Chip>
        ))}
      </div>
    </Card>
  );
}
