import { format, parseISO } from 'date-fns';
import { History } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';

const CAMPO_LABEL: Record<string, string> = {
  colunaId: 'Coluna',
  titulo: 'Título',
  prioridade: 'Prioridade',
  tamanho: 'Tamanho',
  responsaveis: 'Responsáveis',
  dueAt: 'Prazo',
  clientId: 'Cliente vinculado',
  bloqueado: 'Bloqueada',
  frenteId: 'Frente',
  iniciativaId: 'Iniciativa vinculada',
};

interface HistoricoTabProps {
  tarefaId: string;
}

/** Log de auditoria só-leitura — populado pelo backend como efeito colateral
 *  de `atualizarAgilTarefa` (server/dominio/agilHistorico.cjs), nunca escrito
 *  daqui. `colunaId`/`clientId`/`frenteId`/`iniciativaId` mostram o id cru
 *  (sem lookup de nome) — aceito por simplicidade: o valor já diz que mudou. */
export function HistoricoTab({ tarefaId }: HistoricoTabProps) {
  const { agilHistorico, agilColunas } = useCarteira();

  const itens = agilHistorico
    .filter((h) => h.tarefaId === tarefaId)
    .sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());

  function rotulo(campo: string, valor: string): string {
    if (campo === 'colunaId') return agilColunas.find((c) => c.id === valor)?.titulo ?? (valor || '—');
    if (campo === 'bloqueado') return valor === 'true' ? 'Sim' : 'Não';
    return valor || '—';
  }

  if (itens.length === 0) {
    return <p className="text-[0.82rem] text-text-muted">Nenhuma mudança registrada ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {itens.map((h) => (
        <div key={h.id} className="flex items-start gap-2 text-[0.78rem] text-text-secondary">
          <History size={12} className="shrink-0 mt-0.5 text-text-muted" />
          <span className="flex-1 min-w-0">
            <strong className="text-text-primary">{CAMPO_LABEL[h.campo] ?? h.campo}</strong>
            {': '}
            {rotulo(h.campo, h.valorAntigo)} <span className="text-text-muted">→</span> {rotulo(h.campo, h.valorNovo)}
          </span>
          <span className="shrink-0 text-text-muted">{format(parseISO(h.createdAt), 'dd/MM HH:mm')}</span>
        </div>
      ))}
    </div>
  );
}
