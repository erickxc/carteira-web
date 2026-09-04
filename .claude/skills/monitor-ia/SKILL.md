---
name: monitor-ia
description: Referência técnica completa do subsistema monitorIA (agente de IA da Carteira Web) — arquitetura, provedores, as 39 ferramentas, alertas, memória, custo/uso. Use ao implementar/alterar qualquer coisa em server/ia/, ao decidir se uma feature nova precisa de ferramenta pro agente (checklist do CLAUDE.md), ou ao responder perguntas analíticas sobre NÚMEROS/DADOS/INFORMAÇÕES do próprio monitorIA (quantas ferramentas existem, quanto custou, quais alertas disparam, como o risco é calculado) — não sobre a carteira de clientes em si (isso é CLAUDE.md).
---

# monitorIA — referência técnica

Este skill é sobre o **agente de IA** da Carteira Web (`server/ia/`), não sobre o app em geral (isso é `CLAUDE.md`, na raiz — leia-o primeiro se ainda não leu). Carregue este skill quando a tarefa for: (1) implementar/alterar algo em `server/ia/`, (2) decidir se uma feature nova em qualquer parte do app precisa de uma ferramenta pro agente, ou (3) responder uma pergunta analítica sobre o próprio monitorIA — contagem de ferramentas, custo, alertas, arquitetura de provedor.

Todo dado numérico abaixo (contagem de ferramentas, etc.) foi verificado rodando o código em 04/09/2026 (atualizado após `registrar_acao`/`buscar_historico_risco_cliente`) — se precisar de um número atualizado, rode `node -e "console.log(require('./server/ia/tools.cjs').FERRAMENTAS.length)"` em vez de confiar cegamente neste arquivo, que pode ficar desatualizado.

## Arquitetura em uma imagem

```
Usuário → chat (src/pages/AssistenteIAPage.tsx)
            │
            ▼
   POST /api/ia/... (server/routes/iaProvedor.cjs, analiseIA.cjs)
            │
            ▼
   server/ia/provider.cjs  ← ponto ÚNICO de escolha de provedor
            │
   ┌────────┴────────┐
   ▼                 ▼
ollama            claude-cli
(orquestrador.cjs  (claudeCli/cliente.cjs dirige
roda o loop de      o Claude Code CLI como
tool-calling AQUI)  subprocesso; loop de
                     ferramentas é DO CLI, via
                     MCP — mcpServidor.cjs)
   │                 │
   └────────┬────────┘
            ▼
   server/ia/tools.cjs — 39 ferramentas (FERRAMENTAS)
            │
            ▼
   server/dominio/*.cjs (via repoPlanilha()) → SQLite → espelho database_dev.xlsx
```

**Por que dois provedores**: `ollama` roda local/grátis; `claude-cli` usa a assinatura Claude do usuário (login OAuth do CLI, não API key — ver CLAUDE.md pro porquê disso importar). Produção hoje usa `claude-cli` com Haiku. Escolha em `IA_PROVIDER` (`.env`, trava) ou na GUI (Configurações → Sistema), persistida em `SQLITE_DIR/claude-cli.json`.

## As 39 ferramentas (`server/ia/tools.cjs`, array `FERRAMENTAS`)

Agrupadas por o que fazem — **nomes exatos**, use pra saber se algo já existe antes de propor ferramenta nova:

**Leitura de cliente/carteira**: `buscar_clientes`, `buscar_dossie_cliente`, `buscar_historico_risco_cliente`, `buscar_contatos_cliente`, `buscar_contatos`, `buscar_cobertura_contatos`, `buscar_historico_eventos`, `buscar_registros_produto`, `buscar_lembretes_cliente`, `buscar_tarefas_cliente`, `buscar_opcoes_evento`, `buscar_config_cadencias`

**Fila/priorização/visão geral**: `buscar_fila_priorizacao`, `buscar_vencendo`, `buscar_cobertura`, `buscar_cobertura_servicos`, `buscar_alertas_acompanhamento`, `sugerir_encaixes_agenda`, `verificar_disponibilidade` (devolve também `cargaSemana` — reuniões da semana por monitor, informativo), `buscar_agenda_ceo`

**Escrita — CONDICIONAL, exige confirmação do usuário antes de gravar** (todas seguem o padrão "descreve o que faria, só grava se confirmado"): `criar_evento`, `atualizar_evento`, `atualizar_cliente` (inclui pausa temporária: `pausadoAte`/`motivoPausa`), `registrar_acao` (Contato/Reunião/Relatório/Price — `resultado: 'sucesso' | 'sem_sucesso'` na ação já realizada; NUNCA registrar tentativa falha como sucesso), `criar_lembrete`, `corrigir_dossie_cliente`, `redigir_ata_reuniao`, `gerar_ata_pdf`, `reanalisar_cliente`

**Memória do agente** (regras gerais da carteira, não de um cliente): `buscar_memoria`, `registrar_memoria`, `remover_memoria`

**Dados Alvos / Ecossistema** (integração com outro sistema, vendas/produtos de clientes finais): `buscar_fatos_alvos`, `buscar_resumo_vendas_alvos`, `buscar_analise_estrategica_alvos`, `definir_status_acompanhamento`, `buscar_fichas_clientes_finais`, `definir_ficha_cliente_final`

**Relatório**: `gerar_relatorio_executivo`

**Regra de ouro pra ferramenta nova**: o `parameters` (JSON Schema) É o contrato — todo parâmetro declarado tem que ser LIDO e USADO no corpo, e vice-versa. `server/ia/toolsSchema.test.ts` garante isso automaticamente; rode-o depois de tocar em qualquer ferramenta.

**Valor de cadastro (monitor/serviço/sala/tipo/status) nunca é gravado cru** — sempre passa por `resolverOpcao`/`resolverLista` (`tools.cjs`) contra `Categorias` antes de gravar. Erro explícito com as opções válidas se não bater, nunca inventa nem grava errado.

## Normas do agente (`server/ia/normas.cjs`)

Lista de "GATILHO X (mecânica): ..." — cada uma nasceu de um bug real observado em produção (o agente respondeu errado, inventou, ou negou ter acesso a algo que já estava na própria resposta da ferramenta). Ao adicionar comportamento novo que o agente deveria seguir sempre, é aqui que entra — texto direto no system prompt, não depende do modelo "lembrar" de consultar nada.

## Alertas conversáveis (`server/ia/alertas.cjs`, `GET /api/ia/alertas`)

7 tipos, cada cliente aparece **uma vez só** (o mais grave, se tiver mais de um problema). Nada é gravado — sempre recalculado na hora:

| tipo | gatilho |
|---|---|
| `risco_sem_pauta` | risco alto + nenhuma reunião futura marcada |
| `sem_contato` | 30+ dias sem nenhum contato/reunião/ação |
| `vencendo` | cadência de Monitoria/Price a vencer em ≤5 dias |
| `sem_analise` | cliente ativo sem NENHUMA análise de IA ainda |
| `contradicao_dossie` | 2+ sinais negativos no texto do dossiê MAS risco classificado como baixo |
| `pauta_parada` | última análise sugeriu uma pauta e não há reunião futura nem reunião com ata desde então |
| `padrao_carteira` | tema recorrente (cancelamento, "sem ata"...) nos Pontos de Atenção de 5+ clientes — não tem `clientId`, é padrão de PROCESSO, não de cliente (rota separada, `GET /api/ia/padroes`) |

## Consumo/custo (`server/ia/uso.cjs`, sheet `UsoIA`)

Uma linha por resposta do agente, com tokens de entrada/saída/cache + custo em USD. **Não é a cota de 5h/7 dias da assinatura** — isso é outra coisa (`limiteConta.cjs`, lida via headers HTTP de uma chamada real e paga à API, cacheada 5min). Painel: Configurações → Sistema → "Uso de IA". Ollama sempre custo 0 (local). Cada linha carrega `turnId` (correlaciona pergunta↔ferramentas chamadas naquele turno) e `monitor` (de quem é a pergunta, pro filtro global de privacidade).

Se te perguntarem "quanto custou/quantos tokens" — a resposta vive em `UsoIA`, não em log nenhum; leia via `repo.get('UsoIA')` ou pela tela.

## Memória do agente — dois níveis, não confundir

- **Dossiê** (arquivo Markdown por cliente, `DOSSIES_DIR`) — memória DE UM CLIENTE.
- **Sheet `MemoriaIA`** (`buscar_memoria`/`registrar_memoria`/`remover_memoria`) — regra de PROCESSO, vale pra carteira inteira. Injetada direto no system prompt (não é "ferramenta que o modelo pode esquecer de chamar"), limitada a 25 regras/2000 chars.

## Multi-máquina (fila)

`AcoesIA`, `UsoIA`, `MemoriaIA` são entidades da fila (`server/fila/entidades.cjs`) — em `APP_MODE=client` a escrita vai pra fila, não direto no SQLite. `AnalisesIA` fica DE FORA da fila de propósito (só o servidor gera análise automática). Se for tocar nisso, isole `ONEDRIVE_ROOT` **e** `SQLITE_DIR` nos testes — já vazou pra produção uma vez por falta disso.

## Onde cavar mais fundo

- `CLAUDE.md` (raiz) — seção "IA (`server/ia/`)" tem o histórico completo de bugs reais e o porquê de cada decisão (é mais longo e detalhado que este skill; este é o resumo de referência rápida).
- `server/ia/tools.cjs` — código de cada ferramenta.
- `server/ia/toolsSchema.test.ts` / `server/ia/tools.test.ts` — contrato + casos de regressão.
- `server/ia/normas.cjs` — texto exato de cada norma.
