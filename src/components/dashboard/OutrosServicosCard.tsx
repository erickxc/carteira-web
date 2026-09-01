import { Badge, Card } from '../../ui';

interface OutroServicoDist {
  label: string;
  n: number;
}

interface OutrosServicosCardProps {
  outrosServicosDist: OutroServicoDist[];
}

/**
 * Serviços fora de Monitoria/Price (Controladoria, OptiMarco, AutoTech, Book
 * Fiscal, Raptor, Protocolo GPS, e qualquer um cadastrado depois) — contagem
 * simples de clientes ativos que têm cada um contratado, SEM % de atendimento
 * em 30 dias (decisão do usuário: não entram na cadência/aderência da
 * monitoria, ver `ServicosCard` ao lado). Card separado de propósito — mesma
 * lógica de "outrosServicosDist" (`useDashboardData.ts`), não um recorte do
 * card de cobertura.
 */
export function OutrosServicosCard({ outrosServicosDist }: OutrosServicosCardProps) {
  return (
    <Card>
      <div className="section-header">
        <h3>Outros Serviços</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>clientes ativos com o serviço contratado</span>
      </div>
      {outrosServicosDist.length === 0 ? (
        <div className="empty-state">Nenhum serviço cadastrado fora de Monitoria/Price.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {outrosServicosDist.map((s) => (
            <Badge key={s.label} variant={s.n > 0 ? 'accent' : 'muted'} style={{ gap: 6, fontSize: 13, padding: '0.4rem 0.7rem' }}>
              {s.label} <strong>{s.n}</strong>
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
