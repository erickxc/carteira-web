import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const seg = (ativo: boolean) =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.8rem] font-semibold cursor-pointer border-none transition-all duration-150 ${
    ativo
      ? 'bg-accent text-accent-contrast shadow-sm'
      : 'bg-transparent text-text-muted hover:text-text-primary'
  }`;

/** Seletor claro/escuro — pílula segmentada, com o modo ativo em destaque nítido. */
export function ThemeToggle() {
  const { tema, setTema } = useTheme();
  return (
    <div
      // h-[43px]: mesma altura do botão Agenda e do indicador de base, para os
      // três ficarem alinhados na barra (o toggle tinha 37px e sobrava um degrau).
      className="inline-flex h-[43px] items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm"
      role="group"
      aria-label="Tema"
    >
      <button className={seg(tema === 'claro')} onClick={() => setTema('claro')} aria-pressed={tema === 'claro'} title="Tema claro">
        <Sun size={15} strokeWidth={2.4} /> Claro
      </button>
      <button className={seg(tema === 'escuro')} onClick={() => setTema('escuro')} aria-pressed={tema === 'escuro'} title="Tema escuro">
        <Moon size={15} strokeWidth={2.4} /> Escuro
      </button>
    </div>
  );
}
