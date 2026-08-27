import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { buscarAnaliseIA } from '../../api/client';
import { toastError } from '../../utils/toast';
import { Badge, Card } from '../../ui';
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
 */
export function AnaliseIACard({ clienteId }: AnaliseIACardProps) {
  // `undefined` até a busca deste `clienteId` terminar — evita um segundo
  // estado boolean de loading só pra isso.
  const [analise, setAnalise] = useState<AnaliseIA | null | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    buscarAnaliseIA(clienteId)
      .then((a) => { if (!cancelado) setAnalise(a); })
      .catch((err) => { toastError(err instanceof Error ? err.message : 'Falha ao buscar análise de IA.'); if (!cancelado) setAnalise(null); });
    return () => { cancelado = true; };
  }, [clienteId]);

  return (
    <Card flat style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h3><Bot size={16} style={{ marginRight: 6, verticalAlign: -3 }} /> Análise de IA</h3>
      </div>

      {analise === undefined ? (
        <p className="text-[0.82rem] text-text-muted">Carregando análise...</p>
      ) : !analise ? (
        <p className="text-[0.82rem] text-text-muted">Este cliente ainda não foi analisado — a análise roda automaticamente após a próxima reunião concluída, cancelada ou reagendada.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={RISCO_VARIANT[analise.nivelRisco]}>{RISCO_LABEL[analise.nivelRisco]}</Badge>
          </div>
          <p className="text-[0.85rem] text-text-primary">{analise.resumo}</p>
          {analise.fatores.length > 0 && (
            <ul className="text-[0.82rem] text-text-secondary" style={{ paddingLeft: 18, margin: 0 }}>
              {analise.fatores.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          {analise.sugestaoProximaPauta && (
            <p className="text-[0.82rem] text-text-secondary"><strong>Sugestão de pauta:</strong> {analise.sugestaoProximaPauta}</p>
          )}
        </div>
      )}
    </Card>
  );
}
