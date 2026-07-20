import { NavLink } from 'react-router-dom';
import { Bell, CalendarDays, CalendarPlus, LayoutDashboard, Search, Settings, Target, TrendingUp, Users } from 'lucide-react';

interface SidebarProps {
  onOpenSearch: () => void;
  onNewEvent: () => void;
  onNewReminder: () => void;
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clientes', label: 'Carteira', icon: Users, end: false },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, end: false },
  { to: '/acoes', label: 'Ações', icon: Target, end: false },
];

const SECTION_LABEL = 'text-[0.68rem] uppercase tracking-[0.05em] text-text-muted font-semibold px-[0.7rem] py-[0.4rem]';
const LINK_BASE = 'flex items-center gap-[0.65rem] px-[0.7rem] py-[0.55rem] rounded-sm text-[0.875rem] font-medium no-underline relative transition-all duration-150';
const ACTION_BTN = 'inline-flex items-center justify-start gap-[0.4rem] w-full rounded-sm px-[0.7rem] py-[0.55rem] text-[0.82rem] font-medium text-text-secondary bg-transparent border-none cursor-pointer whitespace-nowrap transition-all duration-150 hover:bg-bg hover:text-text-primary';

function linkClass(isActive: boolean): string {
  return isActive
    ? `${LINK_BASE} bg-accent-soft text-accent font-semibold`
    : `${LINK_BASE} text-text-secondary hover:bg-card-hover hover:text-accent hover:translate-x-1`;
}

export function Sidebar({ onOpenSearch, onNewEvent, onNewReminder }: SidebarProps) {
  return (
    <aside className="sticky top-0 h-screen flex flex-col py-5 px-[0.85rem] bg-sidebar border-r border-border">
      <div className="flex items-center gap-[0.65rem] px-2 py-[0.4rem] mb-6">
        <span className="w-8 h-8 shrink-0 flex items-center justify-center bg-accent text-accent-contrast rounded-sm">
          <TrendingUp size={17} />
        </span>
        <div>
          <div className="font-semibold text-[0.95rem] leading-[1.1] text-text-primary">2D Consultores</div>
          <div className="text-[0.68rem] text-text-muted uppercase tracking-[0.04em] mt-0.5">Carteira de Monitoria</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 mb-5">
        <span className={SECTION_LABEL}>Menu</span>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => linkClass(isActive)}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-accent" />}
                <Icon size={17} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border pt-[0.85rem]">
        <span className={SECTION_LABEL}>Ações rápidas</span>
        <button className={ACTION_BTN} onClick={onOpenSearch}>
          <Search size={16} /> Buscar <span className="ml-auto text-text-muted">Ctrl+K</span>
        </button>
        <button className={ACTION_BTN} onClick={onNewEvent}>
          <CalendarPlus size={16} /> Novo Evento
        </button>
        <button className={ACTION_BTN} onClick={onNewReminder}>
          <Bell size={16} /> Novo Lembrete
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 mt-auto border-t border-border pt-[0.85rem]">
        <span className={SECTION_LABEL}>Sistema</span>
        <NavLink to="/config" className={({ isActive }) => linkClass(isActive)}>
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-accent" />}
              <Settings size={17} />
              Configurações
            </>
          )}
        </NavLink>
      </nav>

      <div className="pt-[0.85rem] mt-[0.85rem] text-[0.7rem] leading-[1.5] text-text-muted border-t border-border">
        Uso local — dados armazenados apenas nesta máquina.
      </div>
    </aside>
  );
}
