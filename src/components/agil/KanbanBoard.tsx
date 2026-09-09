import { Fragment, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Columns3, MoreVertical } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { usePersistedState } from '../../hooks/usePersistedState';
import { colunaConcluida, montarHierarquiaColunas, tarefaPendenteBloqueiaConclusao } from '../../utils/agilColunas';
import { toastError } from '../../utils/toast';
import { ordenarTarefasDaCelula, ORDENACAO_OPCOES } from '../../utils/agilOrdenacao';
import { KanbanColumnHeader } from './KanbanColumnHeader';
import { KanbanGroupHeader } from './KanbanGroupHeader';
import { KanbanCell } from './KanbanCell';
import { ColumnFormModal } from './ColumnFormModal';
import { TaskDetailModal } from './TaskDetailModal';
import { AGIL_FILTROS_VAZIOS, filtrarAgilTarefas, type AgilFiltros } from '../../utils/agilFiltros';
import { Dropdown } from '../Dropdown';
import { Button } from '../../ui';
import type { AgilBoard, AgilColuna, AgilOrdenacao, AgilTarefa } from '../../types';

/** Largura mínima por coluna: acima disso as colunas esticam para ocupar a
 *  janela toda (1fr); abaixo, o board ganha rolagem horizontal. */
const LARGURA_MIN = 196;
const LARGURA_COLAPSADA = 36;
const ALTURA_LINHA_CABECALHO = 34;

interface KanbanBoardProps {
  board: AgilBoard;
  /** Filtros vêm de fora (painel separado, lado direito da tela) — ausente
   *  (ex.: board de Iniciativas empilhado) = sem filtro nenhum. */
  filtros?: AgilFiltros;
}

export function KanbanBoard({ board, filtros = AGIL_FILTROS_VAZIOS }: KanbanBoardProps) {
  const { agilColunas, agilTarefas, agilWorkspaces, reordenarAgilColunas, moverAgilTarefas, atualizarAgilBoard } = useCarteira();
  // Este board É o board fixo de Iniciativas de alguma workspace? Só nele a
  // regra "não conclui com tarefa pendente por baixo" se aplica.
  const ehBoardIniciativas = agilWorkspaces.some((w) => w.iniciativasBoardId === board.id);
  const [colunaModal, setColunaModal] = useState<{ initial?: AgilColuna; parentId?: string } | null>(null);
  const [tarefaModal, setTarefaModal] = useState<{ initial?: AgilTarefa; colunaId?: string } | null>(null);
  const [colunasColapsadas, setColunasColapsadas] = usePersistedState<string[]>('agil:colunasColapsadas', []);
  const [menuAberto, setMenuAberto] = useState(false);

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
    m.forEach((lista, colunaId) => m.set(colunaId, ordenarTarefasDaCelula(lista, board.ordenacao)));
    return m;
  }, [tarefas, board.ordenacao]);

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

      if (ehBoardIniciativas && colunaDestinoId !== tarefaAtiva.colunaId) {
        const colunaDestino = agilColunas.find((c) => c.id === colunaDestinoId);
        if (colunaConcluida(colunaDestino?.titulo)) {
          const pendente = tarefaPendenteBloqueiaConclusao(tarefaAtiva.id, agilTarefas, agilColunas);
          if (pendente) {
            toastError(`Não dá pra concluir "${tarefaAtiva.titulo}" — a tarefa "${pendente}" ainda não está concluída.`);
            return;
          }
        }
      }

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
    <div className="mt-4 rounded-xl border border-border shadow-sm overflow-hidden bg-bg">
      {/* Barra de título — nome do board centralizado acima das colunas
          (estilo businessmap: "Initiatives workflow"/"Cards workflow"),
          uma peça só com o restante do card (bordas arredondadas no bloco todo). */}
      <div className="relative flex items-center justify-center px-3 py-2.5 bg-card-hover border-b border-border">
        <h2 className="text-[1.05rem] font-semibold text-text-primary truncate max-w-[80%]">{board.nome}</h2>
        <div className="absolute right-2 flex items-center gap-1.5">
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-text-muted bg-transparent border-none cursor-pointer hover:bg-card hover:text-text-primary"
            title="Mais opções do quadro"
          >
            <MoreVertical size={16} />
          </button>
        </div>
        {menuAberto && (
          <div
            className="absolute right-2 top-[calc(100%+2px)] z-40 flex flex-col gap-2 p-2.5 rounded-lg border border-border-strong bg-card shadow-lg"
            style={{ minWidth: 220 }}
            onMouseLeave={() => setMenuAberto(false)}
          >
            <Button variant="secondary" onClick={() => { setColunaModal({}); setMenuAberto(false); }}>
              <Columns3 size={14} /> Nova coluna
            </Button>
            <Dropdown
              label="Ordenar por"
              variant="campo"
              value={board.ordenacao ?? 'manual'}
              onChange={(v) => atualizarAgilBoard(board.id, { ordenacao: v as AgilOrdenacao })}
              options={ORDENACAO_OPCOES}
            />
          </div>
        )}
      </div>

      {/* Barra de ferramentas — só o contador (filtros ficam no painel
          separado, lado direito da tela). */}
      <div className="flex items-center gap-2 px-2.5 py-2 bg-card-hover border-b border-border flex-wrap">
        <span className="text-[0.72rem] font-medium text-text-muted tabular-nums shrink-0">
          {tarefas.length} de {tarefasDoBoard.length} tarefa(s) · {folhas.length} coluna(s)
        </span>
      </div>

      {folhas.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
          Este quadro não tem colunas. Crie a primeira coluna para começar.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div>
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
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
