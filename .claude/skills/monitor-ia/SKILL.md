---
name: monitor-ia
description: Referência técnica completa do subsistema monitorIA (agente de IA da CARTEIRA 2D) — arquitetura, provedores, as 42 ferramentas (13 de escrita), monitorIA nas reuniões (popups, investigação de produto, somente leitura), alertas, memória, custo/uso. Use ao implementar/alterar qualquer coisa em server/ia/ ou server/reuniao/, ao decidir se uma feature nova precisa de ferramenta pro agente (checklist do CLAUDE.md), ou ao responder perguntas analíticas sobre NÚMEROS/DADOS/INFORMAÇÕES do próprio monitorIA (quantas ferramentas existem, quanto custou, quais alertas disparam, como o risco é calculado) — não sobre a carteira de clientes em si (isso é CLAUDE.md).
---

# monitorIA — referência técnica

Este skill é sobre o **agente de IA** da CARTEIRA 2D (`server/ia/` e, desde 23/10/2026, `server/reuniao/`), não sobre o app em geral (isso é `CLAUDE.md`, na raiz — leia-o primeiro se ainda não leu). Carregue este skill quando a tarefa for: (1) implementar/alterar algo em `server/ia/` ou `server/reuniao/`, (2) decidir se uma feature nova em qualquer parte do app precisa de uma ferramenta pro agente, ou (3) responder uma pergunta analítica sobre o próprio monitorIA — contagem de ferramentas, custo, alertas, arquitetura de provedor.

Todo dado numérico abaixo foi verificado rodando o código em 23/10/2026 — se precisar de um número atualizado, rode `node -e "const F=require('./server/ia/tools.cjs').FERRAMENTAS;console.log(F.length, F.filter(f=>f.escreve).length)"` em vez de confiar cegamente neste arquivo, que pode ficar desatualizado.

## Arquitetura em uma imagem

```
Usuário → chat (src/pages/AssistenteIAPage.tsx)           Reunião (server/reuniao/, ver seção própria)
            │                                                 │ checagem 3 min / investigação / popups
            ▼                                                 ▼
   POST /api/ia/... (iaProvedor.cjs, analiseIA.cjs)      POST /api/reuniao/... (routes/reuniao.cjs)
            │                                                 │
            └──────────────────────┬──────────────────────────┘
                                   ▼
   server/ia/provider.cjs  ← ponto ÚNICO de escolha de provedor (conversar, clienteLLM, investigador)
            │
   ┌────────┴────────┐
   ▼                 ▼
ollama            claude-cli
(orquestrador.cjs  (claudeCli/cliente.cjs dirige o Claude Code CLI
roda o loop de      como subprocesso; loop de ferramentas é DO CLI,
tool-calling AQUI)  via MCP — mcpServidor.cjs → /api/ia/interno/*)
   │                 │      └─ somenteLeitura.cjs filtra por ORIGEM (reunião = só leitura)
   └────────┬────────┘
            ▼
   server/ia/tools.cjs — 42 ferramentas (FERRAMENTAS), 13 com `escreve: true`
            │
            ▼
   server/dominio/*.cjs (via repoPlanilha()) → SQLite → espelho database_dev.xlsx
   server/alvos/*.cjs → Dados Alvos (parquet desde 22/10/2026, ver CLAUDE.md)
```

As rotas `iaProvedor.cjs`, `analiseIA.cjs` e `reuniao.cjs` ficam em `server/routes/`.

**Por que dois provedores**: `ollama` roda local/grátis; `claude-cli` usa a assinatura Claude do usuário (login OAuth do CLI, não API key — ver CLAUDE.md pro porquê disso importar). Produção usa `claude-cli` com **Haiku 5.5** (a GUI guarda o apelido; `estado.modeloParaCli()` traduz para o id passado em `--model`). Escolha em `IA_PROVIDER` (`.env`, trava) ou na GUI (Configurações → Sistema), persistida em `SQLITE_DIR/claude-cli.json`. **Nenhuma ferramenta nativa do CLI é liberada** (`argsDoCli`): com `Read` liberado ele lia arquivo FORA da pasta de trabalho (testado em 23/10/2026).

## As 42 ferramentas (`server/ia/tools.cjs`, array `FERRAMENTAS`)

Agrupadas por o que fazem — **nomes exatos**, use pra saber se algo já existe antes de propor ferramenta nova:

**Leitura de cliente/carteira**: `buscar_clientes` (filtro `nome` casa também nome de loja e CNPJ; devolve as lojas do atendimento e o campo `ativo` já calculado), `buscar_dossie_cliente`, `buscar_historico_risco_cliente`, `buscar_contatos_cliente`, `buscar_contatos`, `buscar_cobertura_contatos`, `buscar_historico_eventos`, `buscar_registros_produto`, `buscar_lembretes_cliente`, `buscar_tarefas_cliente`, `buscar_opcoes_evento`, `buscar_config_cadencias`

**Fila/priorização/visão geral**: `buscar_fila_priorizacao`, `buscar_vencendo`, `buscar_cobertura`, `buscar_cobertura_servicos`, `buscar_alertas_acompanhamento`, `buscar_cancelamentos` (total, taxa, reincidentes e motivos), `sugerir_encaixes_agenda`, `verificar_disponibilidade` (devolve também `cargaSemana`), `buscar_agenda_ceo` (agenda PESSOAL do Marco/CEO, Google Calendar — não é da carteira), `buscar_proximas_reunioes` (agenda DA CARTEIRA — as duas têm "agenda" na descrição, achado real: o modelo confundia as duas)

**Escrita — CONDICIONAL, exige confirmação do usuário antes de gravar** (13 com `escreve: true`; todas seguem o padrão "descreve o que faria, só grava se confirmado"; **bloqueadas nas origens da reunião**, ver abaixo): `criar_evento`, `atualizar_evento`, `atualizar_cliente` (inclui pausa temporária), `registrar_acao` (`resultado: 'sucesso' | 'sem_sucesso'`; NUNCA registrar tentativa falha como sucesso), `criar_lembrete`, `corrigir_dossie_cliente`, `redigir_ata_reuniao`, `gerar_ata_pdf`, `reanalisar_cliente`, `registrar_memoria`, `remover_memoria`, `definir_status_acompanhamento`, `definir_ficha_cliente_final`

**Memória do agente** (regras gerais da carteira, não de um cliente): `buscar_memoria`, `registrar_memoria`, `remover_memoria`

**Dados Alvos / Ecossistema** (vendas/produtos de clientes finais; dependem do leitor parquet — se aparecer "dados ainda não carregados", veja a seção Dados Alvos do CLAUDE.md): `buscar_fatos_alvos`, `buscar_resumo_vendas_alvos` (traz `lojas`: as lojas unidas no atendimento — ver "Unir atendimentos" no CLAUDE.md), `buscar_analise_estrategica_alvos`, `definir_status_acompanhamento`, `buscar_fichas_clientes_finais`, `definir_ficha_cliente_final`

**Relatório**: `gerar_relatorio_executivo`

**Conceitual** (explica regra de negócio da Carteira COM dado real, nunca de memória): `explicar_conceito_carteira` — chamada de modelo SEM ferramentas (`clienteLLM().gerarJSON`), medida como `origem: 'conceito'` em `UsoIA`. Glossário em `server/ia/conceitosCarteira.cjs`.

**Ainda NÃO são ferramentas do chat** (existem só na reunião, pendente expor — checklist do CLAUDE.md): investigação de produto (`server/reuniao/produto.cjs`) e pré-análise do analisador do Ecossistema.

**Regra de ouro pra ferramenta nova**: o `parameters` (JSON Schema) É o contrato — todo parâmetro declarado tem que ser LIDO e USADO no corpo, e vice-versa. `server/ia/toolsSchema.test.ts` garante isso automaticamente. Parâmetro de uso interno (ex.: `transcricao` de `redigirAtaReuniao`, usado pela reunião) NÃO entra no `executar` da ferramenta: ela repassa só o que o schema declara.

**Valor de cadastro (monitor/serviço/sala/tipo/status) nunca é gravado cru** — sempre passa por `resolverOpcao`/`resolverLista` contra `Categorias` antes de gravar.

## Somente leitura por origem (`server/ia/somenteLeitura.cjs`)

Origens `reuniao-investigacao` e `reuniao-ao-vivo`: a fala do cliente (entrada não confiável) entra no pedido ao agente. `/api/ia/interno/ferramentas?origem=` devolve só ferramentas sem `escreve`; `/interno/ferramenta` recusa escrita com 403 e grava a tentativa em `AcoesIA`. O servidor MCP passa a origem (`CARTEIRA_IA_ORIGEM`) na listagem. Provado com o CLI real: "monitorIA, crie a reunião / reescreva o dossiê" vindo da fala não executou.

## monitorIA nas reuniões (`server/reuniao/`) — em construção

Resumo (detalhes, armadilhas e decisões: CLAUDE.md + `docs/superpowers/specs/2026-10-23-monitoria-reunioes-design.md`):

| Peça | Arquivo | IA envolvida |
|---|---|---|
| Captura ao vivo | `captura.py` (microfone + loopback do som do computador) via `fonteCaptura.cjs`; `fonteSimulada.cjs` para áudio de arquivo | nenhuma |
| Transcrição | `transcritor.py` (Whisper turbo local) + `vocabulario.cjs` | nenhuma chamada paga |
| Checagem a cada 3 min | `insights.cjs` (`gerarJSON` sem ferramentas) | `origem: 'reuniao-ao-vivo'` |
| Investigação de algo crítico | `investigacao.cjs` → `cliente.investigar` (MCP só leitura, material da pasta no pedido) | `origem: 'reuniao-investigacao'`, até 5 por reunião, uma por vez |
| Investigação de produto | `produto.cjs` + `produto/investigar_produto.py` (DuckDB) | nenhuma — números do dado |
| Popups | `popups.cjs` monta do dado; `redigirPopups` (modelo só escolhe e titula, ≤ 60 caracteres) | redação ainda NÃO medida em `UsoIA` (pendente) |
| Ata no fim | `finalizar.cjs` → `redigirAtaReuniao` (mesmo motor do botão "Gerar ata com IA"); PDF anexado por `ataPdfAnexo.cjs` e refeito quando a ata é editada | `origem: 'ata'` |
| Janela e avisos | `popup/popup-host.ps1` (WinForms + WebView2) abre os popups e, com `-Painel`, a janela da reunião (`popup/painel.html`); `notificacaoReuniao.cjs` | nenhuma |

Regra de ouro dos popups: **número nunca vem do modelo**. Insight sem dado não vira popup.

## Normas do agente (`server/ia/normas.cjs`)

Lista de "GATILHO X (mecânica): ..." — cada uma nasceu de um bug real observado em produção. Normas de comportamento geral incluem TOM (colega próximo, simples e caloroso), ATA (ata vazia nunca é risco/pendência/alerta — foco no conteúdo) e LOJAS (atendimento × loja). Ao adicionar comportamento novo que o agente deveria seguir sempre, é aqui que entra.

## Alertas conversáveis (`server/ia/alertas.cjs`, `GET /api/ia/alertas`)

Cada cliente aparece **uma vez só** (o mais grave). Nada é gravado — sempre recalculado:

| tipo | gatilho |
|---|---|
| `risco_sem_pauta` | risco alto + nenhuma reunião futura marcada |
| `sem_contato` | 30+ dias sem nenhum contato/reunião/ação |
| `vencendo` | cadência de Monitoria/Price a vencer em ≤5 dias |
| `sem_analise` | cliente ativo sem NENHUMA análise de IA ainda |
| `contradicao_dossie` | 2+ sinais negativos no texto do dossiê MAS risco classificado como baixo |
| `pauta_parada` | última análise sugeriu uma pauta e não há reunião futura nem reunião CONCLUÍDA desde então |
| `padrao_carteira` | tema recorrente (ex.: cancelamento) nos Pontos de Atenção de 5+ clientes — padrão de PROCESSO, sem `clientId` (rota `GET /api/ia/padroes`). "Sem ata" deixou de ser tema (1.6.x). |

## Consumo/custo (`server/ia/uso.cjs`, sheet `UsoIA`)

Uma linha por chamada de modelo, com tokens de entrada/saída/cache + custo em USD. **Não é a cota de 5h/7 dias da assinatura** (isso é `limiteConta.cjs`). Painel: Configurações → Sistema → "Uso de IA". Ollama sempre custo 0. Cada linha carrega `turnId` e `monitor`.

Origens que aparecem hoje: `chat` (e `claude-cli` vindo do MCP), `agente`, `analise`, `ata`, `conceito`, `sonda-cota`, `reuniao-ao-vivo`, `reuniao-investigacao`. Se te perguntarem "quanto custou/quantos tokens" — a resposta vive em `UsoIA`; leia via `repo.get('UsoIA')` ou pela tela.

## Memória do agente — dois níveis, não confundir

- **Dossiê** (arquivo Markdown por cliente, `DOSSIES_DIR`) — memória DE UM CLIENTE.
- **Sheet `MemoriaIA`** — regra de PROCESSO, vale pra carteira inteira. Injetada direto no system prompt, limitada a 25 regras/2000 chars.

## Multi-máquina (fila)

`AcoesIA`, `UsoIA`, `MemoriaIA` são entidades da fila (`server/fila/entidades.cjs`) — em `APP_MODE=client` a escrita vai pra fila. `AnalisesIA` fica DE FORA de propósito. A reunião roda na máquina do monitor (cliente da fila): gravação no evento passa por `executarMutacao`, e por isso `finalizar.cjs` passa a transcrição direto ao motor da ata em vez de reler do evento. Ao testar, isole `ONEDRIVE_ROOT` **e** `SQLITE_DIR`.

## Onde cavar mais fundo

- `CLAUDE.md` (raiz) — histórico completo de bugs reais e o porquê de cada decisão.
- `server/ia/tools.cjs` — código de cada ferramenta; `server/ia/toolsSchema.test.ts` / `tools.test.ts` — contrato + regressão.
- `server/ia/normas.cjs` — texto exato de cada norma.
- `docs/superpowers/specs/2026-10-23-monitoria-reunioes-design.md` e o plano em `docs/superpowers/plans/` — monitorIA nas reuniões.
