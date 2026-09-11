# monitorIA no Prisma — sidecar de análise (somente leitura)

**Data:** 2026-09-11
**Status:** desenho aprovado, aguardando planejamento de implementação

## Problema

O Prisma (outro sistema interno da 2D, mesmo formato da Carteira: `.exe` por
máquina, sem autenticação, dados em OneDrive) precisa de um agente de IA capaz
de **analisar** os dados da carteira de monitoria — agenda, reuniões, cadência,
risco por cliente — sem que o usuário do Prisma tenha que abrir a Carteira.

O agente que faz isso já existe: o monitorIA (`server/ia/`). O que não existe é
um caminho para o Prisma alcançá-lo.

## Restrições apuradas (não presumidas)

1. **Não há caminho de rede entre as máquinas.** As máquinas que rodam o Prisma
   estão em redes diferentes da máquina que hospeda a Carteira; não existe VPN,
   IP público nem port-forward. O único recurso em comum é o **OneDrive da 2D**.
   Isso elimina qualquer desenho que dependa de uma chamada HTTP/MCP ao vivo até
   o backend da Carteira.
2. **O consumidor é código, não uma pessoa.** Não é alguém adicionando um
   servidor MCP no Claude Code pessoal — é o produto Prisma chamando o agente
   sozinho.
3. **Escrita é proibida.** O agente do lado do Prisma pode consultar agenda e
   reuniões, mas não pode criar, editar nem apagar nada da Carteira.
4. **Já existe mecanismo para "máquina fora da LAN".** `APP_MODE=client`
   (`server/modo.cjs`, `server/fila/`) está em produção hoje para 3 máquinas
   remotas: a máquina cliente tem backend local, lê um espelho dos dados
   sincronizado por OneDrive e enfileira escritas (que o servidor aplica depois).
5. **A key do Ollama Cloud é compartilhável e já é distribuída via OneDrive.**
   `config-ia.env` dentro de `DATA_DIR` (ver `server/config.cjs`) é lido
   automaticamente por qualquer máquina cliente — credencial de serviço, cota
   por modelo, pensada para várias máquinas. O login do Claude CLI é o oposto:
   assinatura **pessoal**, detectada por máquina, nunca compartilhada.

## Desenho

### Arquitetura

O Prisma embute um **sidecar**: um processo Node local, subido pelo launcher do
próprio Prisma (mesmo padrão de Node portátil usado pelo launcher da Carteira),
rodando em `APP_MODE=client`.

```
Máquina do usuário do Prisma
┌─────────────────────────────────────────────────────────┐
│ Prisma (.exe)                                           │
│   └─ UI do Prisma ──HTTP loopback──► sidecar (Node)     │
│                                       │                 │
│                                       ├─ ferramentas    │
│                                       │  de ANÁLISE     │
│                                       │  (só leitura)   │
│                                       │        │        │
│                                       │        ▼        │
│                                       │   espelho dos   │
│                                       │   dados (OneDrive)
│                                       │                 │
│                                       └─ provedor LLM:  │
│                                          Ollama Cloud   │
│                                          (key do OneDrive)
│                                          ou conta Claude│
│                                          pessoal da máq.│
└─────────────────────────────────────────────────────────┘
```

O sidecar não fala com a máquina da Carteira em nenhum momento: o dado chega
pelo OneDrive (mesmo mecanismo de espelho que as máquinas cliente já usam
hoje — `getSheetDataRemota` lendo o snapshot publicado pelo controller, ver
`server/dominio/repo.cjs` e `SNAPSHOT_DIR` em `server/config.cjs`), e o modelo
é alcançado pela internet (Ollama Cloud ou a conta Claude da própria máquina).

**Simplificação que cai de graça por ser só leitura:** o lado de ESCRITA do
modo cliente (fila, `server/fila/mutacao.cjs`, controller aplicando depois)
não é usado aqui. O sidecar só lê o snapshot; nada é enfileirado, nada precisa
ser aplicado do outro lado. Isso remove do escopo toda a parte mais delicada do
mecanismo multi-máquina (conflito de sincronização, ordem de deploy de entidade
nova na fila, operação presa como `skipped`).

### Ferramentas — conjunto NOVO, só leitura

Não é o conjunto de 41 ferramentas da Carteira. É um conjunto próprio, curado
para análise, definido em módulo separado (ex.: `server/ia/toolsAnalise.cjs`),
sem nenhuma ferramenta de escrita — as de escrita não entram na lista exposta,
nem atrás de confirmação.

Escopo de leitura previsto:

- agenda e reuniões (histórico e próximas)
- cadência de contato/monitoria por cliente e fila de priorização
- cobertura da carteira (por serviço, por monitor)
- dossiê e histórico de risco por cliente
- conceitos de negócio da carteira (o equivalente a `explicar_conceito_carteira`)

Regra herdada da Carteira e que continua valendo: o `parameters` (JSON Schema)
de cada ferramenta é o contrato — todo parâmetro declarado tem de ser lido e
usado, e vice-versa (`server/ia/toolsSchema.test.ts` cobre isso e deve cobrir
o módulo novo também).

### Provedor de LLM

Duas opções por instalação, sem mudança de código entre elas:

- **Ollama Cloud** (default): a key vem do `config-ia.env` compartilhado no
  OneDrive; nada a configurar na máquina. O loop de tool-calling roda no nosso
  código (`orquestrador.cjs` ou equivalente) — o Ollama não fala MCP.
- **Conta Claude pessoal da máquina**: o Claude Code CLI local usa o login já
  existente naquela máquina (`server/ia/claudeCli/auth.cjs`), e aí o loop de
  ferramentas é do próprio CLI, via MCP (`mcpServidor.cjs` apontando para o
  loopback do sidecar, exatamente como na Carteira hoje).

Consequência importante: usar a conta pessoal de cada um **evita a contenção de
credencial** que já causou problema real (uma única sessão Claude compartilhada
entre o chat ao vivo e trabalho em lote).

### Fluxo de dados

1. Usuário faz uma pergunta na UI do Prisma.
2. Prisma chama o sidecar em `127.0.0.1:<porta própria>` (porta distinta da
   3011 da Carteira, para os dois poderem coexistir na mesma máquina).
3. O sidecar monta o prompt com as ferramentas de análise e chama o provedor.
4. Cada chamada de ferramenta lê o espelho local dos dados (OneDrive) — nunca a
   máquina da Carteira.
5. A resposta volta para a UI do Prisma.

### Erros e limites

- **OneDrive não sincronizado/pasta ausente**: mesmo comportamento da Carteira
  hoje — falha alta e clara no boot do sidecar, sem fallback para pasta local
  (`server/config.cjs` já faz isso).
- **Dado defasado**: o espelho é sincronizado pelo OneDrive, então uma análise
  pode refletir um estado alguns minutos atrás. Aceitável para análise; é o
  mesmo trade-off que as máquinas cliente já têm.
- **Cota do Ollama Cloud**: o fallback por modelo (`chamarComFallback`) já
  cobre 404/429/5xx trocando de modelo. Várias máquinas na mesma key é o caso
  previsto pelo tier gratuito (cota por modelo).
- **Sem provedor disponível** (sem key e sem login Claude): erro explícito
  dizendo qual das duas opções configurar, em vez de resposta vazia.

### Testes

- Contrato das ferramentas novas: mesmo teste de schema que já existe
  (`toolsSchema.test.ts`) estendido ao módulo de análise.
- Garantia de "somente leitura": teste que percorre a lista exposta e falha se
  qualquer ferramenta de escrita (`criar_*`, `atualizar_*`, `remover_*`,
  `corrigir_*`, `registrar_*`) aparecer nela.
- Leitura com repositório em memória (`repoMemoria`), sem tocar dado real —
  isolando `ONEDRIVE_ROOT` **e** `SQLITE_DIR` (já mordeu antes: teste mal
  isolado escreveu na fila real).

## Fora de escopo

- **Carteira consultando dados do Prisma** ("vice-versa"). Não foi especificado
  o que a Carteira precisaria ler do Prisma; fica para um desenho próprio.
- **Escrita a partir do Prisma** (criar evento, registrar ação etc.).
- **Exposição do MCP da Carteira na rede/internet.** Descartado: não há caminho
  de rede e abriria superfície de autenticação que o projeto não tem hoje.

## Decisões abertas (precisam de resposta antes do planejamento)

1. **Como o código é compartilhado entre os dois produtos.** O sidecar precisa
   de `server/config.cjs`, `server/dominio/`, o provedor de IA e o módulo novo
   de ferramentas. Três caminhos possíveis: (a) o Prisma consome o mesmo
   release da Carteira (o `.zip` publicado hoje já leva `server/` inteiro), só
   subindo o sidecar em vez do servidor completo; (b) extrair um pacote
   compartilhado; (c) copiar para o repositório do Prisma. (a) é o de menor
   esforço e menor risco de divergência — mas precisa de confirmação, porque
   amarra a release do Prisma à da Carteira.
2. **Limite do que EU consigo implementar.** A parte da Carteira (módulo de
   ferramentas de análise, entrypoint do sidecar, config de modo cliente,
   testes) está neste repositório. A integração no launcher do Prisma (subir o
   sidecar junto do `.exe` dele, apontar a UI para o loopback) está em outro
   repositório, ao qual não tenho acesso nesta sessão — precisa ser feita lá,
   por quem tiver.

## Riscos conhecidos

1. **Duplicação de código entre os dois produtos.** O sidecar reusa
   `server/config.cjs`, `server/fila/`, `server/dominio/` e o provedor de IA da
   Carteira. Se for copiado em vez de compartilhado, divergência é questão de
   tempo (o projeto já convive com isso no par `ata.ts`/`ataTexto.cjs`, e é
   reconhecidamente um risco). Definir na fase de planejamento se vira pacote
   compartilhado ou se o Prisma consome o mesmo release da Carteira.
2. **Dois `.exe` na mesma máquina disputando porta.** A Carteira já teve esse
   problema exato (3001 disputada por outro projeto). O sidecar precisa de porta
   própria e configurável.
3. **Dado de cliente em mais máquinas.** Toda máquina com o sidecar passa a ter
   espelho local dos dados da carteira. Não é novo (as 3 máquinas cliente já
   têm), mas amplia a superfície — vale decisão explícita de quem recebe.
