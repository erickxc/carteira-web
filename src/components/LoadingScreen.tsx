import { RefreshCw } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
      <RefreshCw className="animate-spin" size={40} color="var(--accent)" />
      <p style={{ marginTop: '1.25rem', color: 'var(--text-secondary)' }}>Carregando dados...</p>
    </div>
  );
}
