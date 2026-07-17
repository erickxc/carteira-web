/**
 * Configuração do Tailwind (arquivo separado, carregado pelo index.css via
 * `@config`). Aqui ficam o tema e os tokens da marca 2D (preto/branco/dourado).
 * As cores apontam para as CSS vars definidas em src/index.css (:root), então
 * utilities como `bg-card`, `text-accent`, `border-border`, `shadow-lg` usam
 * exatamente a mesma paleta do resto do app.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        'card-hover': 'var(--card-hover)',
        sidebar: 'var(--sidebar)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-hover': 'var(--accent-hover)',
        'accent-contrast': 'var(--accent-contrast)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
      },
    },
  },
};
