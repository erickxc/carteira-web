import { useEffect, useState } from 'react';
import { Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { buscarAnaliseIA } from '../../api/client';
import { toastError } from '../../utils/toast';
import { Badge, Button, Card } from '../../ui';
import type { BadgeVariant } from '../../ui';
import type { AnaliseIA } from '../../types';

const RISCO_LABEL: Record<AnaliseIA['nivelRisco'], string> = { baixo: 'Risco baixo', medio: 'Risco médio', alto: 'Risco alto' };
const RISCO_VARIANT: Record<AnaliseIA['nivelRisco'], BadgeVariant> = { baixo: 'success', medio: 'warning', alto: 'danger' };

interface AnaliseIACardProps {
  clienteId: string;
}

/**
 * Painel só-leitura da última análise automática do cliente (dossiê/risco,
 * gerada semanalmente por `server/ia/analisesAutomaticas.cjs`). Conversar com
 * o assistente é responsabilidade do módulo dedicado (`/assistente`,
 * `AssistenteIAPage`) — este card não faz chat nem aciona ferramentas, é
 * puramente o resultado da análise automática deste cliente. Busca sob
 * demanda (não entra no estado global do CarteiraContext): puxar isso pra
 * todos os clientes no boot do app custaria caro sem necessidade.
 *
 * Compacto de propósito (pedido do usuário): risco + resumo ficam sempre
 * visíveis, logo abaixo do cabeçalho da ficha — é provavelmente a informação
 * mais útil antes de ligar pro cliente, e antes ficava sozinha no rodapé da
 * página, exigindo rolar a tela inteira. Card estreito (menos da metade da
 * largura) com o texto quebrando normalmente — "compacto" era um card largo
 * com o resumo cortado por `nowrap`/ellipsis, o que virou reclamação de
 * "texto cortado"; estreito + quebra de linha resolve sem truncar nada.
 * Fatores/sugestão de pauta (o conteúdo mais longo) ficam atrás de "Ver mais".
 */
export function AnaliseIACard({ clienteId }: AnaliseIACardProps) {
  // `undefined` até a busca deste `clienteId` terminar — evita um segundo
  // estado boolean de loading só pra isso.
  const [analise, setAnalise] = useState<AnaliseIA | null | undefined>(undefined);
  const [expandido, setExpandido] = useState(false);

  useEffect(() => {
    let cancelado = false;
    buscarAnaliseIA(clienteId)
      .then((a) => { if (!cancelado) setAnalise(a); })
      .catch((err) => { toastError(err instanceof Error ? err.message : 'Falha ao buscar análise de IA.'); if (!cancelado) setAnalise(null); });
    return () => { cancelado = true; };
  }, [clienteId]);

  const temDetalhe = Boolean(analise && (analise.fatores.length > 0 || analise.sugestaoProximaPauta));

  return (
    <Card flat style={{ marginBottom: 24, padding: '0.85rem 1rem', maxWidth: 420, width: 'fit-content', minWidth: 280 }}>
      {analise === undefined ? (
        <p className="text-[0.82rem] text-text-muted" style={{ margin: 0 }}>
          <Bot size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Carregando análise de IA...
        </p>
      ) : !analise ? (
        <p className="text-[0.82rem] text-text-muted" style={{ margin: 0 }}>
          <Bot size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Ainda não analisado — a análise roda automaticamente após a próxima reunião concluída, cancelada ou reagendada.
        </p>
      ) : (
        <div>
          <div className="flex-between" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              <Bot size={14} className="text-text-muted shrink-0" />
              <Badge variant={RISCO_VARIANT[analise.nivelRisco]}>{RISCO_LABEL[analise.nivelRisco]}</Badge>
            </div>
            {temDetalhe && (
              <Button variant="secondary" size="icon" onClick={() => setExpandido((e) => !e)} title={expandido ? 'Ver menos' : 'Ver mais'} style={{ flexShrink: 0 }}>
                {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
            )}
          </div>
          <p className="text-[0.85rem] text-text-primary" style={{ margin: '6px 0 0', whiteSpace: 'normal', wordBreak: 'break-word' }}>
            {analise.resumo}
          </p>

          {expandido && (
            <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
              {analise.fatores.length > 0 && (
                <ul className="text-[0.82rem] text-text-secondary" style={{ paddingLeft: 18, margin: 0 }}>
                  {analise.fatores.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
              {analise.sugestaoProximaPauta && (
                <p className="text-[0.82rem] text-text-secondary" style={{ margin: 0 }}><strong>Sugestão de pauta:</strong> {analise.sugestaoProximaPauta}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
