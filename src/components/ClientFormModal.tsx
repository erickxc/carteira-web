import { useState, type FormEvent } from 'react';
import { useCarteira } from '../context/CarteiraContext';
import type { Cliente } from '../types';

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
  const [observacao, setObservacao] = useState(initial?.observacao ?? '');
  const [saving, setSaving] = useState(false);

  function toggleServico(nome: string) {
    setServicos((prev) => (prev.includes(nome) ? prev.filter((s) => s !== nome) : [...prev, nome]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!empresa.trim()) return;
    setSaving(true);
    try {
      const payload = { empresa, monitor, servicos, status, observacao, atendidoMarco };
      if (initial) {
        await atualizarCliente(initial.id, payload);
      } else {
        await criarCliente(payload);
      }
      onClose();
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
