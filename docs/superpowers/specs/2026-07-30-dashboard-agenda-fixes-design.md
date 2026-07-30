# Design: ajustes de fila/carrossel/dashboard + alerta de notificação + card "Vencendo"

Data: 2026-07-30

Bateria de correções e um card novo, todos discutidos e aprovados interativamente na mesma conversa (sem mockup visual — texto + confirmação a cada decisão).

## 1. Reordenação da fila — desempate por data, não por score

Ajuste no critério de desempate adicionado antes (`buildFilaCadencia`, ver spec de Ações): dentro do bloco "mesma severidade + tem contato recente não refletido", em vez de comparar `score` (atraso de cadência), compara a **data mais recente de interação de cada cliente diretamente** — quem foi contatado há mais tempo fica primeiro, quem acabou de ser contatado vai pro fim. Fora desse bloco (sem contato recente), mantém o `score` como antes.

## 2. Carrossel "Próximas reuniões" — sempre anima

Voltar atrás numa decisão anterior: o carrossel não fica mais estático quando a lista cabe inteira na tela (isso foi percebido como "parou de mexer", indesejado). Agora sempre anima, mas a duração continua calculada pela largura real do conteúdo (não pela quantidade de itens) — mantém o piso mínimo de 18s pra nunca ficar rápido demais mesmo com pouco conteúdo.

## 3. Dashboard — alinhamento entre "Carteira no Ritmo" e "Cobertura da Carteira"

Dois problemas distintos, mesma causa raiz (linha de filtros Geral/Monitoria/Price que só existe em "Carteira no Ritmo"):

- **Desalinhado mesmo recolhido**: o donut e o botão "Ver clientes" ficavam em alturas diferentes entre os dois cards porque só um deles tem a linha de chips de filtro. Fix: `Cobertura da Carteira` ganha um spacer vazio (`.gauge-card-filtros`, mesma altura reservada) no lugar onde essa linha ficaria.
- **Larguras de coluna diferentes ao clicar "Ver clientes"**: o grid de colunas (`GaugeDetalhe`) usava `grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))`, que reflui cada card de forma independente conforme a largura — um card com 3 grupos e outro com 2 acabavam com proporções de coluna diferentes em certas larguras. Fix: número de colunas fixo por card (`repeat(${grupos.length}, 1fr)`, calculado a partir da quantidade real de grupos), sem depender de quanto cabe na largura.

## 4. Lembretes não alertam — diagnóstico + banner de permissão

Investigado ao vivo (lembrete de teste forçado): o disparo em si funciona (toast aparece na hora certa). A causa real é que o único sinal confiável depende de dois pré-requisitos invisíveis:
- Permissão de notificação nativa do navegador precisa ter sido concedida (senão só o toast pequeno aparece, sem nada fora da aba).
- Som depende de já ter havido uma interação (clique/tecla) na página desde que carregou (política de autoplay).

Como o app fica aberto o dia todo numa aba fixa (confirmado com o usuário), o fix mínimo e direto: banner fixo no topo do app (`ReminderPopup.tsx`) sempre que `Notification.permission !== 'granted'`, com texto diferente pra "nunca pedido" (botão "Ativar", chama `requestPermission()`) vs "bloqueado" (instrução pra ativar manualmente nas configs do navegador, sem botão — não dá pra re-pedir via JS depois de negado). O banner reserva o próprio espaço (classe no `<body>` + padding-top no `.app-shell`) em vez de sobrepor o cabeçalho.

## 5. Novo card "Vencendo" (Dashboard)

Card novo na fileira `.dash-gauges`, mesmo padrão visual dos outros dois (donut, chips de filtro, "Ver clientes").

- **O que mostra**: clientes com Monitoria, Precificação (Price) ou Relatório **vencendo nos próximos 7 dias** — janela própria de 7 dias, deliberadamente diferente da janela de 5 dias usada em Ações/`JANELA_VENCENDO` (que não muda).
- **Cálculo separado**, não estende `buildFilaCadencia`: hoje só clientes com Monitoria OU Price cadastrado entram nessa fila; se Relatório virasse um relógio compartilhado (todo cliente ativo ganharia um, configurado ou pelo padrão global), isso mudaria quem aparece em Vencidos/Vencendo na página Ações — efeito colateral não pedido. Por isso, nova função dedicada (mesmo *padrão* de relógio — `ultimo`/`próximo`/`atraso`/`status` —, só que calculada à parte).
- **Cadência do relógio "Relatório"**: usa a cadência configurada no cliente (`relatorioCadencia`, ver spec de cadência de relatório) quando existir; senão cai no padrão global (`cadencias.relatorio_dias`) — "calcula pela config padrão a não ser que o usuário mude manualmente".
- **Classificação "vencendo"**: usa o status *operacional* do relógio (`status`, não `statusReal`) — um cliente com evento futuro já marcado (`coberto`) não conta como "vencendo" aqui, mesmo que a cadência pura já estivesse apertada — já tem alguém cuidando.
- **Visual**: igual aos outros 2 cards — donut de 2 fatias (Vencendo em `var(--warning)` vs Resto da carteira em `var(--border-strong)`), chips Geral/Monitoria/Precificação/Relatório, "Ver clientes" expansível com 2 grupos.
- Entra na régua de altura/alinhamento já corrigida no item 3 (mesma classe `.gauge-card-filtros`/`.cobertura-card`).

### Fora de escopo

- Não muda `buildFilaCadencia`, `classificarCadencia`, nem a fila de Ações — o card é 100% aditivo, cálculo próprio.
- Não muda `JANELA_VENCENDO` (continua 5 em todo o resto do app).
