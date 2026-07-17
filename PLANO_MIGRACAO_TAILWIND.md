# Plano de Migração para Tailwind CSS

Documento de trabalho para concluir a migração do CSS semântico (`src/index.css`)
para utilities do Tailwind, **sem regressão visual**. Marque os itens conforme
forem concluídos.

## Objetivo

Reescrever os componentes/páginas usando utilities do Tailwind, removendo o CSS
específico correspondente do `index.css`, mantendo o visual **idêntico**
(preto/branco/dourado) e os efeitos de hover.

## Setup atual (já pronto)

- **Tailwind v4** + `@tailwindcss/vite` (ver [vite.config.ts](vite.config.ts)).
- **Config separada**: [tailwind.config.js](tailwind.config.js) — carregada via
  `@config` no topo de [src/index.css](src/index.css). Tokens da marca mapeados
  para as CSS vars do `:root`.
- **Import das utilities SEM cascade layer** (decisão importante — ver regra de ouro).

### Tokens disponíveis (usar em vez de valores crus)

| Utility            | Valor (`var`)            |
|--------------------|--------------------------|
| `bg-bg`            | `--bg`                   |
| `bg-card` / `bg-card-hover` | `--card` / `--card-hover` |
| `bg-sidebar`       | `--sidebar`              |
| `bg-accent` / `bg-accent-soft` / `bg-accent-hover` | `--accent` / `--accent-soft` / `--accent-hover` |
| `text-accent` / `text-accent-contrast` | `--accent` / `--accent-contrast` |
| `text-text-primary` / `text-text-secondary` / `text-text-muted` | idem |
| `text-success` / `text-warning` / `text-danger` | idem |
| `border-border` / `border-border-strong` | `--border` / `--border-strong` |
| `shadow-sm` / `shadow-md` / `shadow-lg` | `--shadow-*` |
| `rounded` / `rounded-sm` | `--radius` / `--radius-sm` |

Valores fora da tabela: usar arbitrary com a var, ex. `px-[0.85rem]`,
`text-[0.68rem]`, `tracking-[0.04em]`, `text-[color:var(--text-muted)]`.

## Regra de ouro (cascade / layering) ⚠️

O `index.css` (reset `*` e classes semânticas) é **sem cascade layer**. As
utilities foram importadas **sem layer** de propósito:

- Utilities **vencem** o reset `*` por especificidade (0,1,0 > 0,0,0) → `mt-auto`,
  `p-*`, `m-*` funcionam.
- Utilities **perdem** para as classes semânticas definidas depois no arquivo
  (mesma especificidade, ganha ordem) → o que ainda não migrou continua igual.

**Consequência prática:** ao migrar um componente, **não reaproveite** a classe
semântica junto de utility que conflita (ex.: `class="btn px-2"` — o `.btn` vence).
Escreva utilities **completas** (replicando a base) OU migre a classe inteira.

## Método por componente (checklist de cada migração)

1. Ler o `.tsx` e as regras do `.css` que ele usa.
2. Reescrever o markup com utilities (tokens acima), inclusive convertendo os
   `style={{...}}` inline.
3. Estados: `hover:` / `focus:`; ativo via classe condicional; pseudo-elementos
   (`::before`) viram elemento condicional (ex.: barra do item ativo da Sidebar).
4. Remover do `index.css` as regras que ficaram órfãs (deixar um comentário curto).
5. `npm run build` (tsc + vite) sem erro.
6. Screenshot headless (Playwright) comparando com o original — **zero erro de
   console** e paridade visual. Restaurar dados de teste se criar algum.
7. Commit por componente/lote e push.

## Status

### Concluído ✅
- [x] Setup Tailwind v4 + `@config` + tokens + fix de layering
- [x] Hover nítido global (cards, KPIs, linhas, badges, sidebar, labels)
- [x] `StatCard`
- [x] `LoadingScreen`
- [x] `Sidebar`

### Componentes / páginas restantes

Ordem sugerida (leaf → composto):

- [ ] `DonutChart` (SVG + legenda `donut-*`)
- [ ] `LineChart` (SVG + eixos)
- [ ] `ReminderPopup` (toast `reminder-toast`)
- [ ] `GlobalSearch` (overlay + `search-*`)
- [ ] `ClientFormModal` (form + `check-row`)
- [ ] `EventFormModal` (form + anexos + `chip-select`/`attachment-chip`)
- [ ] `AcaoFormModal` (form + `chip-select`)
- [ ] `ReminderFormModal` (form)
- [ ] `DashboardPage` (`stat-grid`, `dash-two-col`, `section`, `chip-row`,
      `agenda-preview`/`agenda-row`, `svc-bars`)
- [ ] `ClientesPage` (`clientes-toolbar`/`clientes-search`, tabela)
- [ ] `AgendaPage` (`calendar-*`, `agenda-board`, chips, legenda)
- [ ] `AcoesPage` (`tabs`, `data-table`, `acao-*`)
- [ ] `ClienteDetailPage` (`two-col-grid`, badges, histórico)
- [ ] `ConfiguracoesPage` (`field`, listas, `chip-toggle`)

### Primitivos compartilhados (fase final)

Usados em quase tudo. Duas opções — **decidir antes de migrar**:

- **(Recomendado)** Manter como classes (`.btn`, `.badge`, `.glass-card`,
  `.field`, `.modal`, `.custom-select`) — é o padrão de design system em Tailwind
  e evita duplicação massiva de utilities no markup.
- **(Full utilities)** Converter também, criando helpers de string de classe
  (ex.: `const BTN = '...'`) reutilizados nos componentes. Mais churn, sem ganho
  visual.

- [ ] `btn` / variantes
- [ ] `badge` / variantes
- [ ] `glass-card` / `glass-card-flat` / `interactive-card`
- [ ] `field` / `field-input` / `custom-select` / `check-row`
- [ ] `modal` / `modal-*`
- [ ] Reset e tokens `:root` (manter — base do tema)

## Pontos de atenção (risco de regressão)

- **Pseudo-elementos** (`::before`/`::after`): barra do item ativo, ponto do chip,
  seta do `custom-select` → recriar com elemento/utility equivalente.
- **`color-mix(...)`** nos chips da Agenda e tints → manter via arbitrary
  `bg-[color-mix(in_srgb,var(--success)_14%,var(--card))]` ou classe utilitária.
- **`custom-select`**: a seta é background-image; ao migrar, preservar.
- **Datas / grids** do calendário: `grid-cols-7`, `auto-rows`, `min-h` exatos.
- **Hover global**: os efeitos de `.glass-card:hover`, `.agenda-row:hover` etc.
  hoje vêm do `index.css`; ao migrar o markup, garantir que continuem (via
  `hover:` nas utilities ou mantendo as regras de hover no CSS).

## Verificação final (quando tudo migrar)

- `npm run build` limpo.
- Varredura visual de todas as telas (Playwright) sem erro de console.
- `index.css` reduzido a: `@config` + imports Tailwind + `:root` (tokens) +
  reset mínimo + regras de hover globais (se mantidas).
- Sem `.xlsx`/`.env`/`uploads/` no commit.
