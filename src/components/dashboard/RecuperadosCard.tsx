import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { calcularAindaSemAtendimento, calcularRecuperados, LIMIAR_RECUPERACAO_DIAS } from '../../utils/recuperados';
import type { Janela } from '../../utils/periodo';
import { Card } from '../../ui';
import { AbasDeslizantes } from './AbasDeslizantes';
import { InfoComoConta } from './Comparacao';
import type { Cliente, EventoAgenda } from '../../types';

interface RecuperadosCardProps {
  clientes: Cliente[];
  agenda: EventoAgenda[];
  /** Mês escolhido no topo (`janelaDoMes`): recuperados são os daquele mês. */
  janela: Janela;
  agora: Date;
  mes: string;
  onAbrirCliente: (id: string) => void;
}

type Aba = 'recuperados' | 'parados';

/**
 * Atendimentos recuperados no mês: estavam 60+ dias sem entrega concluída e
 * voltaram a ter uma. Ao lado, quem segue parado hoje — sem ele, "5 recuperados"
 * não diz se sobraram 2 ou 30.
 */
export function RecuperadosCard({ clientes, agenda, janela, agora, mes, onAbrirCliente }: RecuperadosCardProps) {
  const [aba, setAba] = useState<Aba>('recuperados');
  const recuperados = useMemo(() => calcularRecuperados(clientes, agenda, janela, agora), [clientes, agenda, janela, agora]);
  const parados = useMemo(() => calcularAindaSemAtendimento(clientes, agenda, agora), [clientes, agenda, agora]);

  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Atendimentos recuperados <InfoComoConta texto={`Recuperado = estava ${LIMIAR_RECUPERACAO_DIAS}+ dias sem reunião, relatório ou precificação CONCLUÍDA e voltou a ter uma no mês. Ainda parados = ativos sem entrega concluída há ${LIMIAR_RECUPERACAO_DIAS}+ dias hoje (Marco, suspensos e problemas externos não entram).`} /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{mes}</span>
      </div>
      <div className="vencendo-topo">
        <AbasDeslizantes cheio rotulo="Recuperados" ativa={aba} onTrocar={setAba} abas={[
          { key: 'recuperados', label: 'Recuperados', contagem: recuperados.length },
          { key: 'parados', label: 'Ainda parados', contagem: parados.length, classeContagem: 'vencendo-total is-vencido' },
        ]} />
      </div>
      <div key={aba} className="afazer-conteudo">
        {aba === 'recuperados' ? (
          recuperados.length === 0 ? (
            <div className="empty-state">Nenhum atendimento recuperado em {mes}.</div>
          ) : (
            <ul className="lista-analise">
              {recuperados.map((r) => (
                <li key={r.cliente.id}>
                  <button type="button" className="link-button lista-analise-nome" onClick={() => onAbrirCliente(r.cliente.id)} title={r.cliente.empresa}>{r.cliente.empresa}</button>
                  <span className="lista-analise-valor" title={r.motivo === 'nunca' ? 'Primeira entrega desde o cadastro' : 'Dias sem entrega antes de voltar'}>
                    {r.diasParado}d {r.motivo === 'nunca' ? 'desde o cadastro' : 'parado'}
                  </span>
                  <span className="lista-analise-data">{r.entrega.tipo} {format(r.entrega.data, 'dd/MM')}</span>
                </li>
              ))}
            </ul>
          )
        ) : parados.length === 0 ? (
          <div className="empty-state">Nenhum atendimento parado há {LIMIAR_RECUPERACAO_DIAS}+ dias.</div>
        ) : (
          <ul className="lista-analise">
            {parados.map((p) => (
              <li key={p.cliente.id}>
                <button type="button" className="link-button lista-analise-nome" onClick={() => onAbrirCliente(p.cliente.id)} title={p.cliente.empresa}>{p.cliente.empresa}</button>
                <span className="lista-analise-valor is-ruim">{p.diasSemEntrega === null ? 'nunca atendido' : `${p.diasSemEntrega}d sem entrega`}</span>
                <span className="lista-analise-data">{p.cliente.monitor || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
