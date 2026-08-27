import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Menu } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { Button } from './ui';
import { usePersistedState } from './hooks/usePersistedState';
import { GlobalSearch } from './components/GlobalSearch';
import { ReminderFormModal } from './components/ReminderFormModal';
import { RegistroContatoModal } from './components/RegistroContatoModal';
import { ImportarResumoModal } from './components/ImportarResumoModal';
import { ReminderPopup } from './components/ReminderPopup';
import { BaseSincronizadaCard } from './components/dashboard/BaseSincronizadaCard';
import { ReunioesHojeCard } from './components/ReunioesHojeCard';
import { ToastHost } from './components/ToastHost';
import { ConfirmHost } from './components/ConfirmHost';
import { LoadingScreen } from './components/LoadingScreen';
import { useCarteira } from './context/CarteiraContext';
// Imports estáticos (sem lazy): num app de LAN que é rebuildado com frequência,
// o code-splitting causava tela branca quando a aba tinha um index.html antigo
// apontando pra chunks que já não existiam. Bundle único é robusto e rápido na LAN.
import DashboardPage from './pages/DashboardPage';
import ClientesPage from './pages/ClientesPage';
import ClienteDetailPage from './pages/ClienteDetailPage';
import AgendaPage from './pages/AgendaPage';
import AcoesPage from './pages/AcoesPage';
import AgilPage from './pages/AgilPage';
import ContatosPage from './pages/ContatosPage';
import RelatoriosPage from './pages/RelatoriosPage';
import AssistenteIAPage from './pages/AssistenteIAPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';

function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [importarResumoOpen, setImportarResumoOpen] = useState(false);
  const [registroContatoOpen, setRegistroContatoOpen] = useState(false);
  const [collapsed, setCollapsed] = usePersistedState('sidebar:collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Fecha o drawer ao trocar de rota (mobile) — ajuste de estado durante o
  // render (padrão recomendado pelo React) em vez de useEffect+setState.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setMobileOpen(false); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNewEvent = useCallback((initialType?: string) => {
    navigate('/agenda', { state: { openNewEvent: true, initialType } });
  }, [navigate]);

  return (
    <div className="app-shell" data-collapsed={collapsed}>
      <Sidebar
        onOpenSearch={() => setSearchOpen(true)}
        onNewEvent={handleNewEvent}
        onNewReminder={() => setReminderModalOpen(true)}
        onImportarResumo={() => setImportarResumoOpen(true)}
        onRegistrarContatoCliente={() => setRegistroContatoOpen(true)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={`sidebar-backdrop${mobileOpen ? ' is-open' : ''}`} onClick={() => setMobileOpen(false)} />
      <main className="main-content">
        <div className="flex items-center gap-2 px-6 pt-4 -mb-2">
          <button className="sidebar-hamburger" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu size={22} />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <BaseSincronizadaCard />
            <ReunioesHojeCard />
            <Button
              variant={location.pathname === '/agenda' ? 'secondary' : 'primary'}
              onClick={() => navigate('/agenda')}
              aria-current={location.pathname === '/agenda' ? 'page' : undefined}
              style={{ fontSize: '1rem', padding: '0.7rem 1.5rem', fontWeight: 600, boxShadow: location.pathname === '/agenda' ? 'none' : 'var(--shadow-md)' }}
              title={location.pathname === '/agenda' ? 'Você está na Agenda' : 'Ir para a Agenda'}
            >
              <CalendarDays size={19} /> Agenda
            </Button>
            <ThemeToggle />
          </div>
        </div>
        {/* key por rota = re-dispara o fade ao trocar de página */}
        <div key={location.pathname} className="page-transition">{children}</div>
      </main>
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {reminderModalOpen && <ReminderFormModal onClose={() => setReminderModalOpen(false)} />}
      {importarResumoOpen && <ImportarResumoModal onClose={() => setImportarResumoOpen(false)} />}
      {registroContatoOpen && <RegistroContatoModal onClose={() => setRegistroContatoOpen(false)} />}
      <ReminderPopup />
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}

function AppRoutes() {
  const { loading, error } = useCarteira();

  if (loading) return <LoadingScreen />;

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12, textAlign: 'center', padding: '0 1rem' }}>
        <span style={{ color: 'var(--danger)' }}>Não foi possível conectar à API local.</span>
        <span className="text-text-muted" style={{ fontSize: 13 }}>{error}</span>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/:id" element={<ClienteDetailPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/acoes" element={<AcoesPage />} />
        <Route path="/agil" element={<AgilPage />} />
        <Route path="/contatos" element={<ContatosPage />} />
        <Route path="/relatorios" element={<RelatoriosPage />} />
        <Route path="/assistente" element={<AssistenteIAPage />} />
        <Route path="/config" element={<ConfiguracoesPage />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
