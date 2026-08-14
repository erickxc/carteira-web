<!-- title: Análise de IA — Carteira Web -->

# Onde a IA se encaixa na Carteira Web

Análise de oportunidades concretas de IA generativa (API da Anthropic/Claude) no app de carteira de monitoria da 2D Consultores — priorizadas por esforço vs. valor, com atenção especial a um ponto que muda a resposta: **hoje o app é 100% local/LAN, sem nenhum dado saindo da rede da 2D.** Qualquer chamada a uma API de IA na nuvem quebra essa premissa — trato isso como decisão de negócio a confirmar antes de qualquer implementação, não como detalhe técnico.

---

## 0. Decisão que precisa vir antes de qualquer código

O `CLAUDE.md` do projeto documenta explicitamente: *"Sistema estritamente local/offline... dados reais de clientes vivem no OneDrive corporativo, não em servidor de banco/nuvem nenhum."* Usar a API da Claude significa enviar texto (nomes de cliente, anotações, resumos de reunião) para a Anthropic processar. Tecnicamente isso é seguro (dados não usados pra treino por padrão em contas API, criptografados em trânsito), mas é uma mudança de postura que o Erick precisa decidir conscientemente, não algo que eu devo simplesmente implementar.

**Caminhos possíveis, do mais conservador ao mais aberto:**
- **Só dados agregados/anônimos** vão pra API (contagens, datas, sem nome de cliente) — quase nenhum ganho real, quase nenhum risco.
- **Nome da empresa + conteúdo de reunião vão, mas nada de CPF/contatos pessoais** — cobre a maioria dos casos de uso abaixo com risco moderado.
- **Tudo vai** (mesmo nível de exposição que já existe hoje internamente) — habilita tudo, mas é a decisão que precisa ser explícita.

Nada abaixo depende de escolher agora — é só o pré-requisito antes de eu implementar qualquer item que toque em dado de cliente.

---

## 1. Onde a IA generativa realmente ajudaria (ordenado por esforço)

### 1.1 Geração de Ata mais natural — *substitui heurística de regex existente*
Hoje `src/utils/ata.ts` monta a ata por concatenação de seções fixas + heurística de regex pra achar "decisões" (`/^(decis|decidid|ficou\s+(definido|acordado))/i`). Funciona, mas é rígido — só pega decisão se a frase começar com a palavra certa.

**Troca:** dar o texto livre do campo "Resumo" pro modelo com **saída estruturada** (`output_config.format`, JSON Schema fixo: `{decisoes: string[], proximosPassos: string[], resumoExecutivo: string}`) e só então montar a ata no mesmo template visual de hoje. Zero heurística de regex, zero falso-negativo por não começar com a palavra certa.
- **Modelo:** Claude Haiku 4.5 — tarefa de extração, não de criatividade; barato e rápido o suficiente pra rodar ao salvar a reunião.
- **Esforço:** baixo — um endpoint novo no backend (`/api/ata/extrair`), chamada síncrona ao salvar.

### 1.2 Mensagem personalizada por cliente — *evolui os "Modelos" estáticos já existentes*
`Configurações → Modelos` já tem templates por segmento (frio/esfriando/engajado) com `{empresa}` interpolado — mas é o mesmo texto pra todo mundo do segmento. Com o histórico do cliente (última reunião, serviço vencido, contatos recentes) já disponível no app, dá pra gerar um rascunho de mensagem específico daquele cliente, que o monitor edita antes de enviar (nunca envia automático).
- **Modelo:** Haiku 4.5 pro rascunho; Sonnet 5 se quiser tom mais elaborado/consultivo.
- **Esforço:** baixo-médio — um botão "Gerar rascunho" no lugar onde hoje só lista os templates fixos.

### 1.3 Busca em linguagem natural sobre a carteira
Perguntas tipo *"quem no RJ tá sem contato há mais de 60 dias e tem Price vencido"* hoje exigem combinar filtros manualmente em 2-3 telas. Com **tool use**: o modelo recebe a pergunta, chama uma ferramenta que já existe conceitualmente no seu `cadenciaServico.ts`/`useDashboardData.ts` (ex.: `buscar_clientes(filtros)`), e devolve a lista + uma frase de resumo.
- **Modelo:** Sonnet 5 (raciocínio sobre múltiplos filtros combinados é mais confiável que no Haiku).
- **Esforço:** médio — precisa expor as funções de filtro do frontend como "tools" reais (JSON Schema) num endpoint que o modelo possa chamar.
- **Ressalva:** só compensa se o padrão de uso mostrar que "montar filtro manual" é de fato uma dor recorrente — vale confirmar com quem usa antes de construir.

### 1.4 Relatório executivo mensal em texto
O Dashboard já calcula tudo numericamente (cobertura, aderência, reagendamentos, tendência). Um botão "Gerar resumo do mês" que pega esses números (não o dado bruto do cliente) e devolve 3-4 parágrafos em português natural pra colar num e-mail pro Marco/sócios.
- **Modelo:** Sonnet 5 — é redação, não extração; texto malfeito aqui é visível pra liderança.
- **Esforço:** baixo — os números já existem em `useDashboardData.ts`, só falta o texto.
- **Vantagem de privacidade:** só números agregados entram no prompt, nenhum nome de cliente — é o item de **menor risco de dado** de toda a lista.

---

## 2. Onde eu **não** trocaria por IA (e por quê)

- **Fila de priorização de Ações** (`cadenciaServico.ts`) — regra determinística hoje (dias de atraso, quantidade de serviços ruins). Isso é *exatamente* o tipo de lógica que deve continuar sendo código auditável, não um modelo generativo: o Erick e a Karol precisam confiar cegamente na ordem da fila, e "por que a IA decidiu que esse cliente é mais urgente" é uma resposta pior que "porque o código soma X e Y". IA aqui seria trocar previsibilidade por incerteza sem ganho real.
- **Classificação de status/severidade de cliente** — mesma lógica: já é regra clara, já funciona, trocar por IA introduz variância sem necessidade.

---

## 3. Guia técnico rápido (API da Claude, hoje)

| Tarefa | Modelo recomendado | Por quê |
|---|---|---|
| Extrair decisões/próximos passos do resumo de reunião | **Claude Haiku 4.5** + saída estruturada (`output_config.format`) | Extração pura, alto volume (1 por reunião), custo baixo importa mais que nuance |
| Rascunho de mensagem personalizada | **Claude Haiku 4.5** (rascunho) | Rápido, barato, sempre revisado por humano antes de enviar |
| Busca em linguagem natural + tool use sobre filtros | **Claude Sonnet 5** | Combinar múltiplos critérios com confiabilidade pede mais raciocínio |
| Relatório executivo mensal (texto a partir de números) | **Claude Sonnet 5** | Prosa que vai pra liderança — qualidade de redação importa |

**Prompt caching:** o "molde" da ata (template de seções, instruções de formatação) é sempre o mesmo texto — vale marcar como `cache_control: {type: "ephemeral"}` no system prompt pra pagar ~10% do preço normal a partir da segunda chamada do dia. Isso vale pra qualquer um dos itens acima que reusa o mesmo prompt-base repetidamente (ata, mensagem, busca).

**Custo esperado (ordem de grandeza):** com Haiku 4.5 (~$1/$5 por milhão de tokens) e uma reunião média gerando ~1-2 mil tokens de contexto, o custo por ata extraída fica na casa de frações de centavo — mesmo em uma carteira com centenas de reuniões/mês isso não é uma linha de custo relevante frente ao tempo do monitor economizado.

---

## 4. Ordem sugerida se for pra frente

1. Confirmar com o Erick o nível de exposição de dado aceitável (seção 0).
2. Relatório executivo mensal (1.4) — menor risco de dado, ganho visível rápido, serve de prova de conceito de "vale a pena mesmo".
3. Extração estruturada de ata (1.1) — maior ganho de qualidade de dado no dia a dia.
4. Mensagem personalizada (1.2) — depende de 3 já estar rodando bem (mesmo padrão de prompt).
5. Busca em linguagem natural (1.3) — só se o uso mostrar que monta-filtro manual é dor de verdade.
