import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import { ModalShell } from './ModalShell';
import { TIPO_ANALISE_LABEL, type Cliente, type NovoCliente, type TipoAnalise } from '../types';

interface ClientFormModalProps {
  initial?: Cliente;
  onClose: () => void;
}

export function ClientFormModal({ initial, onClose }: ClientFormModalProps) {
  const { criarCliente, criarClientesEmLote, atualizarCliente, opcoesPorTipo } = useCarteira();
  const servicoOpcoes = opcoesPorTipo('servico');
  const statusOpcoes = opcoesPorTipo('status_cliente');
  const monitorOpcoes = opcoesPorTipo('monitor');
  const editando = !!initial;

  const [empresa, setEmpresa] = useState(initial?.empresa ?? '');
  const [monitor, setMonitor] = useState(initial?.monitor ?? '');
  const [servicos, setServicos] = useState<string[]>(initial?.servicos ?? []);
  const [status, setStatus] = useState(initial?.status ?? statusOpcoes[0] ?? 'Ativo');
  const [atendidoMarco, setAtendidoMarco] = useState<boolean>(initial?.atendidoMarco ?? false);
  const [observacao, setObservacao] = useState(initial?.observacao ?? '');
  const [tipoAnalise, setTipoAnalise] = useState<TipoAnalise>(initial?.tipoAnalise ?? 'unitaria');
  const [lojas, setLojas] = useState<string[]>([]);
  const [novaLoja, setNovaLoja] = useState('');
  const [saving, setSaving] = useState(false);

  const segmentadoNovo = !editando && tipoAnalise === 'segmentado';

  function toggleServico(nome: string) {
    setServicos((prev) => (prev.includes(nome) ? prev.filter((s) => s !== nome) : [...prev, nome]));
  }
  function adicionarLoja() {
    const nome = novaLoja.trim();
    if (!nome || lojas.includes(nome)) { setNovaLoja(''); return; }
    setLojas((prev) => [...prev, nome]);
    setNovaLoja('');
  }
  function removerLoja(nome: string) {
    setLojas((prev) => prev.filter((l) => l !== nome));
  }

  // Lojas efetivas (inclui a digitada e não adicionada).
  const lojasFinais = novaLoja.trim() && !lojas.includes(novaLoja.trim()) ? [...lojas, novaLoja.trim()] : lojas;
  const base = empresa.trim();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!base) return;
    setSaving(true);
    try {
      if (editando) {
        await atualizarCliente(initial.id, { empresa: base, monitor, servicos, status, observacao, atendidoMarco });
      } else if (tipoAnalise === 'segmentado') {
        if (lojasFinais.length === 0) { toastError('Adicione ao menos uma loja para a análise segmentada.'); setSaving(false); return; }
        const novos: NovoCliente[] = lojasFinais.map((nome) => ({
          empresa: `${base} - ${nome}`,
          grupo: base,
          tipoAnalise: 'segmentado',
          monitor, servicos, status, observacao, atendidoMarco,
        }));
        await criarClientesEmLote(novos);
      } else {
        await criarCliente({ empresa: base, monitor, servicos, status, observacao, atendidoMarco, tipoAnalise: 'unitaria' });
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={editando ? 'Editar Cliente' : 'Novo Cliente'}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : segmentadoNovo ? `Criar ${lojasFinais.length || ''} loja(s)` : 'Salvar'}
          </button>
        </>
      }
    >
            {editando && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="badge badge-muted">
                  Análise: {initial.tipoAnalise === 'segmentado' || initial.grupo ? TIPO_ANALISE_LABEL.segmentado : TIPO_ANALISE_LABEL.unitaria}
                </span>
                {initial.grupo && <span className="badge badge-warning">Grupo: {initial.grupo}</span>}
              </div>
            )}

            <label className="field">
              {segmentadoNovo ? 'Empresa / grupo (rede)' : 'Empresa'}
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

            {!editando && (
              <label className="field">
                Tipo de análise
                <select className="field-input custom-select" value={tipoAnalise} onChange={(e) => setTipoAnalise(e.target.value as TipoAnalise)}>
                  <option value="unitaria">{TIPO_ANALISE_LABEL.unitaria}</option>
                  <option value="segmentado">{TIPO_ANALISE_LABEL.segmentado}</option>
                </select>
              </label>
            )}

            {segmentadoNovo && (
              <div className="field">
                Lojas <span className="text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· cada loja vira um cliente</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 8 }}>
                  {lojas.length === 0 && (
                    <span className="text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhuma loja adicionada.</span>
                  )}
                  {lojas.map((l) => (
                    <span key={l} className="badge badge-muted" style={{ gap: 6 }}>
                      {l}
                      <button type="button" onClick={() => removerLoja(l)} aria-label="Remover" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex' }}>
                        <X size={12} />
                      </button>
                    </span>
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
                {base && lojasFinais.length > 0 && (
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 8, textTransform: 'none', letterSpacing: 'normal' }}>
                    Serão criados {lojasFinais.length} cliente(s): {lojasFinais.map((l) => `${base} - ${l}`).join(', ')}
                  </p>
                )}
              </div>
            )}

            <label className="field">
              Observação
              <textarea className="field-input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </label>
    </ModalShell>
  );
}
