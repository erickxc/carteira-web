import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { GlobalSearch } from './components/GlobalSearch';
import { ReminderFormModal } from './components/ReminderFormModal';
import { ReminderPopup } from './components/ReminderPopup';
import { LoadingScreen } from './components/LoadingScreen';
import { useCarteira } from './context/CarteiraContext';
import DashboardPage from './pages/DashboardPage';
import ClientesPage from './pages/ClientesPage';
import ClienteDetailPage from './pages/ClienteDetailPage';
import AgendaPage from './pages/AgendaPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';

function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNewEvent = useCallback(() => {
    navigate('/agenda', { state: { openNewEvent: true } });
  }, [navigate]);

  return (
    <div className="app-shell">
      <Sidebar onOpenSearch={() => setSearchOpen(true)} onNewEvent={handleNewEvent} onNewReminder={() => setReminderModalOpen(true)} />
      <main className="main-content">{children}</main>
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {reminderModalOpen && <ReminderFormModal onClose={() => setReminderModalOpen(false)} />}
      <ReminderPopup />
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
        <span className="text-muted" style={{ fontSize: 13 }}>{error}</span>
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
