import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { montarHierarquiaColunas } from '../../utils/agilColunas';
import { corContrastante } from '../../utils/cor';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Badge, Button, Chip, Field, Input, Select, Textarea } from '../../ui';
import type { AgilColuna, AgilSwimlane, AgilTarefa } from '../../types';
import { SubtarefasTab } from './SubtarefasTab';
import { ComentariosTab } from './ComentariosTab';

interface TaskDetailModalProps {
  boardId: string;
  colunas: AgilColuna[];
  swimlanes: AgilSwimlane[];
  initial?: AgilTarefa;
  /** Pré-seleciona coluna/swimlane ao criar (ex.: botão "+ tarefa" de uma célula específica). */
  initialColunaId?: string;
  initialSwimlaneId?: string;
  onClose: () => void;
}

/** Cor da barra de prioridade — mesmo mapa usado no card, para o cabeçalho do
 *  modal cair na mesma cor quando a tarefa não tem Frente definida. */
const PRIORIDADE_COR: Record<string, string> = {
  Baixa: 'var(--border-strong)',
  Média: 'var(--success)',
  Alta: 'var(--warning)',
  Urgente: 'var(--danger)',
};

export function TaskDetailModal({ boardId, colunas, swimlanes, initial, initialColunaId, initialSwimlaneId, onClose }: TaskDetailModalProps) {
  const { clientes, agilFrentes, agilBoards, agilTarefas, criarAgilTarefa, atualizarAgilTarefa, removerAgilTarefa, opcoesPorTipo } = useCarteira();
  const prioridadeOpcoes = opcoesPorTipo('prioridade_tarefa');
  const monitorOpcoes = opcoesPorTipo('monitor');
  const frentes = useMemo(() => agilFrentes.filter((f) => f.boardId === boardId).sort((a, b) => a.ordem - b.ordem), [agilFrentes, boardId]);
  const board = agilBoards.find((b) => b.id === boardId);
  const boardNome = board?.nome ?? '';
  // Candidatas a "Iniciativa": tarefas do quadro de Iniciativas vinculado a
  // este board (Fase B) — só existe quando o board tem `iniciativasBoardId`.
  const iniciativasCandidatas = useMemo(
    () => (board?.iniciativasBoardId ? agilTarefas.filter((t) => t.boardId === board.iniciativasBoardId) : []),
    [agilTarefas, board]
  );

  // Só colunas-FOLHA recebem tarefas (uma coluna com sub-colunas é agrupadora),
  // e o rótulo mostra "Pai › Filho" para a escolha não ficar ambígua.
  const { folhas, rotuloPorFolha } = useMemo(() => montarHierarquiaColunas(colunas), [colunas]);

  const [titulo, setTitulo] = useState(initial?.titulo ?? '');
  const [descricao, setDescricao] = useState(initial?.descricao ?? '');
  const [colunaId, setColunaId] = useState(initial?.colunaId ?? initialColunaId ?? folhas[0]?.id ?? '');
  const [swimlaneId, setSwimlaneId] = useState(initial?.swimlaneId ?? initialSwimlaneId ?? swimlanes[0]?.id ?? '');
  const [frenteId, setFrenteId] = useState(initial?.frenteId ?? '');
  const [iniciativaId, setIniciativaId] = useState(initial?.iniciativaId ?? '');
  const [prioridade, setPrioridade] = useState(initial?.prioridade ?? '');
  const [responsaveis, setResponsaveis] = useState<string[]>(initial?.responsaveis ?? []);
  const [dueAt, setDueAt] = useState(initial?.dueAt ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [labels, setLabels] = useState<string[]>(initial?.labels ?? []);
  const [labelInput, setLabelInput] = useState('');
  const [bloqueado, setBloqueado] = useState(initial?.bloqueado ?? false);
  const [motivoBloqueio, setMotivoBloqueio] = useState(initial?.motivoBloqueio ?? '');
  const [saving, setSaving] = useState(false);

  // Cor do cabeçalho: a Frente escolhida manda; sem Frente, cai na cor de
  // prioridade (mesma lógica visual do card); sem nenhuma das duas, cabeçalho
  // padrão do tema (sem override) — igual aos outros modais do app.
  const frenteSelecionada = frentes.find((f) => f.id === frenteId);
  const corCabecalho = frenteSelecionada?.cor ?? PRIORIDADE_COR[prioridade] ?? undefined;
  const corTextoCabecalho = corCabecalho ? corContrastante(frenteSelecionada?.cor ?? '#8a8a92') : undefined;

  function toggleResponsavel(m: string) {
    setResponsaveis((prev) => (prev.includes(m) ? prev.filter((r) => r !== m) : [...prev, m]));
  }

  function addLabel() {
    const v = labelInput.trim();
    if (v && !labels.includes(v)) setLabels((prev) => [...prev, v]);
    setLabelInput('');
  }

  function handleLabelKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addLabel();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !colunaId || !swimlaneId) return;
    setSaving(true);
    try {
      const payload = {
        boardId, colunaId, swimlaneId, titulo, descricao,
        frenteId: frenteId || undefined,
        iniciativaId: iniciativaId || undefined,
        prioridade: prioridade || undefined,
        responsaveis: responsaveis.length > 0 ? responsaveis : undefined,
        dueAt: dueAt || undefined,
        clientId: clientId || undefined,
        labels,
        bloqueado,
        motivoBloqueio: bloqueado ? motivoBloqueio : undefined,
      };
      if (initial) {
        await atualizarAgilTarefa(initial.id, payload);
      } else {
        await criarAgilTarefa(payload);
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar a tarefa.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!(await confirmDialog(`Excluir a tarefa "${initial.titulo}"?`, { danger: true, confirmLabel: 'Excluir' }))) return;
    await removerAgilTarefa(initial.id);
    onClose();
  }

  return (
    <ModalShell
      title={initial ? `Tarefa${initial.numero ? ` #${initial.numero}` : ''} — ${initial.titulo}` : 'Nova tarefa'}
      onClose={onClose}
      onSubmit={handleSubmit}
      size="xl"
      headerBackground={corCabecalho}
      headerForeground={corTextoCabecalho}
      titleNode={
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {initial?.numero && (
            <span
              className="shrink-0 px-2 py-0.5 rounded-[6px] text-[0.72rem] font-bold tabular-nums"
              style={{ background: corCabecalho ? 'rgba(0,0,0,0.15)' : 'var(--bg)', color: 'inherit' }}
            >
              #{initial.numero}
            </span>
          )}
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título da tarefa"
            required
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[1.05rem] font-semibold placeholder:opacity-60"
            style={{ color: 'inherit' }}
          />
        </div>
      }
      footer={
        <>
          <span className="text-[0.76rem] text-text-muted mr-auto self-center truncate">
            {boardNome && <>No board <strong className="text-text-secondary">{boardNome}</strong></>}
          </span>
          {initial && <Button variant="danger" onClick={handleDelete}>Excluir</Button>}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) 260px' }}>
        {/* Coluna esquerda: descrição + atividade (subtarefas/comentários) —
            tudo na mesma tela, sem abas, para não esconder informação atrás de clique. */}
        <div className="flex flex-col gap-5 min-w-0">
          <Field label="Descrição">
            <Textarea tone="modal" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </Field>

          {bloqueado && (
            <div className="flex items-start gap-2 p-2.5 rounded bg-[var(--danger-bg)] text-danger text-[0.82rem]">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{motivoBloqueio || 'Tarefa bloqueada.'}</span>
            </div>
          )}

          <section>
            <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-text-muted mb-2">Subtarefas</h3>
            {initial ? (
              <SubtarefasTab tarefaId={initial.id} />
            ) : (
              <p className="text-[0.8rem] text-text-muted">Salve a tarefa para adicionar subtarefas.</p>
            )}
          </section>

          <section>
            <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-text-muted mb-2">Comentários</h3>
            {initial ? (
              <ComentariosTab tarefaId={initial.id} />
            ) : (
              <p className="text-[0.8rem] text-text-muted">Salve a tarefa para comentar.</p>
            )}
          </section>
        </div>

        {/* Coluna direita: campos estruturados — igual ao "Card Fields" de
            referência (Kanbanize/Businessmap), tudo visível de uma vez. */}
        <div className="flex flex-col gap-3 min-w-0">
          <Field label="Prioridade">
            <Select tone="modal" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
              <option value="">Nenhuma</option>
              {prioridadeOpcoes.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>

          <Field as="div" label="Responsável(is)">
            {monitorOpcoes.length === 0 ? (
              <p className="text-text-muted" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}>Nenhum monitor cadastrado — adicione em Configurações.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {monitorOpcoes.map((m) => (
                  <Chip variant="toggle" key={m} active={responsaveis.includes(m)} onClick={() => toggleResponsavel(m)}>{m}</Chip>
                ))}
              </div>
            )}
          </Field>

          <Field label="Prazo">
            <Input tone="modal" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>

          <Field label="Cliente vinculado">
            <Select tone="modal" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Nenhum</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.empresa}</option>)}
            </Select>
          </Field>

          <Field label="Coluna">
            <Select tone="modal" value={colunaId} onChange={(e) => setColunaId(e.target.value)} required>
              {folhas.map((c) => <option key={c.id} value={c.id}>{rotuloPorFolha.get(c.id) ?? c.titulo}</option>)}
            </Select>
          </Field>

          <Field label="Swimlane">
            <Select tone="modal" value={swimlaneId} onChange={(e) => setSwimlaneId(e.target.value)} required>
              {swimlanes.map((s) => <option key={s.id} value={s.id}>{s.titulo}</option>)}
            </Select>
          </Field>

          <Field label="Frente">
            <Select tone="modal" value={frenteId} onChange={(e) => setFrenteId(e.target.value)}>
              <option value="">Nenhuma</option>
              {frentes.map((f) => <option key={f.id} value={f.id}>{f.titulo}</option>)}
            </Select>
          </Field>

          {iniciativasCandidatas.length > 0 && (
            <Field label="Iniciativa vinculada">
              <Select tone="modal" value={iniciativaId} onChange={(e) => setIniciativaId(e.target.value)}>
                <option value="">Nenhuma</option>
                {iniciativasCandidatas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Etiquetas" as="div">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {labels.map((l) => (
                <Badge key={l} variant="muted">
                  {l}
                  <button type="button" onClick={() => setLabels((prev) => prev.filter((x) => x !== l))} className="inline-flex items-center ml-1 bg-transparent border-none cursor-pointer p-0 text-inherit">
                    <X size={11} />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              tone="modal"
              placeholder="Digite e pressione Enter"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              onBlur={addLabel}
            />
          </Field>

          <Field label={<span className="flex items-center gap-2"><input type="checkbox" checked={bloqueado} onChange={(e) => setBloqueado(e.target.checked)} /> Bloqueada</span>} as="div">
            {bloqueado && (
              <Input tone="modal" placeholder="Motivo do bloqueio" value={motivoBloqueio} onChange={(e) => setMotivoBloqueio(e.target.value)} />
            )}
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}
