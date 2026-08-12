import { NavLink } from 'react-router-dom';
import { Bell, CalendarDays, CalendarPlus, ChevronRight, Contact, FileDown, FileSpreadsheet, LayoutDashboard, MessageSquare, PanelLeftClose, PhoneIncoming, Search, Settings, Target, TrendingUp, Users, X } from 'lucide-react';
import prismaLogo from '../assets/prisma-logo.png';
import priceLogo from '../assets/price-logo.svg';

interface SidebarProps {
  onOpenSearch: () => void;
  /** `initialType` pré-seleciona o Tipo no EventFormModal (ex.: "Relatório"/"Contato"). */
  onNewEvent: (initialType?: string) => void;
  onNewReminder: () => void;
  onImportarResumo: () => void;
  /** Registro rápido de contato recebido do cliente (origem = cliente). */
  onRegistrarContatoCliente: () => void;
  /** Colapsado = modo só-ícone (desktop). */
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Drawer aberto (mobile). */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS = [
  { to: '/', label: 'Visão Geral', icon: LayoutDashboard, end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, end: false },
  { to: '/clientes', label: 'Carteira', icon: Users, end: false },
  { to: '/contatos', label: 'Contatos', icon: Contact, end: false },
  { to: '/acoes', label: 'Ações', icon: Target, end: false },
  { to: '/relatorios', label: 'Relatórios', icon: FileSpreadsheet, end: false },
];

const SECTION_LABEL = 'sidebar-section-label text-[0.68rem] uppercase tracking-[0.05em] text-text-muted font-semibold px-[0.7rem] py-[0.4rem]';
const LINK_BASE = 'sidebar-link flex items-center gap-[0.65rem] px-[0.7rem] py-[0.55rem] rounded-sm text-[0.875rem] font-medium no-underline relative transition-all duration-150';
const ACTION_BTN = 'sidebar-action inline-flex items-center justify-start gap-[0.4rem] w-full rounded-sm px-[0.7rem] py-[0.55rem] text-[0.82rem] font-medium text-text-secondary bg-transparent border-none cursor-pointer whitespace-nowrap transition-all duration-150 hover:bg-bg hover:text-text-primary';
const QUICK_BTN = 'sidebar-action sidebar-quick-btn flex flex-col items-center justify-center gap-[0.3rem] rounded-sm py-[0.6rem] px-[0.4rem] text-[0.74rem] font-medium text-text-secondary bg-transparent border border-border cursor-pointer transition-all duration-150 hover:bg-bg hover:text-text-primary hover:border-accent';

function linkClass(isActive: boolean): string {
  return isActive
    ? `${LINK_BASE} bg-accent-soft text-accent font-semibold`
    : `${LINK_BASE} text-text-secondary hover:bg-card-hover hover:text-accent hover:translate-x-1`;
}

export function Sidebar({ onOpenSearch, onNewEvent, onNewReminder, onImportarResumo, onRegistrarContatoCliente, collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  // No mobile (drawer), clicar num link fecha o menu.
  const closeIfMobile = () => onCloseMobile();

  return (
    <aside className={`sidebar sticky top-0 h-screen flex flex-col py-5 px-[0.85rem] bg-sidebar border-r border-border${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' is-open' : ''}`}>
      <div className="flex items-center gap-[0.65rem] px-2 py-[0.4rem] mb-6">
        <span className="w-8 h-8 shrink-0 flex items-center justify-center bg-accent text-accent-contrast rounded-sm">
          <TrendingUp size={17} />
        </span>
        <div className="sidebar-brand-text min-w-0">
          <div className="font-semibold text-[0.95rem] leading-[1.1] text-text-primary truncate">2D Consultores</div>
          <div className="text-[0.68rem] text-text-muted uppercase tracking-[0.04em] mt-0.5">Carteira de Monitoria</div>
        </div>
        {/* Recolher (desktop) */}
        <button
          className="sidebar-collapse-btn ml-auto shrink-0 flex items-center justify-center w-7 h-7 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary transition-colors"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight size={16} /> : <PanelLeftClose size={16} />}
        </button>
        {/* Fechar (mobile) */}
        <button
          className="sidebar-close-btn ml-auto shrink-0 flex items-center justify-center w-8 h-8 rounded-sm text-text-secondary bg-transparent border-none cursor-pointer hover:bg-card-hover transition-colors"
          onClick={onCloseMobile}
          aria-label="Fechar menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 mb-5">
        <span className={SECTION_LABEL}>Menu</span>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} title={label} onClick={closeIfMobile} className={({ isActive }) => linkClass(isActive)}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-accent" />}
                <Icon size={17} className="shrink-0" />
                <span className="sidebar-label">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-[0.4rem] border-t border-border pt-[0.85rem]">
        <span className={SECTION_LABEL}>Ações rápidas</span>
        <button className={ACTION_BTN} onClick={() => { onOpenSearch(); closeIfMobile(); }} title="Buscar (Ctrl+K)">
          <Search size={16} className="shrink-0" /> <span className="sidebar-label">Buscar</span> <span className="sidebar-label ml-auto text-text-muted">Ctrl+K</span>
        </button>
        <div className="sidebar-quick-grid grid grid-cols-2 gap-[0.4rem]">
          <button className={QUICK_BTN} onClick={() => { onNewEvent(); closeIfMobile(); }} title="Novo Evento">
            <CalendarPlus size={17} className="shrink-0" /> <span className="sidebar-label">Novo Evento</span>
          </button>
          <button className={QUICK_BTN} onClick={() => { onNewEvent('Relatório'); closeIfMobile(); }} title="Criar Relatório">
            <FileSpreadsheet size={17} className="shrink-0" /> <span className="sidebar-label">Relatório</span>
          </button>
          <button className={QUICK_BTN} onClick={() => { onNewEvent('Contato'); closeIfMobile(); }} title="Criar Contato">
            <MessageSquare size={17} className="shrink-0" /> <span className="sidebar-label">Contato</span>
          </button>
          <button className={QUICK_BTN} onClick={() => { onNewReminder(); closeIfMobile(); }} title="Novo Lembrete">
            <Bell size={17} className="shrink-0" /> <span className="sidebar-label">Lembrete</span>
          </button>
          <button className={QUICK_BTN} onClick={() => { onImportarResumo(); closeIfMobile(); }} title="Importar Resumo de Reunião">
            <FileDown size={17} className="shrink-0" /> <span className="sidebar-label">Importar Resumo</span>
          </button>
          <button className={QUICK_BTN} onClick={() => { onRegistrarContatoCliente(); closeIfMobile(); }} title="Registrar que o cliente entrou em contato">
            <PhoneIncoming size={17} className="shrink-0" /> <span className="sidebar-label">Cliente procurou</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-[0.4rem] border-t border-border pt-[0.85rem]">
        <span className={SECTION_LABEL}>Sistemas</span>
        <a
          href="http://danielloureiro-2d"
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir PRISMA"
          className="sidebar-action flex items-center justify-center gap-[0.4rem] w-full h-[52px] rounded-sm px-[0.7rem] text-[0.82rem] font-semibold text-white bg-black border-none cursor-pointer no-underline transition-all duration-150 hover:bg-neutral-800"
        >
          <img src={prismaLogo} alt="" className="shrink-0" style={{ width: 18, height: 18, objectFit: 'contain' }} /> <span className="sidebar-label">PRISMA</span>
        </a>
        <a
          href="http://77.37.126.180:5005/login"
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir Price 2D"
          className="sidebar-action flex items-center justify-center w-full h-[52px] rounded-sm px-[0.7rem] bg-white border border-border cursor-pointer no-underline transition-all duration-150 hover:bg-neutral-100"
        >
          <img src={priceLogo} alt="Price 2D" className="shrink-0" style={{ height: 28, width: 'auto' }} />
        </a>
      </div>

      <nav className="flex flex-col gap-0.5 mt-auto border-t border-border pt-[0.85rem]">
        <span className={SECTION_LABEL}>Sistema</span>
        <NavLink to="/config" title="Configurações" onClick={closeIfMobile} className={({ isActive }) => linkClass(isActive)}>
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-accent" />}
              <Settings size={17} className="shrink-0" />
              <span className="sidebar-label">Configurações</span>
            </>
          )}
        </NavLink>
      </nav>

      <div className="sidebar-footer pt-[0.85rem] mt-[0.85rem] text-[0.7rem] leading-[1.5] text-text-muted border-t border-border">
        Uso interno 2D · rede local · dados no OneDrive.
      </div>
    </aside>
  );
}
