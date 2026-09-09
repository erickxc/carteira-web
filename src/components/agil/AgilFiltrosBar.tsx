import { useMemo } from 'react';
import { useCarteira } from '../../context/CarteiraContext';
import { Dropdown } from '../Dropdown';
import { AGIL_FILTROS_VAZIOS, type AgilFiltros } from '../../utils/agilFiltros';

interface AgilFiltrosBarProps {
  boardId: string;
  filtros: AgilFiltros;
  onChange: (filtros: AgilFiltros) => void;
}

export function AgilFiltrosBar({ boardId, filtros, onChange }: AgilFiltrosBarProps) {
  const { agilFrentes, agilIniciativas, opcoesPorTipo } = useCarteira();
  const monitorOpcoes = opcoesPorTipo('monitor');
  const prioridadeOpcoes = opcoesPorTipo('prioridade_tarefa');
  const iniciativasDoBoard = useMemo(() => agilIniciativas.filter((i) => i.boardId === boardId), [agilIniciativas, boardId]);

  const ativo = Object.values(filtros).some((v) => v !== '');

  function set<K extends keyof AgilFiltros>(campo: K, valor: string) {
    onChange({ ...filtros, [campo]: valor });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Dropdown
        label="Responsável"
        variant="filtro"
        defaultValue=""
        value={filtros.responsavel}
        onChange={(v) => set('responsavel', v as string)}
        options={[{ value: '', label: 'Responsável' }, ...monitorOpcoes.map((m) => ({ value: m, label: m }))]}
      />
      <Dropdown
        label="Frente"
        variant="filtro"
        defaultValue=""
        value={filtros.frenteId}
        onChange={(v) => set('frenteId', v as string)}
        options={[{ value: '', label: 'Frente' }, ...agilFrentes.map((f) => ({ value: f.id, label: f.nome }))]}
      />
      <Dropdown
        label="Prioridade"
        variant="filtro"
        defaultValue=""
        value={filtros.prioridade}
        onChange={(v) => set('prioridade', v as string)}
        options={[{ value: '', label: 'Prioridade' }, ...prioridadeOpcoes.map((p) => ({ value: p, label: p }))]}
      />
      <Dropdown
        label="Prazo"
        variant="filtro"
        defaultValue=""
        value={filtros.prazo}
        onChange={(v) => set('prazo', v as string)}
        options={[
          { value: '', label: 'Prazo' },
          { value: 'atrasada', label: 'Atrasada' },
          { value: 'vencendo', label: 'Vencendo (7 dias)' },
          { value: 'sem_prazo', label: 'Sem prazo' },
        ]}
      />
      {iniciativasDoBoard.length > 0 && (
        <Dropdown
          label="Iniciativa"
          variant="filtro"
          defaultValue=""
          value={filtros.iniciativaId}
          onChange={(v) => set('iniciativaId', v as string)}
          options={[{ value: '', label: 'Iniciativa' }, ...iniciativasDoBoard.map((i) => ({ value: i.id, label: i.titulo }))]}
        />
      )}
      <Dropdown
        label="Bloqueada"
        variant="filtro"
        defaultValue=""
        value={filtros.bloqueada}
        onChange={(v) => set('bloqueada', v as string)}
        options={[{ value: '', label: 'Bloqueada' }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]}
      />
      {ativo && (
        <button
          type="button"
          onClick={() => onChange(AGIL_FILTROS_VAZIOS)}
          className="text-[0.72rem] text-text-muted bg-transparent border-none cursor-pointer hover:text-accent"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
