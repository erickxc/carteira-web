import { RefreshCw } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-[var(--bg)]">
      <RefreshCw className="animate-spin" size={40} color="var(--accent)" />
      <p className="mt-5 text-[color:var(--text-secondary)]">Carregando dados...</p>
    </div>
  );
}
