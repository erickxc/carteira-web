# Motion — Etapa 1: base de movimento + transições de tela

Data: 2026-09-23
Status: aprovado em conversa, aguardando revisão do spec escrito

## Contexto

Pedido: deixar o frontend da CARTEIRA 2D com movimento "presente mas contido"
(dá pra notar, com um ou dois momentos de destaque), cobrindo seis áreas. Foi
fatiado em 4 etapas, cada uma com spec, entrega e validação próprias:

1. **Base de movimento + transições de tela** (este documento)
2. Dashboard como momento de destaque (contagem, gráfico se desenhando, cascata)
3. Listas, cards e feedback de ação (entrada/saída, reordenação, toasts,
   transição compartilhada linha → ficha do cliente)
4. Kanban do Ágil (dnd-kit + Motion) e hover/foco

Estado atual: animação 100% CSS (11 `@keyframes` em `src/index.css`), sem
biblioteca. Troca de página só tem entrada (`@keyframes page-enter`, 0,22s,
`App.tsx` com `key={location.pathname}`).

Decisões já tomadas:

- Biblioteca **Motion** (`motion`, import `motion/react`) liberada pelo usuário.
- **Abordagem A**: Motion só onde CSS não resolve bem. Hover, foco e fades
  simples continuam em CSS.

## Regras que valem para todas as etapas

- Hover **nunca** desloca nem escala a própria caixa: já causou tremor perto
  da borda (ver comentários em `src/ui/Card.tsx` e `src/ui/Badge.tsx`).
- Com `prefers-reduced-motion: reduce`, deslocamento e escala somem e o fade
  continua. Exceções já decididas e mantidas: o ticker "Próximas reuniões"
  (pedido explícito do usuário, comentado no CSS) e o spinner do assistente.
- Nenhuma animação acima de 400ms em ação repetida do dia a dia.

## Parte 1 — Base

### `src/motion/tokens.ts`

Fonte única de tempo e curva:

| Token      | Duração | Uso                                          |
|------------|---------|----------------------------------------------|
| `rapido`   | 150ms   | hover, foco, toggles                         |
| `medio`    | 250ms   | troca de tela, modal, item entrando em lista |
| `destaque` | 400ms   | só momentos especiais (Dashboard ao abrir)   |

Curvas:

- `saida`: easeOut `[0.16, 1, 0.3, 1]`, para elementos entrando.
- `mola`: spring sem quique (`bounce: 0`), para reposicionamento.

As mesmas durações viram variáveis CSS em `:root` (`--motion-rapido`,
`--motion-medio`, `--motion-destaque`), para CSS e Motion andarem no mesmo
ritmo. Esta etapa só **cria** as variáveis. Migrar as transições CSS
existentes para elas fica para a etapa 4 (hover/foco), onde isso é revisado
de qualquer forma.

### Movimento reduzido centralizado

O app inteiro fica envolvido por `<MotionConfig reducedMotion="user">` em
`src/main.tsx` (ou no componente raiz, conforme a estrutura atual). A Motion
passa a respeitar a preferência do sistema sem checagem manual em cada
componente.

### Dependência

`npm install motion`. Dependência só de frontend, que já vai compilada dentro
do `dist/`. **Não** entra em `DEPS_SERVIDOR` (`server/scripts/publicarRelease.cjs`),
e `verificarDepsDoServidor()` não deve ser afetado, porque nenhum `.cjs` do
servidor importa `motion`.

## Parte 2 — Transição entre telas

### Comportamento

- Tela atual sai: opacidade 1 → 0 e sobe 4px, ~120ms.
- Tela nova entra: opacidade 0 → 1 e sobe 8px até a posição final, `medio` (250ms), curva `saida`.
- Sequencial (`AnimatePresence mode="wait"`): a nova só entra depois que a antiga saiu.

### Direção conforme a navegação

`tipoTransicao(anterior: string, nova: string): 'entrar' | 'voltar' | 'lateral'`,
função pura em `src/motion/tipoTransicao.ts`:

- `entrar`: a rota nova é "filha" da anterior (ex.: `/clientes` →
  `/clientes/:id`). A tela nova vem da direita (12px).
- `voltar`: o inverso (`/clientes/:id` → `/clientes`). Vem da esquerda (12px).
- `lateral`: qualquer outro caso (páginas da sidebar entre si). Só o
  fade com subida, sem deslocamento horizontal.

Regra de "filha": a rota nova começa com a rota anterior seguida de `/`
(comparação por segmento, não por prefixo de texto, para `/clientes` não
virar pai de `/clientes-x`). A rota raiz `/` (Dashboard) nunca é pai.

Detalhe: a direção precisa ser conhecida pelo elemento que está **saindo**
também. Por isso vai via `custom` do `AnimatePresence`, não por prop do filho.

### Movimento reduzido

Todas as direções viram só fade (sem `x`/`y`). É garantido pelo
`MotionConfig`, sem ramificação no componente.

### Onde muda

- `src/App.tsx`: o `<div key={location.pathname} className="page-transition">`
  vira `<AnimatePresence mode="wait" custom={direcao}>` +
  `<motion.div key={location.pathname} ...>`. A rota anterior é guardada num
  `useRef` para calcular a direção.
- `src/index.css`: sai `.page-transition` e `@keyframes page-enter`
  (substituídos). O `@media (prefers-reduced-motion)` correspondente também sai.

### Cuidados

- **`position: fixed` sob ancestral com transform**: já quebrou modal antes
  (comentário em `src/components/ModalShell.tsx`). Modais usam portal para o
  `<body>` e não são afetados. A Motion remove o `transform` ao chegar no
  estado final (valores identidade), então nada fica preso depois da
  animação. **Verificar durante a implementação:** todo popover/dropdown
  aberto logo após trocar de tela (`Dropdown.tsx`, `ClienteCombobox.tsx`,
  `AcessosExternosButton.tsx`, popovers da tabela de Clientes). Todos já usam
  portal hoje, mas confirmar.
- **Rolagem**: resetar para o topo no `onExitComplete` do `AnimatePresence`
  (entre a saída e a entrada), para não ver a página pulando. Confirmar antes
  onde a rolagem acontece hoje (janela ou `<main>`).
- **`location.state`** (foco de data na Agenda, "Voltar pra Ações", busca
  global): continua funcionando. A chave segue sendo `pathname`, e o efeito
  da `AgendaPage` já depende de `location.key`.
- **Navegação rápida em sequência** (dois cliques antes da saída terminar):
  `mode="wait"` enfileira. Confirmar que não fica tela em branco nem
  animação dupla.

## Fora do escopo desta etapa

- Transição compartilhada linha da tabela → ficha do cliente (etapa 3).
- Qualquer animação dentro das páginas (Dashboard, listas, Kanban): etapas 2 a 4.
- Migrar transições CSS existentes para as variáveis novas (etapa 4).

## Testes

- **Unitário** (`src/motion/tipoTransicao.test.ts`, vitest, ambiente node):
  - `/clientes` → `/clientes/abc` = `entrar`
  - `/clientes/abc` → `/clientes` = `voltar`
  - `/clientes` → `/agenda` = `lateral`
  - `/` → `/clientes` = `lateral` (raiz não é pai)
  - `/clientes` → `/clientes-x` = `lateral` (prefixo de texto não conta)
  - mesma rota = `lateral`
- **Gates**: `npm run build` e `npm test` verdes.
- **Manual no navegador** (checklist entregue junto da implementação):
  - Trocar páginas pela sidebar: fade com subida, sem lado.
  - Clientes → ficha: vem da direita. Voltar: vem da esquerda.
  - Ctrl+clique em nome de cliente continua abrindo aba nova.
  - Abrir modal logo após trocar de tela: posição correta.
  - Dropdowns e popovers logo após trocar de tela: posição correta.
  - Clicar duas páginas em sequência rápida: sem tela em branco.
  - Com "reduzir movimento" do Windows ligado: só fade.
