import { useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { Button, Select, Textarea } from '../../ui';

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

interface ComentariosTabProps {
  tarefaId: string;
}

export function ComentariosTab({ tarefaId }: ComentariosTabProps) {
  const { agilComentarios, criarAgilComentario, removerAgilComentario, opcoesPorTipo } = useCarteira();
  const monitorOpcoes = opcoesPorTipo('monitor');
  const [autor, setAutor] = useState(monitorOpcoes[0] ?? '');
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);

  const comentarios = agilComentarios
    .filter((c) => c.tarefaId === tarefaId)
    .sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim() || !autor) return;
    setSaving(true);
    try {
      await criarAgilComentario({ tarefaId, autor, texto: texto.trim() });
      setTexto('');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao adicionar comentário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <Select tone="modal" value={autor} onChange={(e) => setAutor(e.target.value)} style={{ maxWidth: 220 }}>
          {monitorOpcoes.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Textarea tone="modal" placeholder="Escreva um comentário..." value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={saving || !texto.trim()} style={{ alignSelf: 'flex-start' }}>
          Comentar
        </Button>
      </form>

      {comentarios.length === 0 ? (
        <p className="text-[0.82rem] text-text-muted">Nenhum comentário ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {comentarios.map((c) => (
            <div key={c.id} className="group flex gap-2.5 p-3 rounded bg-bg border border-border transition-colors hover:border-border-strong">
              <span
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-accent-soft text-[color:var(--accent-fg)] text-[0.66rem] font-bold leading-none ring-1 ring-border"
                title={c.autor}
              >
                {iniciais(c.autor)}
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[0.8rem] font-semibold text-text-primary">{c.autor}</span>
                  <span className="text-[0.7rem] text-text-muted">{format(parseISO(c.createdAt), 'dd/MM/yyyy HH:mm')}</span>
                  <button
                    type="button"
                    onClick={() => removerAgilComentario(c.id)}
                    className="ml-auto flex items-center justify-center w-5 h-5 rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-[opacity,background-color,color] hover:bg-danger hover:text-white"
                    title="Remover"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="text-[0.85rem] text-text-primary whitespace-pre-wrap break-words">{c.texto}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
