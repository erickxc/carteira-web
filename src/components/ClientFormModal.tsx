import { useState, type FormEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { TIPO_ANALISE_LABEL, type Cliente, type Loja, type TipoAnalise } from '../types';

interface ClientFormModalProps {
  initial?: Cliente;
  onClose: () => void;
}

export function ClientFormModal({ initial, onClose }: ClientFormModalProps) {
  const { criarCliente, atualizarCliente, opcoesPorTipo } = useCarteira();
  const servicoOpcoes = opcoesPorTipo('servico');
  const statusOpcoes = opcoesPorTipo('status_cliente');
  const monitorOpcoes = opcoesPorTipo('monitor');

  const [empresa, setEmpresa] = useState(initial?.empresa ?? '');
  const [monitor, setMonitor] = useState(initial?.monitor ?? '');
  const [servicos, setServicos] = useState<string[]>(initial?.servicos ?? []);
  const [status, setStatus] = useState(initial?.status ?? statusOpcoes[0] ?? 'Ativo');
  const [atendidoMarco, setAtendidoMarco] = useState<boolean>(initial?.atendidoMarco ?? false);
  const [tipoAnalise, setTipoAnalise] = useState<TipoAnalise>(initial?.tipoAnalise ?? 'unitaria');
  const [lojas, setLojas] = useState<Loja[]>(initial?.lojas ?? []);
  const [novaLoja, setNovaLoja] = useState('');
  const [observacao, setObservacao] = useState(initial?.observacao ?? '');
  const [saving, setSaving] = useState(false);

  function toggleServico(nome: string) {
    setServicos((prev) => (prev.includes(nome) ? prev.filter((s) => s !== nome) : [...prev, nome]));
  }

  function adicionarLoja() {
    const nome = novaLoja.trim();
    if (!nome) return;
    setLojas((prev) => [...prev, { id: uuidv4(), nome }]);
    setNovaLoja('');
  }

  function removerLoja(id: string) {
    setLojas((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!empresa.trim()) return;
    setSaving(true);
    try {
      const payload = {
        empresa, monitor, servicos, status, observacao, atendidoMarco,
        tipoAnalise,
        lojas: tipoAnalise === 'segmentado' ? lojas : [],
      };
      if (initial) {
        await atualizarCliente(initial.id, payload);
      } else {
        await criarCliente(payload);
      }
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'Editar Cliente' : 'Novo Cliente'}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="field">
              Empresa
              <input className="field-input" autoFocus value={empresa} onChange={(e) => setEmpresa(e.target.value)} required />
            </label>

            <label className="field">
              Monitor responsável
              <select className="field-input custom-select" value={monitor} onChange={(e) => setMonitor(e.target.value)}>
                <option value="">Nenhum</option>
                {monitorOpcoes.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Status
              <select className="field-input custom-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOpcoes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            <div className="field">
              Serviços
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {servicoOpcoes.length === 0 && (
                  <span className="text-muted" style={{ fontSize: 13, textTransform: 'none' }}>
                    Nenhum serviço cadastrado — adicione em Configurações.
                  </span>
                )}
                {servicoOpcoes.map((s) => (
                  <label key={s} className="check-row">
                    <input type="checkbox" checked={servicos.includes(s)} onChange={() => toggleServico(s)} /> {s}
                  </label>
                ))}
              </div>
            </div>

            <label className="check-row" style={{ margin: '0.25rem 0' }}>
              <input type="checkbox" checked={atendidoMarco} onChange={(e) => setAtendidoMarco(e.target.checked)} /> Atendido pelo Marco (fora da monitoria)
            </label>

            <label className="field">
              Tipo de análise
              <select className="field-input custom-select" value={tipoAnalise} onChange={(e) => setTipoAnalise(e.target.value as TipoAnalise)}>
                <option value="unitaria">{TIPO_ANALISE_LABEL.unitaria}</option>
                <option value="segmentado">{TIPO_ANALISE_LABEL.segmentado}</option>
              </select>
            </label>

            {tipoAnalise === 'segmentado' && (
              <div className="field">
                Lojas <span className="text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· análise por loja</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, marginBottom: 8 }}>
                  {lojas.length === 0 && (
                    <span className="text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhuma loja adicionada.</span>
                  )}
                  {lojas.map((l) => (
                    <div key={l.id} className="flex-between" style={{ padding: '0.4rem 0.6rem', borderRadius: 6, background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
                      <span>{l.nome}</span>
                      <button type="button" className="btn btn-danger btn-icon" onClick={() => removerLoja(l.id)} aria-label="Remover loja"><X size={13} /></button>
                    </div>
                  ))}
                </div>
                <div className="flex-row">
                  <input
                    className="field-input"
                    placeholder="Nome da loja..."
                    value={novaLoja}
                    onChange={(e) => setNovaLoja(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarLoja(); } }}
                  />
                  <button type="button" className="btn btn-primary btn-icon" onClick={adicionarLoja} disabled={!novaLoja.trim()}><Plus size={16} /></button>
                </div>
              </div>
            )}

            <label className="field">
              Observação
              <textarea className="field-input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
