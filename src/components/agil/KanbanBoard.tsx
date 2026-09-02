import { Fragment, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, Columns3, Flag, Pencil, Rows3 } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { usePersistedState } from '../../hooks/usePersistedState';
import { montarHierarquiaColunas } from '../../utils/agilColunas';
import { KanbanColumnHeader } from './KanbanColumnHeader';
import { KanbanGroupHeader } from './KanbanGroupHeader';
import { KanbanCell } from './KanbanCell';
import { ColumnFormModal } from './ColumnFormModal';
import { SwimlaneFormModal } from './SwimlaneFormModal';
import { FrentesManagerModal } from './FrentesManagerModal';
import { TaskDetailModal } from './TaskDetailModal';
import { Button } from '../../ui';
import type { AgilBoard, AgilColuna, AgilSwimlane, AgilTarefa } from '../../types';

/** Largura mínima por coluna: acima disso as colunas esticam para ocupar a
 *  janela toda (1fr); abaixo, o board ganha rolagem horizontal. */
const LARGURA_MIN = 196;
const LARGURA_COLAPSADA = 36;
const ALTURA_LINHA_CABECALHO = 34;
/** Linhas de grid reservadas por swimlane: rótulo da swimlane + 2 de
 *  cabeçalho de coluna (grupo/sub-coluna) + 1 de células. */
const LINHAS_POR_SWIMLANE = 4;

interface KanbanBoardProps {
  board: AgilBoard;
}

export function KanbanBoard({ board }: KanbanBoardProps) {
  const { agilColunas, agilSwimlanes, agilTarefas, reordenarAgilColunas, moverAgilTarefas } = useCarteira();
  const [colunaModal, setColunaModal] = useState<{ initial?: AgilColuna; parentId?: string } | null>(null);
  const [swimlaneModal, setSwimlaneModal] = useState<'nova' | AgilSwimlane | null>(null);
  const [frentesModalAberto, setFrentesModalAberto] = useState(false);
  const [tarefaModal, setTarefaModal] = useState<{ initial?: AgilTarefa; colunaId?: string; swimlaneId?: string } | null>(null);
  // Ids são únicos globalmente, então uma única lista serve para todos os boards.
  const [colunasColapsadas, setColunasColapsadas] = usePersistedState<string[]>('agil:colunasColapsadas', []);
  const [swimlanesColapsadas, setSwimlanesColapsadas] = usePersistedState<string[]>('agil:swimlanesColapsadas', []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const colunasDoBoard = useMemo(() => agilColunas.filter((c) => c.boardId === board.id), [agilColunas, board.id]);
  const { topo, filhosPorPai, folhas, trackPorFolha } = useMemo(
    () => montarHierarquiaColunas(colunasDoBoard),
    [colunasDoBoard]
  );
  const swimlanes = useMemo(
    () => agilSwimlanes.filter((s) => s.boardId === board.id).sort((a, b) => a.ordem - b.ordem),
    [agilSwimlanes, board.id]
  );
  const tarefas = useMemo(() => agilTarefas.filter((t) => t.boardId === board.id), [agilTarefas, board.id]);

  const tarefasPorCelula = useMemo(() => {
    const m = new Map<string, AgilTarefa[]>();
    tarefas.forEach((t) => {
      const chave = `${t.colunaId}::${t.swimlaneId}`;
      if (!m.has(chave)) m.set(chave, []);
      m.get(chave)!.push(t);
    });
    m.forEach((lista) => lista.sort((a, b) => a.ordem - b.ordem));
    return m;
  }, [tarefas]);

  /** Total por coluna-folha; numa agrupadora, a soma das sub-colunas (CONWIP). */
  const totalPorColuna = useMemo(() => {
    const m = new Map<string, number>();
    tarefas.forEach((t) => m.set(t.colunaId, (m.get(t.colunaId) ?? 0) + 1));
    topo.forEach((c) => {
      const filhos = filhosPorPai.get(c.id) ?? [];
      if (filhos.length > 0) m.set(c.id, filhos.reduce((soma, f) => soma + (m.get(f.id) ?? 0), 0));
    });
    return m;
  }, [tarefas, topo, filhosPorPai]);

  const totalPorSwimlane = useMemo(() => {
    const m = new Map<string, number>();
    tarefas.forEach((t) => m.set(t.swimlaneId, (m.get(t.swimlaneId) ?? 0) + 1));
    return m;
  }, [tarefas]);

  function alternar(lista: string[], setLista: (v: string[]) => void, id: string) {
    setLista(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    if (active.data.current?.type === 'coluna') {
      // Reordenar só entre IRMÃS: arrastar uma sub-coluna para fora do próprio
      // grupo (ou uma de topo para dentro de um) mudaria a hierarquia, não a
      // ordem — não é o que o arraste do cabeçalho significa.
      if (over.data.current?.type !== 'coluna') return;
      const paiAtivo = (active.data.current.parentId as string) ?? '';
      const paiDestino = (over.data.current.parentId as string) ?? '';
      if (paiAtivo !== paiDestino) return;

      const irmas = paiAtivo ? (filhosPorPai.get(paiAtivo) ?? []) : topo;
      const oldIndex = irmas.findIndex((c) => c.id === active.id);
      const newIndex = irmas.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordenadas = arrayMove(irmas, oldIndex, newIndex);
      void reordenarAgilColunas(reordenadas.map((c, i) => ({ id: c.id, ordem: i })));
      return;
    }

    if (active.data.current?.type === 'tarefa') {
      const tarefaAtiva = tarefas.find((t) => t.id === active.id);
      if (!tarefaAtiva) return;

      let colunaDestinoId: string | undefined;
      let swimlaneDestinoId: string | undefined;
      let overTarefaId: string | undefined;
      if (over.data.current?.type === 'tarefa') {
        colunaDestinoId = over.data.current.colunaId as string;
        swimlaneDestinoId = over.data.current.swimlaneId as string;
        overTarefaId = String(over.id);
      } else if (over.data.current?.type === 'celula') {
        colunaDestinoId = over.data.current.colunaId as string;
        swimlaneDestinoId = over.data.current.swimlaneId as string;
      }
      if (!colunaDestinoId || !swimlaneDestinoId) return;

      const chave = `${colunaDestinoId}::${swimlaneDestinoId}`;
      const destino = (tarefasPorCelula.get(chave) ?? []).filter((t) => t.id !== tarefaAtiva.id);
      const insertAt = overTarefaId ? destino.findIndex((t) => t.id === overTarefaId) : -1;
      destino.splice(insertAt === -1 ? destino.length : insertAt, 0, tarefaAtiva);

      void moverAgilTarefas(destino.map((t, i) => ({ id: t.id, colunaId: colunaDestinoId!, swimlaneId: swimlaneDestinoId!, ordem: i })));
    }
  }

  // Uma coluna-folha colapsada vira uma faixa estreita fixa; as demais dividem
  // a largura disponível (1fr), esticando para preencher a janela.
  const gridTemplateColumns = folhas
    .map((f) => (colunasColapsadas.includes(f.id) ? `${LARGURA_COLAPSADA}px` : `minmax(${LARGURA_MIN}px, 1fr)`))
    .join(' ');

  // Todas as colunas do cabeçalho participam do mesmo SortableContext; a
  // restrição "só entre irmãs" é aplicada no handleDragEnd.
  const idsOrdenaveis = useMemo(() => {
    const ids: string[] = [];
    topo.forEach((c) => {
      ids.push(c.id);
      (filhosPorPai.get(c.id) ?? []).forEach((f) => ids.push(f.id));
    });
    return ids;
  }, [topo, filhosPorPai]);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-3 px-2.5 py-2 rounded border border-border bg-card-hover">
        <Button variant="secondary" onClick={() => setColunaModal({})}>
          <Columns3 size={14} /> Coluna
        </Button>
        <Button variant="secondary" onClick={() => setSwimlaneModal('nova')}>
          <Rows3 size={14} /> Swimlane
        </Button>
        <Button variant="secondary" onClick={() => setFrentesModalAberto(true)}>
          <Flag size={14} /> Frente
        </Button>
        <span className="ml-auto text-[0.72rem] font-medium text-text-muted tabular-nums">
          {tarefas.length} tarefa(s) · {folhas.length} coluna(s) · {swimlanes.length} swimlane(s)
        </span>
      </div>

      {folhas.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
          Este board não tem colunas. Crie a primeira coluna para começar.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {/* Um único grid para faixas de swimlane + cabeçalho + células: é o
              que garante o alinhamento e deixa as faixas ocuparem a largura
              toda, inclusive quando há rolagem horizontal. `overflow-hidden`
              no wrapper arredondado recorta as bordas internas nos cantos.
              Ordem por swimlane: rótulo da swimlane (prioridade 1, sticky no
              topo) → cabeçalho de coluna → células — pedido explícito do
              usuário, que a swimlane fique acima de tudo, não escondida
              embaixo do cabeçalho de coluna. */}
          <div className="rounded border border-border shadow-sm overflow-hidden bg-bg">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 245px)' }}>
              <div className="grid" style={{ gridTemplateColumns }}>
                <SortableContext items={idsOrdenaveis} strategy={horizontalListSortingStrategy}>
                  {swimlanes.map((swimlane, i) => {
                    const recolhida = swimlanesColapsadas.includes(swimlane.id);
                    // Reordenar colunas só é permitido pela 1ª swimlane — as
                    // demais mostram uma CÓPIA visual do mesmo cabeçalho (as
                    // colunas são do board, não da swimlane), sem registrar o
                    // id da coluna de novo no dnd-kit.
                    const arrastavel = i === 0;
                    const base = i * LINHAS_POR_SWIMLANE;
                    const linhaRotulo = base + 1;
                    const linhaCabecalho1 = base + 2;
                    const linhaCabecalho2 = base + 3;
                    const linhaCelulas = base + 4;

                    return (
                      <Fragment key={swimlane.id}>
                        {/* Rótulo da swimlane — atravessa todas as colunas, sticky no
                            topo da própria seção ao rolar. */}
                        <div
                          className="group sticky top-0 z-30 flex items-center gap-1.5 px-3 py-2 bg-card-hover border-b-2 border-t border-border shadow-sm"
                          style={{ gridRow: linhaRotulo, gridColumn: '1 / -1' }}
                        >
                          <button
                            onClick={() => alternar(swimlanesColapsadas, setSwimlanesColapsadas, swimlane.id)}
                            className="shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer transition-colors hover:bg-card hover:text-text-primary"
                            title={recolhida ? 'Expandir swimlane' : 'Recolher swimlane'}
                          >
                            {recolhida ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </button>
                          {/* Ícone de swimlane antes do título — deixa claro que isto é uma
                              faixa dentro do board, não o nome de outro board (confusão real
                              já relatada, uma swimlane e um board têm peso visual parecido). */}
                          <span className="flex-1 flex items-center justify-center gap-1.5 text-[0.78rem] font-bold tracking-[0.02em] text-text-primary truncate">
                            <Rows3 size={13} className="shrink-0 text-text-muted" />
                            {swimlane.titulo}
                          </span>
                          <button
                            onClick={() => setSwimlaneModal(swimlane)}
                            className="shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-[opacity,color,background-color] hover:bg-card hover:text-text-primary"
                            title="Editar swimlane"
                          >
                            <Pencil size={11} />
                          </button>
                          <span className="shrink-0 min-w-[18px] px-1 text-center rounded-full bg-bg text-[0.64rem] font-semibold text-text-muted tabular-nums">
                            {totalPorSwimlane.get(swimlane.id) ?? 0}
                          </span>
                        </div>

                        {!recolhida && (
                          <>
                            {/* Cabeçalho de coluna desta seção */}
                            {topo.map((coluna) => {
                              const filhos = filhosPorPai.get(coluna.id) ?? [];

                              if (filhos.length === 0) {
                                const track = trackPorFolha.get(coluna.id)!;
                                return (
                                  <KanbanColumnHeader
                                    key={coluna.id}
                                    coluna={coluna}
                                    totalTarefas={totalPorColuna.get(coluna.id) ?? 0}
                                    colapsada={colunasColapsadas.includes(coluna.id)}
                                    ocupaDuasLinhas
                                    ultimaColuna={track === folhas.length}
                                    arrastavel={arrastavel}
                                    style={{ gridRow: `${linhaCabecalho1} / span 2`, gridColumn: track, minHeight: ALTURA_LINHA_CABECALHO * 2 }}
                                    onToggleColapso={() => alternar(colunasColapsadas, setColunasColapsadas, coluna.id)}
                                    onEdit={() => setColunaModal({ initial: coluna })}
                                    onAddSub={() => setColunaModal({ parentId: coluna.id })}
                                  />
                                );
                              }

                              const trackInicial = trackPorFolha.get(filhos[0].id)!;
                              return (
                                <Fragment key={coluna.id}>
                                  <KanbanGroupHeader
                                    coluna={coluna}
                                    totalTarefas={totalPorColuna.get(coluna.id) ?? 0}
                                    ultimaColuna={trackInicial + filhos.length - 1 === folhas.length}
                                    arrastavel={arrastavel}
                                    style={{ gridRow: linhaCabecalho1, gridColumn: `${trackInicial} / span ${filhos.length}`, minHeight: ALTURA_LINHA_CABECALHO }}
                                    onEdit={() => setColunaModal({ initial: coluna })}
                                    onAddSub={() => setColunaModal({ parentId: coluna.id })}
                                  />
                                  {filhos.map((filho) => {
                                    const track = trackPorFolha.get(filho.id)!;
                                    return (
                                      <KanbanColumnHeader
                                        key={filho.id}
                                        coluna={filho}
                                        totalTarefas={totalPorColuna.get(filho.id) ?? 0}
                                        colapsada={colunasColapsadas.includes(filho.id)}
                                        ocupaDuasLinhas={false}
                                        ultimaColuna={track === folhas.length}
                                        arrastavel={arrastavel}
                                        style={{ gridRow: linhaCabecalho2, gridColumn: track, minHeight: ALTURA_LINHA_CABECALHO }}
                                        onToggleColapso={() => alternar(colunasColapsadas, setColunasColapsadas, filho.id)}
                                        onEdit={() => setColunaModal({ initial: filho })}
                                      />
                                    );
                                  })}
                                </Fragment>
                              );
                            })}

                            {/* Células desta seção */}
                            {folhas.map((folha) => {
                              const track = trackPorFolha.get(folha.id)!;
                              return (
                                <KanbanCell
                                  key={folha.id}
                                  colunaId={folha.id}
                                  swimlaneId={swimlane.id}
                                  tarefas={tarefasPorCelula.get(`${folha.id}::${swimlane.id}`) ?? []}
                                  colapsada={colunasColapsadas.includes(folha.id)}
                                  wipExcedido={!!folha.wipLimit && (totalPorColuna.get(folha.id) ?? 0) > folha.wipLimit}
                                  ultimaColuna={track === folhas.length}
                                  style={{ gridRow: linhaCelulas, gridColumn: track }}
                                  onNovaTarefa={() => setTarefaModal({ colunaId: folha.id, swimlaneId: swimlane.id })}
                                  onEditTarefa={(t) => setTarefaModal({ initial: t })}
                                />
                              );
                            })}
                          </>
                        )}
                      </Fragment>
                    );
                  })}
                </SortableContext>
              </div>
            </div>
          </div>
        </DndContext>
      )}

      {colunaModal && (
        <ColumnFormModal
          boardId={board.id}
          initial={colunaModal.initial}
          parentIdInicial={colunaModal.parentId}
          colunasTopo={topo}
          temFilhos={!!colunaModal.initial && (filhosPorPai.get(colunaModal.initial.id) ?? []).length > 0}
          onClose={() => setColunaModal(null)}
        />
      )}

      {swimlaneModal && (
        <SwimlaneFormModal
          boardId={board.id}
          boardNome={board.nome}
          initial={swimlaneModal === 'nova' ? undefined : swimlaneModal}
          onClose={() => setSwimlaneModal(null)}
        />
      )}

      {frentesModalAberto && (
        <FrentesManagerModal boardId={board.id} onClose={() => setFrentesModalAberto(false)} />
      )}

      {tarefaModal && (
        <TaskDetailModal
          boardId={board.id}
          colunas={colunasDoBoard}
          swimlanes={swimlanes}
          initial={tarefaModal.initial}
          initialColunaId={tarefaModal.colunaId}
          initialSwimlaneId={tarefaModal.swimlaneId}
          onClose={() => setTarefaModal(null)}
        />
      )}
    </div>
  );
}
