import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const seg = (ativo: boolean) =>
  `inline-flex items-center justify-center w-[33px] h-[33px] rounded-full cursor-pointer border-none transition-all duration-150 ${
    ativo
      ? 'bg-accent text-accent-contrast shadow-sm'
      : 'bg-transparent text-text-muted hover:text-text-primary'
  }`;

/** Seletor claro/escuro — só os ícones sol/lua (pedido do usuário: sem os
 *  rótulos "Claro"/"Escuro", que só repetiam o que o ícone já diz). O nome
 *  continua acessível por `title`/`aria-label`. */
export function ThemeToggle() {
  const { tema, setTema } = useTheme();
  return (
    <div
      // h-[43px]: mesma altura do botão Agenda e do indicador de base, para os
      // três ficarem alinhados na barra.
      className="inline-flex h-[43px] items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm"
      role="group"
      aria-label="Tema"
    >
      <button
        className={seg(tema === 'claro')}
        onClick={() => setTema('claro')}
        aria-pressed={tema === 'claro'}
        aria-label="Tema claro"
        title="Tema claro"
      >
        <Sun size={16} strokeWidth={2.4} />
      </button>
      <button
        className={seg(tema === 'escuro')}
        onClick={() => setTema('escuro')}
        aria-pressed={tema === 'escuro'}
        aria-label="Tema escuro"
        title="Tema escuro"
      >
        <Moon size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
