import { useMemo, useState, type KeyboardEvent } from 'react';
import { format, isValid, parse } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, Search, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';

const DATE_FORMATS = ['dd/MM/yyyy', 'dd/MM/yy', 'dd/MM'];

function tryParseDate(term: string): Date | null {
  for (const fmt of DATE_FORMATS) {
    const parsed = parse(term, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { clientes, agenda, lembretes } = useCarteira();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [queryAnterior, setQueryAnterior] = useState(query);
  const navigate = useNavigate();

  // Reseta a seleção quando a busca muda — ajuste durante o render (padrão
  // recomendado pelo React para "resetar estado quando uma prop/derivado
  // muda"), em vez de useEffect + setState.
  if (query !== queryAnterior) {
    setQueryAnterior(query);
    setSelected(0);
  }

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return { clientes: [], agenda: [], lembretes: [], date: null as Date | null };

    return {
      clientes: clientes.filter((c) => c.empresa.toLowerCase().includes(term)).slice(0, 5),
      agenda: agenda
        .filter(
          (a) =>
            a.clientName.toLowerCase().includes(term) ||
            a.subject?.toLowerCase().includes(term) ||
            a.description?.toLowerCase().includes(term)
        )
        .slice(0, 5),
      lembretes: lembretes
        .filter((r) => r.title.toLowerCase().includes(term) || r.description?.toLowerCase().includes(term))
        .slice(0, 5),
      date: tryParseDate(query.trim()),
    };
  }, [query, clientes, agenda, lembretes]);

  const hasResults = results.clientes.length > 0 || results.agenda.length > 0 || results.lembretes.length > 0 || results.date;

  function irParaAgenda(date: Date) {
    navigate('/agenda', { state: { focusDate: date.toISOString() } });
    onClose();
  }

  // Lista plana de todas as linhas ativáveis, na mesma ordem em que são
  // renderizadas — permite navegar com ↑/↓ e ativar com Enter, sem depender
  // só do mouse (o Ctrl+K é a "paleta de comandos" do app).
  const flatItems = useMemo(() => {
    const arr: { key: string; onActivate: () => void }[] = [];
    if (results.date) arr.push({ key: 'date', onActivate: () => irParaAgenda(results.date!) });
    results.clientes.forEach((c) => arr.push({ key: `c-${c.id}`, onActivate: () => { navigate(`/clientes/${c.id}`); onClose(); } }));
    results.agenda.forEach((a) => arr.push({ key: `a-${a.id}`, onActivate: () => irParaAgenda(new Date(a.date)) }));
    results.lembretes.forEach((r) => arr.push({ key: `r-${r.id}`, onActivate: () => { if (r.clientId) navigate(`/clientes/${r.clientId}`); onClose(); } }));
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  function idxOf(key: string): number {
    return flatItems.findIndex((it) => it.key === key);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(i + 1, flatItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); flatItems[selected]?.onActivate(); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass-card search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <Search size={18} className="text-muted" />
          <input
            autoFocus
            placeholder="Buscar clientes, eventos, lembretes ou datas (dd/mm/aaaa)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {!query && <div className="empty-state">Digite para buscar em toda a carteira.</div>}
        {query && !hasResults && <div className="empty-state">Nenhum resultado encontrado.</div>}

        {results.date && (
          <div className="section">
            <div className="search-section-label">Data</div>
            <button className={`list-row${selected === idxOf('date') ? ' is-selected' : ''}`} onClick={() => irParaAgenda(results.date!)}>
              <span className="flex-row"><CalendarDays size={15} /> Ir para {format(results.date, 'dd/MM/yyyy')} na agenda</span>
            </button>
          </div>
        )}

        {results.clientes.length > 0 && (
          <div className="section">
            <div className="search-section-label">Clientes</div>
            {results.clientes.map((c) => (
              <button key={c.id} className={`list-row${selected === idxOf(`c-${c.id}`) ? ' is-selected' : ''}`} onClick={() => { navigate(`/clientes/${c.id}`); onClose(); }}>
                <span className="flex-row"><Users size={15} /> {c.empresa}</span>
              </button>
            ))}
          </div>
        )}

        {results.agenda.length > 0 && (
          <div className="section">
            <div className="search-section-label">Eventos</div>
            {results.agenda.map((a) => (
              <button key={a.id} className={`list-row${selected === idxOf(`a-${a.id}`) ? ' is-selected' : ''}`} onClick={() => irParaAgenda(new Date(a.date))}>
                <span className="flex-row">
                  <CalendarDays size={15} /> {a.subject || a.type} — {a.clientName} ({format(new Date(a.date), 'dd/MM/yyyy')})
                </span>
              </button>
            ))}
          </div>
        )}

        {results.lembretes.length > 0 && (
          <div className="section">
            <div className="search-section-label">Lembretes</div>
            {results.lembretes.map((r) => (
              <button
                key={r.id}
                className={`list-row${selected === idxOf(`r-${r.id}`) ? ' is-selected' : ''}`}
                onClick={() => { if (r.clientId) navigate(`/clientes/${r.clientId}`); onClose(); }}
              >
                <span className="flex-row"><Bell size={15} /> {r.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
