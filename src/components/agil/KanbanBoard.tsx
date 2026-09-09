import { Fragment, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Columns3 } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { usePersistedState } from '../../hooks/usePersistedState';
import { montarHierarquiaColunas } from '../../utils/agilColunas';
import { KanbanColumnHeader } from './KanbanColumnHeader';
import { KanbanGroupHeader } from './KanbanGroupHeader';
import { KanbanCell } from './KanbanCell';
import { ColumnFormModal } from './ColumnFormModal';
import { TaskDetailModal } from './TaskDetailModal';
import { AgilFiltrosBar } from './AgilFiltrosBar';
import { AGIL_FILTROS_VAZIOS, filtrarAgilTarefas, type AgilFiltros } from '../../utils/agilFiltros';
import { Button } from '../../ui';
import type { AgilBoard, AgilColuna, AgilTarefa } from '../../types';

/** Largura mínima por coluna: acima disso as colunas esticam para ocupar a
 *  janela toda (1fr); abaixo, o board ganha rolagem horizontal. */
const LARGURA_MIN = 196;
const LARGURA_COLAPSADA = 36;
const ALTURA_LINHA_CABECALHO = 34;

interface KanbanBoardProps {
  board: AgilBoard;
}

export function KanbanBoard({ board }: KanbanBoardProps) {
  const { agilColunas, agilTarefas, reordenarAgilColunas, moverAgilTarefas } = useCarteira();
  const [colunaModal, setColunaModal] = useState<{ initial?: AgilColuna; parentId?: string } | null>(null);
  const [tarefaModal, setTarefaModal] = useState<{ initial?: AgilTarefa; colunaId?: string } | null>(null);
  const [colunasColapsadas, setColunasColapsadas] = usePersistedState<string[]>('agil:colunasColapsadas', []);
  const [filtros, setFiltros] = usePersistedState<AgilFiltros>(`agil:filtros:${board.id}`, AGIL_FILTROS_VAZIOS);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const colunasDoBoard = useMemo(() => agilColunas.filter((c) => c.boardId === board.id), [agilColunas, board.id]);
  const { topo, filhosPorPai, folhas, trackPorFolha } = useMemo(
    () => montarHierarquiaColunas(colunasDoBoard),
    [colunasDoBoard]
  );
  const tarefasDoBoard = useMemo(() => agilTarefas.filter((t) => t.boardId === board.id), [agilTarefas, board.id]);
  const tarefas = useMemo(() => filtrarAgilTarefas(tarefasDoBoard, filtros), [tarefasDoBoard, filtros]);

  const tarefasPorColuna = useMemo(() => {
    const m = new Map<string, AgilTarefa[]>();
    tarefas.forEach((t) => {
      if (!m.has(t.colunaId)) m.set(t.colunaId, []);
      m.get(t.colunaId)!.push(t);
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

  function alternarColapso(id: string) {
    setColunasColapsadas(colunasColapsadas.includes(id) ? colunasColapsadas.filter((x) => x !== id) : [...colunasColapsadas, id]);
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
      let overTarefaId: string | undefined;
      if (over.data.current?.type === 'tarefa') {
        colunaDestinoId = over.data.current.colunaId as string;
        overTarefaId = String(over.id);
      } else if (over.data.current?.type === 'celula') {
        colunaDestinoId = over.data.current.colunaId as string;
      }
      if (!colunaDestinoId) return;

      const destino = (tarefasPorColuna.get(colunaDestinoId) ?? []).filter((t) => t.id !== tarefaAtiva.id);
      const insertAt = overTarefaId ? destino.findIndex((t) => t.id === overTarefaId) : -1;
      destino.splice(insertAt === -1 ? destino.length : insertAt, 0, tarefaAtiva);

      void moverAgilTarefas(destino.map((t, i) => ({ id: t.id, colunaId: colunaDestinoId!, ordem: i })));
    }
  }

  // Uma coluna-folha colapsada vira uma faixa estreita fixa; as demais dividem
  // a largura disponível (1fr), esticando para preencher a janela.
  const gridTemplateColumns = folhas
    .map((f) => (colunasColapsadas.includes(f.id) ? `${LARGURA_COLAPSADA}px` : `minmax(${LARGURA_MIN}px, 1fr)`))
    .join(' ');

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
      <div className="flex items-center gap-2 mb-3 px-2.5 py-2 rounded border border-border bg-card-hover flex-wrap">
        <Button variant="secondary" onClick={() => setColunaModal({})}>
          <Columns3 size={14} /> Coluna
        </Button>
        <AgilFiltrosBar boardId={board.id} filtros={filtros} onChange={setFiltros} />
        <span className="ml-auto text-[0.72rem] font-medium text-text-muted tabular-nums">
          {tarefas.length} de {tarefasDoBoard.length} tarefa(s) · {folhas.length} coluna(s)
        </span>
      </div>

      {folhas.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
          Este board não tem colunas. Crie a primeira coluna para começar.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="rounded border border-border shadow-sm overflow-hidden bg-bg">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 245px)' }}>
              <div className="grid" style={{ gridTemplateColumns }}>
                <SortableContext items={idsOrdenaveis} strategy={horizontalListSortingStrategy}>
                  {/* Cabeçalho de coluna */}
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
                          arrastavel
                          style={{ gridRow: '1 / span 2', gridColumn: track, minHeight: ALTURA_LINHA_CABECALHO * 2 }}
                          onToggleColapso={() => alternarColapso(coluna.id)}
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
                          arrastavel
                          style={{ gridRow: 1, gridColumn: `${trackInicial} / span ${filhos.length}`, minHeight: ALTURA_LINHA_CABECALHO }}
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
                              arrastavel
                              style={{ gridRow: 2, gridColumn: track, minHeight: ALTURA_LINHA_CABECALHO }}
                              onToggleColapso={() => alternarColapso(filho.id)}
                              onEdit={() => setColunaModal({ initial: filho })}
                            />
                          );
                        })}
                      </Fragment>
                    );
                  })}

                  {/* Células */}
                  {folhas.map((folha) => {
                    const track = trackPorFolha.get(folha.id)!;
                    return (
                      <KanbanCell
                        key={folha.id}
                        colunaId={folha.id}
                        tarefas={tarefasPorColuna.get(folha.id) ?? []}
                        colapsada={colunasColapsadas.includes(folha.id)}
                        wipExcedido={!!folha.wipLimit && (totalPorColuna.get(folha.id) ?? 0) > folha.wipLimit}
                        ultimaColuna={track === folhas.length}
                        style={{ gridRow: 3, gridColumn: track }}
                        onNovaTarefa={() => setTarefaModal({ colunaId: folha.id })}
                        onEditTarefa={(t) => setTarefaModal({ initial: t })}
                      />
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

      {tarefaModal && (
        <TaskDetailModal
          boardId={board.id}
          colunas={colunasDoBoard}
          initial={tarefaModal.initial}
          initialColunaId={tarefaModal.colunaId}
          onClose={() => setTarefaModal(null)}
        />
      )}
    </div>
  );
}
