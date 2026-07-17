import { NavLink } from 'react-router-dom';
import { Bell, CalendarDays, CalendarPlus, LayoutDashboard, Search, Settings, Target, TrendingUp, Users } from 'lucide-react';

interface SidebarProps {
  onOpenSearch: () => void;
  onNewEvent: () => void;
  onNewReminder: () => void;
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users, end: false },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, end: false },
  { to: '/acoes', label: 'Ações', icon: Target, end: false },
  { to: '/config', label: 'Configurações', icon: Settings, end: false },
];

export function Sidebar({ onOpenSearch, onNewEvent, onNewReminder }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">
          <TrendingUp />
        </span>
        <div>
          <div className="sidebar-brand-name">2D Consultores</div>
          <div className="sidebar-brand-sub">Carteira de Monitoria</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}>
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-actions">
        <button className="btn" onClick={onOpenSearch}>
          <Search size={16} /> Buscar <span className="text-muted" style={{ marginLeft: 'auto' }}>Ctrl+K</span>
        </button>
        <button className="btn" onClick={onNewEvent}>
          <CalendarPlus size={16} /> Novo Evento
        </button>
        <button className="btn" onClick={onNewReminder}>
          <Bell size={16} /> Novo Lembrete
        </button>
      </div>

      <div className="sidebar-footer">Uso local — dados armazenados apenas nesta máquina.</div>
    </aside>
  );
}
