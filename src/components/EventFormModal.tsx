import { useRef, useState, type FormEvent } from 'react';
import { addMonths, addWeeks, format, parse, setHours, setMinutes, subDays, subHours } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { AlertTriangle, Check, FileText, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { urlAnexo } from '../api/client';
import { gerarAta } from '../utils/ata';
import { gerarAtaPdf } from '../utils/ataPdf';
import type { ChecklistItem, EventoAgenda, OrientacaoItem } from '../types';

interface EventFormModalProps {
  initial?: EventoAgenda;
  defaultDate?: Date;
  initialClientId?: string;
  onClose: () => void;
}

type Freq = 'semanal' | 'quinzenal' | 'mensal';

export function EventFormModal({ initial, defaultDate, initialClientId, onClose }: EventFormModalProps) {
  const { clientes, agenda, criarEvento, atualizarEvento, removerEvento, enviarAnexoEvento, removerAnexoEvento, criarLembrete, opcoesPorTipo } = useCarteira();
  const tipoOpcoes = opcoesPorTipo('tipo_evento');
  const statusOpcoes = opcoesPorTipo('status_evento');
  const servicoOpcoes = opcoesPorTipo('servico');
  const editando = !!initial;

  const [clientId, setClientId] = useState(initial?.clientId ?? initialClientId ?? clientes[0]?.id ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [type, setType] = useState(initial?.type ?? tipoOpcoes[0] ?? '');
  const [date, setDate] = useState(format(initial ? new Date(initial.date) : defaultDate ?? new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(initial?.time ?? '');
  const [duracao, setDuracao] = useState<number>(initial?.duracao ?? 60);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState(initial?.status ?? statusOpcoes[0] ?? 'Agendado');
  const [servicos, setServicos] = useState<string[]>(initial?.servicos ?? []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(initial?.checklist ?? []);
  const [novoItem, setNovoItem] = useState('');
  const [orientacoes, setOrientacoes] = useState<OrientacaoItem[]>(initial?.preAnalise?.orientacoes ?? []);
  const [clientesGeral, setClientesGeral] = useState(initial?.preAnalise?.clientesGeral ?? '');
  const [produtosGeral, setProdutosGeral] = useState(initial?.preAnalise?.produtosGeral ?? '');
  const [ata, setAta] = useState(initial?.ata ?? '');
  const [resumo, setResumo] = useState(initial?.resumo ?? '');
  const [lembreteAntes, setLembreteAntes] = useState<'none' | '1h' | '1d' | '2d' | '7d'>('none');
  const [recorrente, setRecorrente] = useState(false);
  const [freq, setFreq] = useState<Freq>('semanal');
  const [ocorrencias, setOcorrencias] = useState(4);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const eventoAtual = initial ? agenda.find((a) => a.id === initial.id) : undefined;

  const toggleServico = (s: string) =>
    setServicos((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  function addItem() {
    const t = novoItem.trim();
    if (!t) return;
    setChecklist((prev) => [...prev, { id: uuidv4(), text: t, done: false }]);
    setNovoItem('');
  }
  const toggleItem = (id: string) => setChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const removeItem = (id: string) => setChecklist((prev) => prev.filter((i) => i.id !== id));

  // Pré-análise (orientações por cliente/produto).
  const addOrientacao = () => setOrientacoes((prev) => [...prev, { id: uuidv4(), cliente: '', produto: '', orientacao: '' }]);
  const updOrientacao = (id: string, campo: keyof OrientacaoItem, valor: string) =>
    setOrientacoes((prev) => prev.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)));
  const removeOrientacao = (id: string) => setOrientacoes((prev) => prev.filter((o) => o.id !== id));

  const preAnalise = { orientacoes, clientesGeral, produtosGeral };
  // Ata automática (base para o botão "Gerar" e para preencher se vazia).
  const ataAuto = gerarAta({
    clientName: clientes.find((c) => c.id === clientId)?.empresa ?? '',
    date: parse(date, 'yyyy-MM-dd', new Date()).toISOString(),
    time, type, checklist, preAnalise, description,
  });

  // Conflito: outra reunião no mesmo dia e horário.
  const conflito = time
    ? agenda.some((a) => a.id !== initial?.id && a.time === time && format(parse(date, 'yyyy-MM-dd', new Date()), 'yyyy-MM-dd') === format(new Date(a.date), 'yyyy-MM-dd'))
    : false;

  function gerarDatas(baseISO: Date): Date[] {
    if (!recorrente) return [baseISO];
    const out: Date[] = [];
    for (let i = 0; i < Math.max(1, ocorrencias); i++) {
      out.push(freq === 'semanal' ? addWeeks(baseISO, i) : freq === 'quinzenal' ? addWeeks(baseISO, i * 2) : addMonths(baseISO, i));
    }
    return out;
  }

  const statusConcluido = statusOpcoes.find((s) => /conclu|realiz/i.test(s)) ?? 'Concluído';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void salvar();
  }
  function handleConcluir() {
    setStatus(statusConcluido);
    void salvar(statusConcluido);
  }

  async function salvar(statusOverride?: string) {
    const cliente = clientes.find((c) => c.id === clientId);
    if (!cliente) { alert('Selecione um cliente.'); return; }
    if (!subject.trim()) { alert('Informe o assunto da reunião.'); return; }
    const statusFinal = statusOverride ?? status;
    setSaving(true);
    try {
      const baseData = parse(date, 'yyyy-MM-dd', new Date());
      const comum = {
        clientId, clientName: cliente.empresa, subject, type, time,
        duracao: duracao || undefined, description, status: statusFinal, servicos, preAnalise, resumo,
      };
      // Ata manual tem prioridade; se vazia, gera automaticamente.
      const ataDe = (iso: string, cl: ChecklistItem[]) =>
        ata.trim() ? ata : gerarAta({ clientName: cliente.empresa, date: iso, time, type, checklist: cl, preAnalise, description });
      async function lembretePara(evId: string, d: Date) {
        if (lembreteAntes === 'none') return;
        const [h, m] = (time || '09:00').split(':').map(Number);
        let alvo = setMinutes(setHours(d, isNaN(h) ? 9 : h), isNaN(m) ? 0 : m);
        if (lembreteAntes === '1h') alvo = subHours(alvo, 1);
        else if (lembreteAntes === '1d') alvo = subDays(alvo, 1);
        else if (lembreteAntes === '2d') alvo = subDays(alvo, 2);
        else if (lembreteAntes === '7d') alvo = subDays(alvo, 7);
        await criarLembrete({ title: `Reunião — ${cliente!.empresa}${subject ? ': ' + subject : ''}`, type: 'Reunião', datetime: alvo.toISOString(), clientId, eventId: evId, recurrence: 'none', description });
      }
      if (editando) {
        const iso = baseData.toISOString();
        await atualizarEvento(initial.id, { ...comum, date: iso, checklist, ata: ataDe(iso, checklist) });
      } else if (recorrente) {
        const serie = uuidv4();
        for (const d of gerarDatas(baseData)) {
          const cl = checklist.map((i) => ({ id: uuidv4(), text: i.text, done: false }));
          const iso = d.toISOString();
          const salvo = await criarEvento({ ...comum, date: iso, serie, checklist: cl, ata: ataDe(iso, cl) });
          await lembretePara(salvo.id, d);
        }
      } else {
        const iso = baseData.toISOString();
        const salvo = await criarEvento({ ...comum, date: iso, checklist, ata: ataDe(iso, checklist) });
        await lembretePara(salvo.id, baseData);
      }
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar o evento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm('Excluir este evento?')) return;
    await removerEvento(initial.id);
    onClose();
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!initial || !files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) await enviarAnexoEvento(initial.id, file);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editando ? 'Editar Evento' : 'Novo Evento'}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="field">
              Cliente
              <select className="field-input custom-select" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="" disabled>Selecione...</option>
                {clientes.map((c) => (<option key={c.id} value={c.id}>{c.empresa}</option>))}
              </select>
            </label>

            <label className="field">
              Assunto
              <input className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: Revisão de precificação Q3" required />
            </label>

            <label className="field">
              Tipo
              <select className="field-input custom-select" value={type} onChange={(e) => setType(e.target.value)}>
                {tipoOpcoes.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </label>

            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <label className="field" style={{ flex: 1 }}>
                Data
                <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className="field" style={{ width: 110 }}>
                Hora
                <input type="time" className="field-input" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <label className="field" style={{ width: 120 }}>
                Duração
                <select className="field-input custom-select" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
                  <option value={0}>—</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1h</option>
                  <option value={90}>1h30</option>
                  <option value={120}>2h</option>
                </select>
              </label>
            </div>

            {conflito && (
              <div className="badge badge-warning" style={{ marginBottom: 12 }}>
                <AlertTriangle size={12} /> Já existe reunião neste dia e horário
              </div>
            )}

            <label className="field">
              Status
              <select className="field-input custom-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOpcoes.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </label>

            {!editando && (
              <>
                <div className="field">
                  Recorrência
                  <div className="chip-select">
                    <button type="button" className={`chip-toggle${!recorrente ? ' is-on' : ''}`} onClick={() => setRecorrente(false)}>Única</button>
                    <button type="button" className={`chip-toggle${recorrente ? ' is-on' : ''}`} onClick={() => setRecorrente(true)}>Recorrente</button>
                  </div>
                </div>
                {recorrente && (
                  <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <label className="field" style={{ flex: 1 }}>
                      Frequência
                      <select className="field-input custom-select" value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
                        <option value="semanal">Semanal</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="mensal">Mensal</option>
                      </select>
                    </label>
                    <label className="field" style={{ width: 130 }}>
                      Ocorrências
                      <input type="number" min={2} max={52} className="field-input" value={ocorrencias} onChange={(e) => setOcorrencias(Number(e.target.value))} />
                    </label>
                  </div>
                )}

                <label className="field">
                  Lembrete automático
                  <select className="field-input custom-select" value={lembreteAntes} onChange={(e) => setLembreteAntes(e.target.value as typeof lembreteAntes)}>
                    <option value="none">Sem lembrete</option>
                    <option value="1h">1 hora antes</option>
                    <option value="1d">1 dia antes</option>
                    <option value="2d">2 dias antes</option>
                    <option value="7d">1 semana antes</option>
                  </select>
                </label>
              </>
            )}

            <div className="field">
              Serviços tratados
              {servicoOpcoes.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}>Nenhum serviço cadastrado — adicione em Configurações.</p>
              ) : (
                <div className="chip-select">
                  {servicoOpcoes.map((s) => (
                    <button type="button" key={s} className={`chip-toggle${servicos.includes(s) ? ' is-on' : ''}`} onClick={() => toggleServico(s)}>{s}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              Checklist / pauta
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4, marginBottom: 8 }}>
                {checklist.length === 0 && <span className="text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhum item.</span>}
                {checklist.map((it) => (
                  <div key={it.id} className="check-item">
                    <button type="button" className={`filter-check${it.done ? ' is-on' : ''}`} onClick={() => toggleItem(it.id)}>
                      {it.done && <Check size={11} strokeWidth={3} />}
                    </button>
                    <span style={{ flex: 1, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{it.text}</span>
                    <button type="button" className="btn btn-secondary btn-icon" onClick={() => removeItem(it.id)} aria-label="Remover"><X size={12} /></button>
                  </div>
                ))}
              </div>
              <div className="flex-row">
                <input className="field-input" placeholder="Nova atividade..." value={novoItem} onChange={(e) => setNovoItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
                <button type="button" className="btn btn-primary btn-icon" onClick={addItem} disabled={!novoItem.trim()}><Plus size={16} /></button>
              </div>
            </div>

            {editando && (
              <div className="field">
                Pré-Análise <span className="text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· preparação da reunião</span>
                <div className="pa-table">
                  <div className="pa-row pa-head"><span>Cliente</span><span>Produto</span><span>Orientação</span><span /></div>
                  {orientacoes.length === 0 && <span className="text-muted" style={{ fontSize: 13, textTransform: 'none', padding: '2px 0' }}>Nenhuma orientação.</span>}
                  {orientacoes.map((o) => (
                    <div key={o.id} className="pa-row">
                      <input className="field-input" value={o.cliente} placeholder="Cliente" onChange={(e) => updOrientacao(o.id, 'cliente', e.target.value)} />
                      <input className="field-input" value={o.produto} placeholder="Produto" onChange={(e) => updOrientacao(o.id, 'produto', e.target.value)} />
                      <input className="field-input" value={o.orientacao} placeholder="Orientação" onChange={(e) => updOrientacao(o.id, 'orientacao', e.target.value)} />
                      <button type="button" className="btn btn-danger btn-icon" onClick={() => removeOrientacao(o.id)} aria-label="Remover"><X size={13} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={addOrientacao}><Plus size={14} /> Orientação</button>
                </div>
                <label className="field" style={{ marginTop: 12 }}>
                  Clientes em geral
                  <textarea className="field-input" rows={2} value={clientesGeral} onChange={(e) => setClientesGeral(e.target.value)} />
                </label>
                <label className="field">
                  Produtos em geral
                  <textarea className="field-input" rows={2} value={produtosGeral} onChange={(e) => setProdutosGeral(e.target.value)} />
                </label>
              </div>
            )}

            <label className="field">
              Resumo da Reunião
              <textarea className="field-input" value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3} placeholder="Resumo do que foi tratado na reunião..." />
            </label>

            <div className="field">
              <div className="flex-between" style={{ marginBottom: 2 }}>
                <span>Ata <span className="text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· observações, editável</span></span>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.55rem', fontSize: 12 }} onClick={() => setAta(ataAuto)}>
                  Preencher automático
                </button>
              </div>
              <textarea className="field-input" value={ata} onChange={(e) => setAta(e.target.value)} rows={4} placeholder="Observações da reunião (entram na ata em PDF). Vazia = gera automática ao salvar." />
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 8, alignSelf: 'flex-start' }}
                onClick={() => gerarAtaPdf({
                  clientName: clientes.find((c) => c.id === clientId)?.empresa ?? '',
                  date: parse(date, 'yyyy-MM-dd', new Date()).toISOString(),
                  time, type, status, subject, servicos,
                  checklist, preAnalise, resumo,
                  ata: ata.trim() ? ata : ataAuto,
                  description,
                })}
              >
                <FileText size={15} /> Gerar Ata (PDF)
              </button>
            </div>

            <label className="field">
              Descrição
              <textarea className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            <div className="field">
              Anexos
              {!editando ? (
                <p className="text-muted" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}>Salve o evento primeiro para anexar arquivos.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {(eventoAtual?.attachments ?? []).map((anexo) => (
                      <span key={anexo.id} className="attachment-chip">
                        <Paperclip size={12} />
                        <a href={urlAnexo(anexo.filename)} target="_blank" rel="noreferrer">{anexo.originalName}</a>
                        <button type="button" onClick={() => removerAnexoEvento(initial.id, anexo)} aria-label="Remover anexo"><X size={12} /></button>
                      </span>
                    ))}
                    {(eventoAtual?.attachments ?? []).length === 0 && (<span className="text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhum anexo.</span>)}
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Paperclip size={14} /> {uploading ? 'Enviando...' : 'Adicionar arquivo'}
                  </button>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleFilesSelected(e.target.files)} />
                </>
              )}
            </div>
          </div>

          <div className="modal-footer">
            {editando && (
              <button type="button" className="btn btn-danger" onClick={handleDelete} style={{ marginRight: 'auto' }}>
                <Trash2 size={15} /> Excluir
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-success" onClick={handleConcluir} disabled={saving || clientes.length === 0} title="Salvar marcando a reunião como concluída">
              <Check size={15} /> Concluir
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || clientes.length === 0}>
              {saving ? 'Salvando...' : recorrente && !editando ? `Criar ${Math.max(1, ocorrencias)} reuniões` : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
