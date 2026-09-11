# monitorIA publicado como CLI — análise no Prisma

**Data:** 2026-09-11
**Status:** desenho aprovado, aguardando planejamento de implementação

## Problema

O Prisma (outro sistema interno da 2D, mesmo formato da Carteira: `.exe` por
máquina, sem autenticação, dados em OneDrive) precisa de um agente de IA capaz
de **analisar** dados — clientes, produtos, receita, período (e vendedores, ver
Dependências) — sem que o usuário abra a Carteira.

O agente já existe: o monitorIA (`server/ia/`). O que não existe é um caminho
para o Prisma alcançá-lo **sem replicar o código do monitorIA no repositório do
Prisma** — requisito explícito do usuário.

## Restrições apuradas (não presumidas)

1. **Não há caminho de rede entre as máquinas.** As máquinas do Prisma estão em
   redes diferentes da que hospeda a Carteira; não há VPN, IP público nem
   port-forward. O único recurso em comum é o **OneDrive da 2D**. Isso elimina
   o desenho normal (hospedar o agente como serviço HTTP — que, aliás, a
   Carteira **já faz** internamente em `POST /api/ia/chat`).
2. **O consumidor é código, não uma pessoa.** É o produto Prisma chamando o
   agente sozinho, não alguém adicionando um MCP no Claude Code pessoal.
3. **Escrita nos dados da carteira é proibida.** Consulta e análise apenas.
4. **Nada de código da Carteira no repositório do Prisma.**
5. **MCP não resolve sozinho.** MCP padroniza *ferramentas*, não agentes. O
   Claude CLI fala MCP nativo, mas o **Ollama não** — com Ollama, alguém teria
   que escrever o loop de tool-calling (o que o `orquestrador.cjs` faz), que é
   exatamente a replicação que se quer evitar.
6. **O canal de distribuição já existe.** `publicarRelease.cjs` já publica no
   OneDrive um `.zip` com `server/` inteiro, `better-sqlite3` e um `node.exe`
   portátil — e as máquinas já o recebem por sincronização.

## Desenho

### Arquitetura: o agente é um comando, não um serviço

O Prisma executa um processo por pergunta, a partir do release que já está no
OneDrive. Nada roda permanentemente, nada escuta porta.

```
Máquina do usuário do Prisma
┌──────────────────────────────────────────────────────────────┐
│ Prisma (.exe)                                                │
│   └─ ~15 linhas: monta o comando, lê o stdout                │
│            │                                                 │
│            ▼  (subprocesso, por pergunta)                    │
│   <OneDrive>/…/releases/app/node/node.exe                    │
│   <OneDrive>/…/releases/app/server/ia/agenteCli.cjs          │
│            │                                                 │
│            ├─ ferramentas de ANÁLISE (só leitura)            │
│            │     ├─ snapshot da carteira (SQLite, OneDrive)  │
│            │     └─ Dados Alvos (xlsx, OneDrive)             │
│            │                                                 │
│            └─ provedor: Ollama Cloud (key compartilhada)      │
│                     ou Claude CLI (conta pessoal da máquina) │
└──────────────────────────────────────────────────────────────┘
```

O processo nunca fala com a máquina da Carteira. O dado vem do OneDrive; o
modelo, da internet.

### Interface do CLI

```
node agenteCli.cjs --pergunta "<texto>" [--historico <json>] [--monitor "<nome>"] [--json]
node agenteCli.cjs --alertas [--json]
```

Saída em **JSONL** no stdout — uma linha por evento, para o Prisma mostrar
progresso ao vivo em vez de um spinner cego (é o equivalente ao que a tela do
monitorIA mostra hoje: "Analisando sua pergunta · Xs" + os passos):

```
{"tipo":"passo","ferramenta":"buscar_analise_estrategica_alvos"}
{"tipo":"passo","ferramenta":"buscar_historico_eventos"}
{"tipo":"resposta","texto":"…","turnId":"…"}
```

Erro vai para stderr e código de saída ≠ 0 — o Prisma distingue falha de
resposta vazia.

### Tabelas e resumos

Pedido do usuário: com dado de venda (Poder de Compra sozinho já tem 3.384
linhas para um cliente), a resposta não pode ser só texto corrido — precisa
de tabela, e o agente precisa resumir.

**Decisão de segurança, com precedente direto no projeto**: o chat da própria
Carteira (`src/components/ia/RespostaIA.tsx`) nunca usa
`dangerouslySetInnerHTML` para renderizar o que o modelo escreve — texto de
LLM não é confiável para virar HTML injetado direto. O mesmo vale aqui: o
modelo **não** escreve a tag HTML da tabela. Ele nunca sequer *reescreve* a
tabela — sem isso, milhares de linhas passariam pelo modelo duas vezes (uma
para calcular, outra para "formatar"), custando tokens à toa e arriscando
transcrever número errado.

O evento final do JSONL ganha um campo `tabelas` (dado estruturado, não
string), montado pelo `agenteCli.cjs` a partir do resultado BRUTO da(s)
ferramenta(s) de análise chamada(s) — não digitado pelo modelo:

```json
{
  "tipo": "resposta",
  "texto": "3 clientes estão com poder de compra muito acima do que estão comprando recentemente...",
  "tabelas": [
    { "titulo": "Poder de Compra por Cliente", "colunas": ["Cliente", "Poder de Compra", "Receita Média Recente", "% Variação", "Grupo"], "linhas": [["...", 38434.08, 25612.05, -33.36, "Grupo 2"], ...] }
  ],
  "turnId": "…"
}
```

O Prisma monta o HTML da tabela do jeito que quiser (componente próprio,
paginação, ordenação) — o CLI só entrega colunas + linhas. `texto` continua
sendo o resumo em prosa, papel que o modelo já cumpre bem hoje no chat da
Carteira.

### Ferramentas — conjunto NOVO, só leitura

Módulo próprio (`server/ia/toolsAnalise.cjs`), não os 41 da Carteira. Nenhuma
ferramenta de escrita entra na lista — nem atrás de confirmação.

**Fonte de verdade dos relatórios de vendas: o catálogo real do analisador da
2D** (aplicação Python separada, `analise_funil.py` + módulos — ver
`RELATORIOS.md` daquele projeto), não uma reimplementação nossa por
aproximação. Rodei o motor real (extraído do `.git` do projeto) contra o
`Base.csv` de um cliente real pra confirmar estrutura e valores antes de
especificar — ver Validação abaixo.

**MVP — 3 relatórios** (de um catálogo de 14; os demais ficam para uma
rodada futura, fora deste escopo):

1. **Alertas de Queda Consecutiva** — produtos com N períodos seguidos de
   queda terminando no período mais recente fechado. Colunas: período
   consecutivos em queda, período/receita/qtd anteriores à queda, receita/qtd
   atuais, **Queda em R$ = soma acumulada da perda em CADA período da
   sequência frente ao período-base** (não a diferença simples entre primeiro
   e último ponto — uma queda de 3 meses pesa mais que uma queda de 1 mês do
   mesmo tamanho final), % média de queda (média das variações percentuais
   dentro da sequência). Meses com receita líquida negativa (devolução/estorno
   maior que a venda) ficam fora do cálculo de variação. Ordenado por Queda em
   R$ descendente. Existe hoje em `analiseEstrategica.quedaPersistente`, mas
   com a fórmula de "Queda em R$" simplificada (só antes−atual) — reescrever.
2. **Erosão de Clientes por Produto** (a versão POR PRODUTO, que não existe na
   Carteira hoje — só existe a versão Geral/agregada). Por cliente final +
   produto, compara o último mês completo contra o PICO histórico (maior mês
   de receita em qualquer ponto anterior, não só o mês anterior). Filtros:
   redução mínima % (padrão 50) E queda mínima em R$ (padrão 3000) — os dois
   juntos. Ordenado por cliente, depois por Queda em R$ descendente.
3. **Poder de Compra por Cliente** — uma linha por cliente final, sem período.
   `Poder de Compra` = média dos 3 meses-calendário de MAIOR receita do
   cliente em todo o histórico, **descartando outliers antes** (critério de
   Tukey: IQR dos meses ativos do próprio cliente, 1,5× de multiplicador) —
   não a média bruta do top-3. `Receita Média Recente` = média dos 3 meses
   mais recentes disponíveis (meses sem compra contam como 0). `% de Variação
   vs. Potencial` = (recente − potencial) ÷ potencial. `Meses Muito Abaixo do
   Potencial` = quantos dos 3 meses recentes tiveram receita ≤ 40% do Poder de
   Compra. `Grupo` = faixa ABC do cliente pela receita TOTAL (não pelo poder
   de compra) — campo que a versão atual da Carteira não expõe. Existe hoje em
   `analiseEstrategica.poderDeCompra`, mas sem remoção de outlier nem `Grupo`
   — reescrever.

Os três leem as mesmas 6 dimensões do modelo do analisador: **período, loja,
cliente final, marca, descrição/produto, referência/código** — atenção: são
DUAS dimensões de produto diferentes (confirmado com o usuário), nunca
misturar:
- **descrição/produto** ("Lubrificante", "Amortecedor Suspensão") — o que
  aparece numa conversa de reunião.
- **referência/código** ("LUBRAX 15W40", "37011") — o SKU exato.

Fonte dos dados: mesma que a Carteira já lê hoje (`server/alvos/`, arquivo
`Dados Mais Atacado.xlsx`) — não o `summary_dashboard.json` do analisador
(esse é saída derivada de outra aplicação, não a nossa fonte).

**Demais ferramentas (contexto da carteira, não vendas)**:
- agenda e reuniões (histórico e próximas)
- cadência de contato, fila de priorização, cobertura
- dossiê e histórico de risco por cliente
- conceitos de negócio (equivalente a `explicar_conceito_carteira`)

O contrato vale como na Carteira: todo parâmetro declarado no `parameters` tem
de ser lido e usado, e vice-versa (`toolsSchema.test.ts` estendido ao módulo
novo).

### Validação feita durante o desenho

Sem acesso a um relatório `.xlsx` já exportado pelo analisador pra comparar
número a número, rodei o motor Python real (`analise_funil.py` e os módulos
que ele importa — `classificacao.py`, `migracao.py`, `nucleo_analise.py`,
`relatorios_erosao.py`, `relatorios_produtos.py`) diretamente contra o
`Base.csv` de um cliente real (211.395 linhas), chamando
`gerar_analises_completas` só com as 3 chaves do MVP. Confirmou estrutura de
colunas e produziu números de referência reais (ex.: um cliente com Poder de
Compra de R$ 38.434, Grupo 2; erosão num produto com pico de R$ 4.771,71,
zerou depois).

**Não fechei uma comparação linha-a-linha** com a implementação atual da
Carteira: a base de Dados Alvos (`.xlsx`) que a Carteira lê não estava
sincronizada nesta máquina para nenhum cliente que também tinha saída do
analisador. Fica como primeiro passo da implementação: rodar os dois lados
contra o mesmo cliente antes de considerar a reescrita pronta.

### Alertas (modo `--alertas`)

Conjunto **diferente** do da Carteira (que é sobre cadência/reunião). Aqui o
recorte é comercial. Os 3 relatórios do MVP viram cartão de alerta (um por
achado, com uma `pergunta` pronta), mesmo padrão de `server/ia/alertas.cjs`.
Nada é gravado: alerta é derivado, recalculado a cada chamada.

### Provedor de LLM

Sem mudança de código entre as duas opções:

- **Ollama Cloud (default).** Verificado: sem config de GUI e sem
  `IA_PROVIDER`, `provedorAtivo()` cai em `ollama` (`claudeCli/estado.cjs:55`).
  A key vem do `config-ia.env` **compartilhado dentro do OneDrive** (ver
  `server/config.cjs`) — credencial de serviço, cota por modelo, pensada para
  várias máquinas. Máquina nova do Prisma já nasce funcionando, sem configurar
  nada à mão.
- **Claude CLI (conta pessoal da máquina).** `IA_PROVIDER=claude-cli` na
  chamada; usa o login já existente naquela máquina
  (`server/ia/claudeCli/auth.cjs`). Evita a contenção de credencial que já
  causou problema real (uma sessão Claude compartilhada entre chat ao vivo e
  trabalho em lote).

### Leitura de dados

Modo `APP_MODE=client`: a leitura vem do snapshot publicado pelo controller
(`getSheetDataRemota` → `new Database(SNAPSHOT_FILE, { readonly: true })`, ver
`server/dbSqlite.cjs:110`). Verificado como auto-contido: sem backend, sem
rede. SQLite aceita vários leitores, então o motivo de o MCP de hoje não abrir
o banco (evitar **segundo escritor**) não se aplica aqui.

### Medição e auditoria (decisão do usuário: sim, precisa medir)

`UsoIA` (tokens/custo) e `AcoesIA` (auditoria de ferramenta) **já são entidades
da fila** (`server/fila/entidades.cjs`). Em modo cliente, `registrarUso`/
`registrarAcao` já roteiam pela fila automaticamente (`executarMutacao` usa
`repoPlanilha()` e é o caminho usado quando `isClient`). Consequências
aceitas:

- O registro aparece no painel da Carteira com **atraso** (o controller aplica
  a fila em ciclos de minutos), não na hora.
- É a única escrita permitida — e é escrita de metadado, nunca de dado de
  cliente.
- A ordem de deploy importa: essas entidades já existem na máquina servidora,
  então nada novo a propagar (ver aviso em CLAUDE.md sobre entidade nova na
  fila virando `skipped`).

### Erros e limites

- **OneDrive ausente/não sincronizado**: falha alta e clara no boot, sem
  fallback para pasta local (`server/config.cjs` já faz `process.exit(1)`).
- **Sem estado entre chamadas**: cada execução é isolada; conversa multi-turno
  exige o Prisma devolver o histórico (o frontend da Carteira já funciona
  assim — a rota de chat é stateless).
- **Sem streaming de texto**: a resposta sai inteira no fim. O JSONL dá
  progresso por passo, não token a token.
- **Dado com atraso de sincronização**: análise pode refletir estado de alguns
  minutos atrás.
- **Custo de partida do processo**: centenas de ms contra ~30-100s de modelo —
  ruído.
- **Cota do Ollama Cloud**: `chamarComFallback` já troca de modelo em
  404/429/5xx; cota do tier gratuito é por modelo, não por conta.

### Testes

- Contrato de schema das ferramentas novas (`toolsSchema.test.ts` estendido).
- **Garantia de só-leitura**: teste que percorre a lista exposta e falha se
  aparecer qualquer ferramenta de escrita (`criar_*`, `atualizar_*`,
  `remover_*`, `corrigir_*`, `definir_*`).
- Leitura com `repoMemoria`, isolando `ONEDRIVE_ROOT` **e** `SQLITE_DIR` (já
  mordeu antes: teste mal isolado escreveu na fila real).
- Formato do JSONL: uma linha por evento, parseável isoladamente.
- `tabelas` vem do resultado bruto da ferramenta, não de texto do modelo —
  teste que confirma que o conteúdo de `linhas` bate exatamente com o que a
  ferramenta devolveu (nenhuma transcrição/arredondamento novo no meio).

## Dependências externas (fora do meu controle)

- **Vendedor não existe no dado hoje.** Busquei em `server/` e `src/`: zero
  ocorrência. O Dados Alvos tem cliente final, produto, receita e período — não
  vendedor. Decisão do usuário: virá como arquivo/coluna nova no próprio Dados
  Alvos. **Alertas e análises por vendedor só podem ser construídos depois que
  esse dado for publicado lá.**
- **Integração no launcher do Prisma** (chamar o subprocesso, guardar
  histórico, mostrar progresso) é no repositório do Prisma, ao qual não tenho
  acesso nesta sessão.

## Fora de escopo

- **Escrita nos dados da carteira** a partir do Prisma (só metadado de
  medição).
- **Carteira lendo o banco do Prisma** ("vice-versa"): descartado — o dado que
  o Prisma vai analisar vem do Dados Alvos, que a Carteira já lê.
- **Expor MCP na rede/internet**: descartado (sem caminho de rede, e abriria
  superfície de autenticação que o projeto não tem).
- **Empacotar em arquivo único (`pkg`/exe)**: bate em muro já documentado —
  `pkg` não empacota módulo nativo (`better-sqlite3`) e o servidor MCP exige
  `node.exe` real. O node portátil do release evita isso.

## Riscos conhecidos

1. **Acoplamento de release.** O Prisma passa a depender do release da Carteira
   publicado no OneDrive. Se a Carteira publicar algo que quebre o CLI, o
   Prisma quebra junto, sem aviso. Mitigação: o contrato do CLI (flags e
   formato do JSONL) tem teste próprio, e mudança nele é mudança de contrato.
2. **Dado de cliente em mais máquinas.** Toda máquina com isso passa a ter o
   espelho local. Não é novo (3 máquinas cliente já têm), mas amplia a
   superfície — vale decisão explícita de quem recebe.
3. **Se um dia aparecer VPN/túnel**, o caminho normal (`POST /api/ia/chat`,
   que já existe) passa a ser possível e é estritamente melhor que este
   desenho. Vale reavaliar nesse cenário em vez de manter o CLI por inércia.
