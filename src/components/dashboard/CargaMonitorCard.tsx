import { Card, Td, Th } from '../../ui';
import { InfoComoConta } from './Comparacao';
import { rotuloModo, type CargaMonitor, type ModoContagem } from '../../utils/analises';

const REGRA = 'Carteira = atendimentos ativos com o monitor no cadastro. Atrasados = com algum prazo de Monitoria ou Price vencido ou nunca entregue, hoje (o atrasado nos dois conta 1 no total). Aguardando = atrasados que já tiveram contato na janela de recontato: esperando o cliente. Produção do mês = quem fez (monitor do evento), em qualquer cliente. Reuniões por serviço: Price inclui precificações concluídas.';

const vermelho = (n: number) => (n > 0 ? { color: 'var(--danger)' } : undefined);

/** "Carga por monitor" — carteira e atraso de cada monitor, e o que ele produziu no mês. */
export function CargaMonitorCard({ linhas, mes, modo }: { linhas: CargaMonitor[]; mes: string; modo: ModoContagem }) {
  const nome = rotuloModo(modo);
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Carga por monitor <InfoComoConta texto={REGRA} /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{mes}</span>
      </div>
      <div className="overflow-auto tabela-compacta">
        <table className="w-full border-collapse text-[0.84rem]">
          <thead>
            <tr>
              <Th>Monitor</Th>
              <Th className="text-right">Carteira</Th>
              <Th className="text-right">Atrasados</Th>
              <Th className="text-right">{nome.Plural}</Th>
              <Th className="text-right">Relatórios</Th>
              <Th className="text-right">Canceladas</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.monitor} className="[&:last-child>td]:border-b-0">
                <Td className="font-semibold text-text-primary">{l.monitor}</Td>
                <Td className="text-right">{l.atendimentos}</Td>
                <Td className="text-right">
                  <strong className="carga-num" style={vermelho(l.atrasados)}>{l.atrasados}</strong>
                  <span className="carga-sub-linha">
                    {l.atrasadosMonitoria} Monit. · {l.atrasadosPrice} Price
                    {l.aguardandoRetorno > 0 && <> · <span style={{ color: 'var(--warning)' }}>{l.aguardandoRetorno} aguardando</span></>}
                  </span>
                </Td>
                <Td className="text-right">
                  <strong className="carga-num">{l.reunioes}</strong>
                  <span className="carga-sub-linha">{l.monitoria} Monit. · {l.price} Price</span>
                </Td>
                <Td className="text-right">{l.relatorios}</Td>
                <Td className="text-right" style={vermelho(l.canceladas)}>{l.canceladas}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
