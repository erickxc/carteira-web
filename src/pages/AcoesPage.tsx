import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Check, FileText, Sparkles, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { gerarRecomendacoes, labelAcao, type Recomendacao } from '../utils/recomendacoes';
import { EventFormModal } from '../components/EventFormModal';
import { SEGMENTO_LABEL, type Modelo, type Segmento } from '../types';

const SEG_BADGE: Record<Segmento, string> = {
  engajado: 'badge-success',
  esfriando: 'badge-warning',
  frio: 'badge-danger',
};

function MaterialModal({ segmento, empresa, modelos, onClose }: { segmento: Segmento; empresa: string; modelos: Modelo[]; onClose: () => void }) {
  const doSegmento = modelos.filter((m) => m.segmento === segmento);
  const [copiado, setCopiado] = useState<string | null>(null);

  function copiar(m: Modelo) {
    const texto = m.conteudo.replaceAll('{empresa}', empresa);
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(m.id);
      setTimeout(() => setCopiado(null), 1500);
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Materiais — {SEGMENTO_LABEL[segmento]}</h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {doSegmento.length === 0 ? (
            <div className="empty-state">Nenhum modelo para este segmento. Cadastre em Configurações.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {doSegmento.map((m) => (
                <div key={m.id} className="glass-card glass-card-flat" style={{ padding: 14 }}>
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <strong>{m.titulo}</strong>
                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: 12 }} onClick={() => copiar(m)}>
                      {copiado === m.id ? <><Check size={13} /> Copiado</> : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-muted" style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {m.conteudo.replaceAll('{empresa}', empresa)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcoesPage() {
  const { clientes, agenda, acoes, modelos, cadencias, criarLembrete, registrarAcao } = useCarteira();
  const navigate = useNavigate();
  const [eventoClienteId, setEventoClienteId] = useState<string | null>(null);
  const [material, setMaterial] = useState<{ segmento: Segmento; empresa: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recomendacoes = useMemo(
    () => gerarRecomendacoes(clientes, agenda, acoes, cadencias),
    [clientes, agenda, acoes, cadencias]
  );

  const conquistar = recomendacoes.filter((r) => r.segmento === 'frio');
  const manutencao = recomendacoes.filter((r) => r.segmento !== 'frio');

  async function programarRelatorio(r: Recomendacao) {
    setOcupado(r.cliente.id + ':relatorio');
    try {
      await criarLembrete({
        title: `Enviar relatório — ${r.cliente.empresa}`,
        type: 'Relatório',
        datetime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        clientId: r.cliente.id,
        recurrence: 'none',
        description: r.motivo,
      });
      await registrarAcao({ clientId: r.cliente.id, tipo: 'relatorio', segmento: r.segmento, status: 'programado' });
    } finally {
      setOcupado(null);
    }
  }

  async function marcar(r: Recomendacao, status: 'concluido' | 'dispensado') {
    setOcupado(r.cliente.id + ':' + status);
    try {
      await registrarAcao({ clientId: r.cliente.id, tipo: r.tipo, segmento: r.segmento, status });
    } finally {
      setOcupado(null);
    }
  }

  function Card({ r }: { r: Recomendacao }) {
    return (
      <div className="glass-card glass-card-flat acao-card">
        <div className="acao-card-head">
          <div style={{ minWidth: 0 }}>
            <div className="flex-row" style={{ gap: 8 }}>
              <button className="link-button" style={{ fontWeight: 600, fontSize: '1rem' }} onClick={() => navigate(`/clientes/${r.cliente.id}`)}>
                {r.cliente.empresa}
              </button>
              <span className={`badge ${SEG_BADGE[r.segmento]}`}>{SEGMENTO_LABEL[r.segmento]}</span>
              {r.acao?.status === 'programado' && <span className="badge badge-accent">Programado</span>}
            </div>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {r.motivo}{r.cliente.monitor ? ` · ${r.cliente.monitor}` : ''}
            </div>
          </div>
          <span className="acao-tipo">{labelAcao(r.tipo)}</span>
        </div>

        <div className="acao-card-actions">
          {r.tipo === 'relatorio' ? (
            <button className="btn btn-primary" disabled={!!ocupado} onClick={() => programarRelatorio(r)}>
              <FileText size={14} /> Programar relatório
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setEventoClienteId(r.cliente.id)}>
              <CalendarPlus size={14} /> Agendar reunião
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setMaterial({ segmento: r.segmento, empresa: r.cliente.empresa })}>
            <Sparkles size={14} /> Material
          </button>
          <button className="btn btn-secondary" disabled={!!ocupado} onClick={() => marcar(r, 'concluido')}>
            <Check size={14} /> Concluir
          </button>
          <button className="btn btn-secondary" disabled={!!ocupado} onClick={() => marcar(r, 'dispensado')} title="Dispensar recomendação">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Ações & Recomendações</h1>
      <p className="page-subtitle">
        {recomendacoes.length} recomendação(ões) · {conquistar.length} a conquistar · {manutencao.length} manutenção
      </p>

      <div className="section">
        <div className="section-header">
          <h3>A Conquistar — clientes não atendidos</h3>
          <span className="text-muted" style={{ fontSize: 12 }}>{conquistar.length}</span>
        </div>
        {conquistar.length === 0 ? (
          <div className="glass-card glass-card-flat"><div className="empty-state">Todos os clientes já têm contato registrado.</div></div>
        ) : (
          <div className="acao-grid">
            {conquistar.map((r) => <Card key={r.cliente.id + r.tipo} r={r} />)}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-header">
          <h3>Manutenção — engajados e esfriando</h3>
          <span className="text-muted" style={{ fontSize: 12 }}>{manutencao.length}</span>
        </div>
        {manutencao.length === 0 ? (
          <div className="glass-card glass-card-flat"><div className="empty-state">Nada pendente — cadência em dia.</div></div>
        ) : (
          <div className="acao-grid">
            {manutencao.map((r) => <Card key={r.cliente.id + r.tipo} r={r} />)}
          </div>
        )}
      </div>

      {eventoClienteId && (
        <EventFormModal initialClientId={eventoClienteId} onClose={() => setEventoClienteId(null)} />
      )}
      {material && (
        <MaterialModal segmento={material.segmento} empresa={material.empresa} modelos={modelos} onClose={() => setMaterial(null)} />
      )}
    </div>
  );
}
