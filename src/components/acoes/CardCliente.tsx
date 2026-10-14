import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, CalendarPlus, CircleCheck, MessageSquare, Plus } from 'lucide-react';
import { aguardandoRetorno, rotuloDataCurto, sugestoes, type Item } from '../../utils/acoesHelpers';
import type { ClassificacaoCadencia, RelogioServico } from '../../utils/cadenciaServico';
import { isAtendidoMarco, isGratuidade, riscoIALabel } from '../../utils/badges';
import { Button } from '../../ui';
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
  /** Relógios de cadência por serviço (fila de priorização). */
  relogios?: RelogioServico[];
  /** Pior cadência (a mesma que agrupa em Vencidos/Vencendo/Em dia). */
  severidade?: ClassificacaoCadencia;
  /** Alerta de "retorno do combinado" (Dados Alvos), se houver. */
  alertaAlvos?: AlertaAlvos | null;
  /** Risco do dossiê do monitorIA — só na fila de cadência, onde desempata a ordem. */
  nivelRisco?: 'alto' | 'medio' | 'baixo';
  /** Dias da janela de "contato recente" (Cadências → Aguardando retorno). */
  janelaContatoRecente?: number;
  onRegistrar: (clienteId: string, tipo?: AcaoTipo) => void;
  onAgendar: (clienteId: string) => void;
  onConversarAlvos?: (alerta: AlertaAlvos) => void;
}

type Tom = 'atrasado' | 'vence' | 'ok' | 'aguardando';

/** Relógio que cobra ação (vs. os que estão resolvidos/cobertos). */
const pedeAcao = (r: RelogioServico) => r.status === 'vencido' || r.status === 'nunca' || r.status === 'vencendo';

/** Nunca atendido: dias desde o cadastro (o motor guarda o atraso já descontada
 *  a carência de um prazo). Sem data de cadastro (legado) dá 0 → "nunca". */
const diasSemAtendimento = (r: RelogioServico) => Math.max(0, r.atrasoReal + r.cadencia);

/** O número grande e a palavra ao lado, por prazo: "75d atrasada", "hoje vence", "21d faltam". */
function leituraPrazo(r: RelogioServico, aguardando: boolean): { valor: string; palavra: string; tom: Tom } {
  if (aguardando && pedeAcao(r)) {
    const dias = r.status === 'nunca' ? diasSemAtendimento(r) : Math.max(0, r.atrasoReal);
    return { valor: dias > 0 ? `${dias}d` : 'nunca', palavra: 'aguardando', tom: 'aguardando' };
  }
  switch (r.status) {
    case 'nunca': {
      const dias = diasSemAtendimento(r);
      return dias > 0 ? { valor: `${dias}d`, palavra: 'sem atendimento', tom: 'atrasado' } : { valor: 'nunca', palavra: 'atendida', tom: 'atrasado' };
    }
    case 'vencido': return { valor: `${r.atrasoReal}d`, palavra: 'atrasada', tom: 'atrasado' };
    case 'vencendo': {
      const dias = Math.max(0, -r.atrasoReal);
      return dias === 0 ? { valor: 'hoje', palavra: 'vence', tom: 'vence' } : { valor: `${dias}d`, palavra: 'faltam', tom: 'vence' };
    }
    case 'coberto': return { valor: r.proximo ? format(r.proximo, 'dd/MM') : '—', palavra: 'marcada', tom: 'ok' };
    default: return { valor: `${Math.max(0, -r.atrasoReal)}d`, palavra: 'faltam', tom: 'ok' };
  }
}

const RISCO_ICONE = { alto: AlertTriangle, medio: AlertTriangle, baixo: CircleCheck } as const;

/**
 * Card de um atendimento na fila de Ações. O número de dias de cada prazo é o
 * elemento principal (com uma palavra: atrasada, vence, faltam, aguardando);
 * o risco do monitorIA é um ícone colorido no canto; embaixo, só o último
 * contato. O histórico completo fica na ficha do cliente.
 */
export function CardCliente({
  c, comHistorico, ultimoContato, totalReunioes, historico, produtos, relogios,
  alertaAlvos, nivelRisco, janelaContatoRecente, onRegistrar, onAgendar, onConversarAlvos,
}: CardClienteProps) {
  // Capturado uma vez no mount: Date.now() no corpo do componente é impuro.
  const [agora] = useState(() => new Date());

  const lista = relogios ?? [];
  const problemas = lista.filter(pedeAcao);
  const aguardando = aguardandoRetorno(relogios, ultimoContato, janelaContatoRecente, agora);

  const cancelamentos = comHistorico ? historico.filter((i) => /cancel|reagend/i.test(i.statusLabel)).length : 0;
  const sugestao = comHistorico ? sugestoes(ultimoContato)[0] : undefined;
  const marcadores = [isGratuidade(c.status) && 'Gratuidade', isAtendidoMarco(c.status) && 'Marco'].filter(Boolean) as string[];
  const IconeRisco = nivelRisco ? RISCO_ICONE[nivelRisco] : null;

  return (
    <article className="acard">
      <header className="acard-head">
        <div className="acard-ident">
          <Link className="acard-nome" to={`/clientes/${c.id}`} state={{ from: '/acoes', fromLabel: 'Ações' }}>
            {c.empresa}
          </Link>
          <p className="acard-meta">{[c.monitor || 'sem monitor', ...marcadores].join(' · ')}</p>
        </div>
        {IconeRisco && nivelRisco && (
          <span className="acard-risco" data-risco={nivelRisco} title={`${riscoIALabel(nivelRisco)} (dossiê do monitorIA)`}>
            <IconeRisco size={18} strokeWidth={2.2} aria-hidden />
            <span className="sr-only">{riscoIALabel(nivelRisco)}</span>
          </span>
        )}
      </header>

      {lista.length > 0 ? (
        <dl className="acard-prazos">
          {lista.map((r) => {
            const l = leituraPrazo(r, aguardando);
            return (
              <div key={r.servico} className="acard-prazo" data-tom={l.tom}>
                <dt>{r.servico}</dt>
                <dd>
                  <strong>{l.valor}</strong>
                  <span>{l.tom === 'aguardando' && <MessageSquare size={12} aria-hidden />}{l.palavra}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      ) : produtos.length > 0 && (
        <p className="acard-servicos">{produtos.join(' · ')}</p>
      )}

      <p className="acard-contato">
        {ultimoContato ? `Último contato ${rotuloDataCurto(ultimoContato, agora)}` : 'Sem contato registrado'}
        {cancelamentos > 0 && <span className="acard-cancelado"> · {cancelamentos} {cancelamentos === 1 ? 'cancelamento' : 'cancelamentos'}</span>}
        {lista.length === 0 && totalReunioes > 0 && ` · ${totalReunioes} reuniões`}
      </p>

      {alertaAlvos && (
        <div className="acard-alvos">
          <span className="truncate" title={alertaAlvos.detalhe}>{alertaAlvos.titulo}</span>
          {onConversarAlvos && (
            <button type="button" className="acard-link" onClick={() => onConversarAlvos(alertaAlvos)}>
              <MessageSquare size={12} aria-hidden /> Conversar
            </button>
          )}
        </div>
      )}

      {/* Só o próximo passo leva o botão dourado: agendar quando há prazo a
          cobrir, registrar o retorno quando já falamos e é esperar a resposta. */}
      <footer className="acard-acoes">
        {aguardando ? (
          <>
            <Button variant="primary" className="acard-btn" onClick={() => onRegistrar(c.id, 'contato')}>
              <MessageSquare size={14} aria-hidden /> Registrar retorno
            </Button>
            <Button variant="secondary" className="acard-btn" onClick={() => onAgendar(c.id)}>
              <CalendarPlus size={14} aria-hidden /> Agendar
            </Button>
          </>
        ) : (
          <>
            <Button variant={problemas.length > 0 ? 'primary' : 'secondary'} className="acard-btn" onClick={() => onAgendar(c.id)}>
              <CalendarPlus size={14} aria-hidden /> Agendar
            </Button>
            <Button variant="secondary" className="acard-btn" onClick={() => onRegistrar(c.id)}>
              <Plus size={14} aria-hidden /> Registrar
            </Button>
          </>
        )}
        {sugestao && (
          <button type="button" className="acard-link acard-sugestao" onClick={() => onRegistrar(c.id, sugestao)}>
            + {ACAO_TIPO_LABEL[sugestao]}
          </button>
        )}
      </footer>
    </article>
  );
}
