import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Flag } from 'lucide-react';
import { colunaConcluida, montarHierarquiaColunas, tarefaPendenteBloqueiaConclusao } from '../../utils/agilColunas';
import { corContrastante } from '../../utils/cor';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Button, Chip, Field, Input, Textarea } from '../../ui';
import { SelectField } from '../SelectField';
import { ClienteCombobox } from '../ClienteCombobox';
import type { AgilColuna, AgilTarefa } from '../../types';
import { SubtarefasTab } from './SubtarefasTab';
import { ComentariosTab } from './ComentariosTab';
import { ConexoesTab } from './ConexoesTab';
import { HistoricoTab } from './HistoricoTab';

interface TaskDetailModalProps {
  boardId: string;
  colunas: AgilColuna[];
  initial?: AgilTarefa;
  /** Pré-seleciona coluna ao criar (ex.: botão "+ tarefa" de uma coluna específica). */
  initialColunaId?: string;
  /** Pré-seleciona a raia (ex.: botão "+ tarefa" de uma célula de swimlane). */
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

export function TaskDetailModal({ boardId, colunas, initial, initialColunaId, initialSwimlaneId, onClose }: TaskDetailModalProps) {
  const { clientes, agilBoards, agilWorkspaces, agilColunas, agilTarefas, agilFrentes, agilCamposPersonalizados, criarAgilTarefa, atualizarAgilTarefa, removerAgilTarefa, opcoesPorTipo } = useCarteira();
  const prioridadeOpcoes = opcoesPorTipo('prioridade_tarefa');
  const monitorOpcoes = opcoesPorTipo('monitor');
  const board = agilBoards.find((b) => b.id === boardId);
  const boardNome = board?.nome ?? '';
  const workspace = agilWorkspaces.find((w) => w.id === board?.workspaceId);
  // Candidatas a "Iniciativa vinculada": tarefas do board FIXO de Iniciativas
  // da workspace (não desta board) — exclui a própria tarefa (não referencia a si mesma).
  const iniciativasDoBoard = useMemo(
    () => agilTarefas
      .filter((t) => t.boardId === workspace?.iniciativasBoardId && t.id !== initial?.id)
      .sort((a, b) => a.ordem - b.ordem),
    [agilTarefas, workspace, initial]
  );
  const camposDoBoard = useMemo(
    () => agilCamposPersonalizados.filter((c) => c.boardId === boardId).sort((a, b) => a.ordem - b.ordem),
    [agilCamposPersonalizados, boardId]
  );

  // Só colunas-FOLHA recebem tarefas (uma coluna com sub-colunas é agrupadora),
  // e o rótulo mostra "Pai › Filho" para a escolha não ficar ambígua.
  const { folhas, rotuloPorFolha } = useMemo(() => montarHierarquiaColunas(colunas), [colunas]);

  const [titulo, setTitulo] = useState(initial?.titulo ?? '');
  const [descricao, setDescricao] = useState(initial?.descricao ?? '');
  const [colunaId, setColunaId] = useState(initial?.colunaId ?? initialColunaId ?? folhas[0]?.id ?? '');
  const [iniciativaId, setIniciativaId] = useState(initial?.iniciativaId ?? '');
  const [frenteId, setFrenteId] = useState(initial?.frenteId ?? '');
  const [prioridade, setPrioridade] = useState(initial?.prioridade ?? '');
  const [tamanho, setTamanho] = useState(initial?.tamanho ?? '');
  const [responsaveis, setResponsaveis] = useState<string[]>(initial?.responsaveis ?? []);
  const [dueAt, setDueAt] = useState(initial?.dueAt ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [bloqueado, setBloqueado] = useState(initial?.bloqueado ?? false);
  const [motivoBloqueio, setMotivoBloqueio] = useState(initial?.motivoBloqueio ?? '');
  const [valoresCampos, setValoresCampos] = useState<Record<string, string>>(initial?.camposPersonalizados ?? {});
  const [saving, setSaving] = useState(false);
  const [frenteMenuAberto, setFrenteMenuAberto] = useState(false);

  function setValorCampo(campoId: string, valor: string) {
    setValoresCampos((prev) => ({ ...prev, [campoId]: valor }));
  }

  // Cor do cabeçalho: a Frente tem precedência sobre a de prioridade (mesma
  // lógica visual do card); sem nenhuma das duas, cabeçalho padrão do tema.
  const frenteSelecionada = agilFrentes.find((f) => f.id === frenteId);
  const corCabecalho = frenteSelecionada?.cor ?? PRIORIDADE_COR[prioridade] ?? undefined;
  const corTextoCabecalho = corCabecalho ? corContrastante(corCabecalho) : undefined;

  function toggleResponsavel(m: string) {
    setResponsaveis((prev) => (prev.includes(m) ? prev.filter((r) => r !== m) : [...prev, m]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !colunaId) return;

    // Iniciativa não pode ser concluída com tarefa vinculada ainda pendente.
    if (initial && workspace?.iniciativasBoardId === boardId && colunaId !== initial.colunaId) {
      const colunaDestino = colunas.find((c) => c.id === colunaId);
      if (colunaConcluida(colunaDestino?.titulo)) {
        const pendente = tarefaPendenteBloqueiaConclusao(initial.id, agilTarefas, agilColunas);
        if (pendente) {
          toastError(`Não dá pra concluir "${initial.titulo}" — a tarefa "${pendente}" ainda não está concluída.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = {
        boardId, colunaId, titulo, descricao,
        // Raia só é atribuída na criação (a partir de onde o "+ tarefa" foi
        // clicado) — depois disso, muda por drag-and-drop no board, não aqui.
        ...(initial ? {} : { swimlaneId: initialSwimlaneId }),
        iniciativaId: iniciativaId || undefined,
        frenteId: frenteId || undefined,
        prioridade: prioridade || undefined,
        tamanho: tamanho || undefined,
        responsaveis: responsaveis.length > 0 ? responsaveis : undefined,
        dueAt: dueAt || undefined,
        clientId: clientId || undefined,
        bloqueado,
        motivoBloqueio: bloqueado ? motivoBloqueio : undefined,
        camposPersonalizados: Object.keys(valoresCampos).length > 0 ? valoresCampos : undefined,
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
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setFrenteMenuAberto((v) => !v)}
              title={frenteSelecionada ? `Frente: ${frenteSelecionada.nome}` : 'Escolher Frente'}
              aria-label={frenteSelecionada ? `Frente: ${frenteSelecionada.nome}` : 'Escolher Frente'}
              className="flex items-center justify-center w-7 h-7 rounded-[6px] border-none cursor-pointer bg-transparent hover:bg-[rgba(0,0,0,0.1)]"
              style={{ color: frenteSelecionada?.cor ?? 'inherit', opacity: frenteSelecionada ? 1 : 0.55 }}
            >
              <Flag size={16} fill={frenteSelecionada ? frenteSelecionada.cor : 'none'} />
            </button>
            {frenteMenuAberto && (
              <div
                className="absolute left-0 top-[calc(100%+4px)] z-50 flex flex-col gap-0.5 p-1 rounded-lg border border-border-strong bg-card shadow-lg text-text-primary"
                style={{ minWidth: 170 }}
                onMouseLeave={() => setFrenteMenuAberto(false)}
              >
                <button
                  type="button"
                  onClick={() => { setFrenteId(''); setFrenteMenuAberto(false); }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-[4px] text-[0.8rem] text-text-secondary bg-transparent border-none cursor-pointer text-left hover:bg-card-hover"
                >
                  Nenhuma
                </button>
                {agilFrentes.length === 0 && (
                  <p className="px-2 py-1 text-[0.72rem] text-text-muted" style={{ maxWidth: 170 }}>Nenhuma Frente cadastrada — adicione em Configurações do Ágil.</p>
                )}
                {agilFrentes.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setFrenteId(f.id); setFrenteMenuAberto(false); }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-[4px] text-[0.8rem] text-text-primary bg-transparent border-none cursor-pointer text-left hover:bg-card-hover"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0 border border-border-strong" style={{ background: f.cor }} />
                    <span className="truncate">{f.nome}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
            aria-label="Título da tarefa"
            required
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[1.05rem] font-semibold placeholder:opacity-60"
            style={{ color: 'inherit' }}
          />
        </div>
      }
      footer={
        <>
          <span className="text-[0.76rem] text-text-muted mr-auto self-center truncate">
            {boardNome && <>No quadro <strong className="text-text-secondary">{boardNome}</strong></>}
          </span>
          {initial && <Button variant="danger" onClick={handleDelete}>Excluir</Button>}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) 260px' }}>
        {/* Coluna esquerda: descrição + atividade (subtarefas/comentários) —
            tudo na mesma tela, sem abas, para não esconder informação atrás de clique. */}
        <div className="flex flex-col min-w-0">
          <Field label="Descrição">
            <Textarea tone="modal" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </Field>

          {bloqueado && (
            <div className="flex items-start gap-2 p-2.5 mb-3 rounded bg-[var(--danger-bg)] text-danger text-[0.82rem]">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{motivoBloqueio || 'Tarefa bloqueada.'}</span>
            </div>
          )}

          <section className="mb-3">
            <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-text-muted mb-1.5">Subtarefas</h3>
            {initial ? (
              <SubtarefasTab tarefaId={initial.id} />
            ) : (
              <p className="text-[0.8rem] text-text-muted">Salve a tarefa para adicionar subtarefas.</p>
            )}
          </section>

          <section className="mb-3">
            <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-text-muted mb-1.5">Comentários</h3>
            {initial ? (
              <ComentariosTab tarefaId={initial.id} />
            ) : (
              <p className="text-[0.8rem] text-text-muted">Salve a tarefa para comentar.</p>
            )}
          </section>

          <section className="mb-3">
            <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-text-muted mb-1.5">Conexões</h3>
            {initial ? (
              <ConexoesTab tarefaId={initial.id} />
            ) : (
              <p className="text-[0.8rem] text-text-muted">Salve a tarefa para ligar a outras.</p>
            )}
          </section>

          <section>
            <h3 className="text-[0.78rem] font-bold uppercase tracking-[0.05em] text-text-muted mb-1.5">Histórico</h3>
            {initial ? (
              <HistoricoTab tarefaId={initial.id} />
            ) : (
              <p className="text-[0.8rem] text-text-muted">Salve a tarefa para ver o histórico.</p>
            )}
          </section>
        </div>

        {/* Coluna direita: campos estruturados — igual ao "Card Fields" de
            referência (Kanbanize/Businessmap), tudo visível de uma vez. */}
        <div className="flex flex-col min-w-0">
          <SelectField
            label="Prioridade"
            placeholder="Nenhuma"
            value={prioridade}
            onChange={setPrioridade}
            options={[{ value: '', label: 'Nenhuma' }, ...prioridadeOpcoes.map((p) => ({ value: p, label: p }))]}
          />

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

          <Field label="Tamanho">
            <Input tone="modal" placeholder="Ex.: P, M, G" value={tamanho} onChange={(e) => setTamanho(e.target.value)} />
          </Field>

          <Field label="Prazo">
            <Input tone="modal" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>

          <Field label="Cliente vinculado">
            <ClienteCombobox clientes={clientes} value={clientId} onChange={setClientId} tone="modal" placeholder="Nenhum" limpavel />
          </Field>

          <SelectField
            label="Coluna"
            value={colunaId}
            onChange={setColunaId}
            options={folhas.map((c) => ({ value: c.id, label: rotuloPorFolha.get(c.id) ?? c.titulo }))}
          />

          {iniciativasDoBoard.length > 0 && (
            <SelectField
              label="Iniciativa vinculada"
              placeholder="Nenhuma"
              value={iniciativaId}
              onChange={setIniciativaId}
              options={[{ value: '', label: 'Nenhuma' }, ...iniciativasDoBoard.map((i) => ({ value: i.id, label: i.titulo }))]}
            />
          )}

          {camposDoBoard.map((campo) => {
            const valor = valoresCampos[campo.id] ?? '';
            if (campo.tipo === 'selecao') {
              return (
                <SelectField
                  key={campo.id}
                  label={campo.nome}
                  placeholder="Nenhum"
                  value={valor}
                  onChange={(v) => setValorCampo(campo.id, v)}
                  options={[{ value: '', label: 'Nenhum' }, ...(campo.opcoes ?? []).map((o) => ({ value: o, label: o }))]}
                />
              );
            }
            if (campo.tipo === 'pessoa') {
              return (
                <SelectField
                  key={campo.id}
                  label={campo.nome}
                  placeholder="Nenhum"
                  value={valor}
                  onChange={(v) => setValorCampo(campo.id, v)}
                  options={[{ value: '', label: 'Nenhum' }, ...monitorOpcoes.map((m) => ({ value: m, label: m }))]}
                />
              );
            }
            return (
              <Field key={campo.id} label={campo.nome}>
                <Input
                  tone="modal"
                  type={campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' ? 'number' : 'text'}
                  value={valor}
                  onChange={(e) => setValorCampo(campo.id, e.target.value)}
                />
              </Field>
            );
          })}

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
