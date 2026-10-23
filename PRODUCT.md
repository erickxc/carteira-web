# Product — CARTEIRA 2D

> Documento estratégico para o vídeo de apresentação (lido pela skill `/brag`).
> Idioma do vídeo: **português do Brasil**.

## Register

brand

## O que é (uma frase)

A CARTEIRA 2D é a ferramenta de **monitoramento e acompanhamento da carteira de clientes da 2D Consultores**: mostra, num painel só, quem está em dia, quem está atrasado e o que fazer agora, e tem um assistente de IA, o **monitorIA**, que responde sobre a carteira em linguagem natural e age sobre ela.

## Users

- **Monitores da 2D** (quem atende as lojas de autopeças no dia a dia): abrem a Carteira de manhã para saber quem atender, marcam reuniões, registram contatos e geram a ata.
- **Gestão da 2D**: acompanha se a carteira está no ritmo, onde o time está sobrecarregado e quem está cancelando reunião.

A pergunta que o produto responde, todo dia: **"quem precisa de mim hoje, e por quê?"**

## Product Purpose

A 2D atende lojas de autopeças com dois serviços que têm prazo: **Monitoria** (a cada 30 dias) e **Precificação/Price** (a cada 15 dias). Antes, esse acompanhamento vivia em planilha e memória: ninguém via, de uma vez, qual cliente estava ficando para trás.

A Carteira transforma cada entrega (reunião, relatório, precificação) num **relógio de prazo por serviço** e mostra a carteira inteira contra esses relógios. Sucesso = nenhum cliente esquecido, e o monitor sabendo exatamente o próximo passo.

## Proposta de valor (o que o vídeo precisa fazer sentir)

1. **Clareza em segundos.** Um painel responde "estamos no ritmo?" com números explicáveis ("16 de 37 em dia") e cor semântica.
2. **Da análise à ação.** Todo número abre a lista de quem está ali, com o motivo ("Monitoria 3d atrasada"), e a lista leva direto ao cliente.
3. **Uma IA que conhece a carteira.** O monitorIA não é um chat genérico: consulta os dados reais, explica o porquê e pode marcar reunião, registrar ação e redigir a ata.

## Brand Personality

Sério, preciso, confiável, com acabamento premium. Três palavras: **claro, exato, próximo**. O humor, se existir, é leve e vem do alívio ("ninguém mais esquecido"), nunca de piada com cliente.

**Tom recomendado:** `polished` (com toques de `app-store` nos destaques de funcionalidade).

## Identidade visual

- **Logo:** 2D Consultores, ícone de seta ascendente. Arte-fonte: `public/favicon.svg` (derivada de `src/assets/logo-2d.svg`); ícones rasterizados em `public/icon-192.png` e `public/icon-512.png`.
- **Ícone do monitorIA:** `public/icon-notificacao-bot.svg` (e `.png`).
- **Paleta (tema escuro, o padrão do app):**
  - fundo `#0b0b0d`
  - destaque/dourado `#dabb6c` (tema claro: `#6b5518`)
  - cores semânticas só com significado: verde = no prazo, amarelo = vence logo, vermelho = atrasado/cancelado
- **Tipografia:** Inter.
- **Ícones de interface:** lucide-react (os mesmos da barra lateral: Visão Geral, Agenda, Carteira, Contatos, Ações, Ágil, monitorIA).
- **Elementos reconhecíveis do produto:** cards com número grande "X de Y", barras de progresso, legendas clicáveis com popup, seletor em pílula com indicador deslizante, calendário "Entregas por dia", chat do monitorIA com resposta formatada.
- **Sistemas vizinhos citáveis (logos em `src/assets/`):** Prisma, 2D Price, Apura, Power BI. Aparecem como atalhos na barra lateral; não são o foco.

## Usos para mostrar no vídeo (pelo menos 3)

### Uso 1 — "Estamos no ritmo?" (Visão Geral)

O monitor abre a **Visão Geral** e em segundos vê:
- **Atendimentos no Ritmo:** "16 de 37 em dia", com barra e comparação com o mês anterior.
- **Cobertura por Serviço:** Monitoria "17 de 30", Price "8 de 18".
- Passa o mouse em **"sem nada 13"** e o popup lista cada atendimento com o prazo de cada serviço ("Monitoria 3d atrasada", "vence em 13d") e há quanto tempo foi a última entrega, com a cor ficando mais clara conforme a entrega fica antiga.

Momento-chave: o número vira lista, e a lista vira ação (clicar no nome abre o cliente).

### Uso 2 — "O que eu faço agora?" (A fazer + Agenda)

- **A fazer:** abas "Sem acompanhamento / Próximas agendas", com o fundo deslizando entre elas.
- **Vencendo / Vencidos:** quem vence nos próximos 5 dias e quem venceu nos últimos 15 sem nada marcado.
- **Entregas por dia:** calendário do mês com a carga de cada dia, as canceladas em vermelho no canto e a projeção com o que já está agendado.
- Do card, um clique marca a reunião na **Agenda** (serviço obrigatório, sugerido automaticamente).

Momento-chave: o atraso vira uma reunião marcada.

### Uso 3 — "Pergunte à carteira" (monitorIA) ★ foco

O monitorIA responde sobre a carteira com os dados reais e age sobre eles. Cenas sugeridas (pergunta → resposta curta na tela):

| Pergunta do monitor | Resposta do monitorIA (formato real, nomes fictícios) |
|---|---|
| "Quem mais cancelou reunião nos últimos 90 dias?" | "Há 6 clientes reincidentes, com 2 cancelamentos cada. Mais recentes: **Auto Peças Horizonte** (última em 23/09), **Distribuidora Rota Sul** (22/09), **Mecânica Estrela** (08/09). Taxa de cancelamento da carteira: 30%." |
| "Quem está vencido e sem nada marcado? Quem priorizo hoje?" | "4 prazos venceram nos últimos 15 dias sem entrega marcada: **Rota Sul** e **Horizonte** (Monitoria, há 5 dias), **Estrela** (8 dias), **Center Motos** (12 dias). Comece por Horizonte e Rota Sul: além de vencidos, ainda não tiveram contato." |
| "Tenho reunião de precificação hoje com a Horizonte. Me dá uma pauta curta?" | Pauta em 4–5 linhas a partir do histórico e do dossiê do cliente (itens combinados na última reunião, produtos com preço a revisar, próximos passos). |

Outras capacidades que valem uma cena rápida: **gerar a ata da reunião com IA** (a partir da transcrição), **explicar um conceito com dado real** ("o que conta como cliente ativo?") e **cartões de alerta** que já abrem a conversa com a pergunta pronta.

> Origem das respostas: a primeira veio de uma pergunta real ao monitorIA em 28/09/2026 (nomes trocados). A segunda e a terceira seguem os dados verificados da carteira; as ferramentas que as respondem foram corrigidas nesta data e as respostas devem ser recapturadas depois da atualização, se o vídeo mostrar o texto literal.

### Uso 4 (opcional) — "Onde está a carga?" (Análises)

- **Entregas concluídas por mês** com projeção, e o filtro "Todas as entregas / Só reuniões".
- **Reuniões nas entregas:** "51% das entregas do mês foram reunião".
- **Carga por monitor:** carteira, atrasados por serviço, entregas do mês e quem está aguardando retorno do cliente.
- **Cancelamentos:** quem cancela e quanto.

## Números que podem aparecer (ilustrativos)

Use-os como escala, não como dado oficial: ~30 clientes e 38 atendimentos (lojas) na carteira; 2 serviços com prazo (Monitoria 30 dias, Price 15 dias); ~40 entregas por mês. Se o vídeo for público, trate como "exemplo" e não como resultado da 2D.

## Storyboard sugerido (20–25 s, 16:9)

1. **Hook (0–3 s):** tela escura, a seta dourada da 2D sobe. Texto: "Quem precisa de você hoje?"
2. **Reveal (3–6 s):** a Visão Geral monta card a card: "16 de 37 em dia".
3. **Destaque 1 (6–10 s):** hover em "sem nada" e o popup abre com prazos e cores.
4. **Destaque 2 (10–15 s):** aba desliza de "Sem acompanhamento" para "Próximas agendas"; o calendário "Entregas por dia" pulsa; uma reunião é marcada.
5. **Destaque 3 (15–21 s):** monitorIA. Digitando "Quem mais cancelou reunião?", a resposta aparece formatada.
6. **Outro (21–25 s):** logo 2D + "CARTEIRA 2D — a carteira inteira, no ritmo."

## Share copy (sugestão)

"A carteira inteira da 2D num painel só: quem está em dia, quem está atrasado e o que fazer agora. E o monitorIA responde o resto."

## Anti-references

- Nada de dashboard genérico de SaaS com gráfico de pizza e "otimize seu fluxo de trabalho".
- Nada de neon, gradiente arco-íris ou cores fora da paleta: a identidade é preto, branco e dourado.
- Não mostrar o monitorIA como robô de desenho animado ou chat "mágico": ele é um colega que consulta os dados.
- Não usar música agressiva nem efeitos de "glitch".

## Design Principles

1. **Número explicável:** todo número aparece como "X de Y", com o que conta a um toque (ⓘ).
2. **Cor só com significado:** verde, amarelo e vermelho dizem prazo; o dourado é identidade.
3. **Do número à ação em um clique:** lista, motivo, cliente.
4. **Movimento com propósito:** transições suaves (abas deslizantes, fade) que mostram mudança de contexto, nunca decoração.
5. **Menos texto na tela:** o painel mostra o essencial; o detalhe fica no popup.

## Privacidade (obrigatório para o vídeo)

- **Nenhum nome real de cliente, contato, telefone, e-mail, CNPJ ou valor financeiro** no vídeo, no roteiro ou na share copy. Use nomes fictícios de lojas de autopeças (ex.: Auto Peças Horizonte, Distribuidora Rota Sul, Mecânica Estrela, Center Motos).
- **Monitores:** usar nomes fictícios (ex.: "Ana", "Bruno") salvo autorização explícita dos monitores reais.
- **Não mostrar** endereços internos (`carteira.local`, IPs, portas), caminhos do OneDrive, tokens ou telas de login.
- Dados reais da carteira são da 2D e dos clientes dela: se usar capturas do app, trocar os nomes antes de gravar.

## Accessibility & Inclusion

Texto legível (mínimo ~0,8 s para rótulo curto; ~0,3 s por palavra em frase). Contraste WCAG AA. Legendas em português para qualquer narração.
