# monitorIA nas reuniões — design

Data: 23/10/2026. Aprovado em conversa com o usuário, por partes.

## Objetivo

O monitorIA acompanha a reunião com o cliente: transcreve ao vivo, avisa o
monitor por notificação do Windows quando algo merece atenção e, ao fim,
escreve a ata no evento da agenda. Substitui o read.ai (hoje: gravar, baixar a
transcrição e colar no "Gerar ata com IA").

Sucesso: o monitor clica em "Iniciar no Zoom" no evento, conduz a reunião, e
minutos depois do fim a ata está no evento, escrita pelo nosso agente, com o
histórico do cliente.

## Decisões e por quê

| Decisão | Motivo |
|---|---|
| Áudio capturado no computador do monitor, não por bot no Zoom | O bot exige app no Zoom Marketplace, que a conta não permite criar hoje (falta o papel "Zoom for developers"). A captura local funciona já, com Zoom, Meet, Teams ou ligação. Quando o app existir, o bot só troca a fonte do áudio. |
| Transcrição local com Whisper large-v3-turbo (faster-whisper, int8, CPU) | Teste em 22/10/2026 com 10 min de reunião real (Ryzen 5 5600G): acertou "precificação", "CMV", "markup", "DRE financeiro". O Parakeet v3 foi 9× mais rápido, mas errou esses termos e gerou 14 linhas de lixo em inglês/russo (treinado em português de Portugal). Whisper rodou a 2,2× tempo real: dá para ao vivo. |
| Um modelo só, ao vivo e no final | A transcrição ao vivo já é a final; a ata sai minutos depois do fim, sem reprocessar a reunião. |
| Insights por notificação do Windows | Escolha do usuário. Implica texto de até duas linhas e controle de frequência. |
| Sala pessoal do Zoom, não reunião nova | Reunião nova exige a API do Zoom (mesmo app bloqueado). A sala pessoal abre pelo link `zoom.us/s/<id>` sem integração. |
| Áudio apagado após a ata; fica a transcrição em texto | LGPD e espaço. Escolha do usuário. |
| Nada disso no OneDrive | Áudio e transcrição em andamento são pesados e sensíveis; ficam em pasta local (`SQLITE_DIR`). |

## Escopo

Dentro:
- Configuração por máquina: link da sala pessoal do Zoom; download do motor de transcrição.
- No evento: "Iniciar no Zoom" + "Incluir monitorIA" (marcado por padrão), "Copiar convite", indicador "monitorIA ouvindo · N min" e "Encerrar".
- Captura em duas faixas (microfone = monitor, som do computador = "Cliente").
- Transcrição ao vivo com vocabulário da 2D + do cliente.
- Insights ao vivo (4 tipos) por notificação do Windows.
- Ata automática no evento, transcrição anexada, áudio apagado.

Fora (desta versão):
- Bot participante no Zoom (depende do app no Marketplace).
- Reunião nova a cada vez (idem).
- Separar pessoa por pessoa do lado do cliente.
- Concluir o evento sozinho (o monitor revisa e conclui, como hoje).

Só funciona pelo `.exe` de cada monitor (porta 3011). Pelo Apache (`carteira.local:8080`) o backend está em outra máquina e capturaria o áudio errado: os controles do monitorIA não aparecem ali (mesmo critério de `src/enderecoLocal/`).

## Componentes

### 1. `captura.exe` (novo, C#/.NET, self-contained, ~15 MB, vai na release)

Único jeito confiável de capturar o som do computador no Windows (WASAPI
loopback) sem placa de som virtual. Grava duas faixas, 16 kHz mono, em
pedaços de 30 s numa pasta da sessão:
`SQLITE_DIR/reunioes/<sessaoId>/{mic,sistema}-0001.wav`.

Linha de comando: `captura.exe --saida <pasta> --pedaco 30`. Para ao receber
`stop` no stdin ou ao ser encerrado. Escrever em pedaços garante que uma
queda da Carteira ou da máquina não perde o que já foi gravado.

A release (`publicarRelease.cjs`) passa a incluir o binário; `verificarDepsDoServidor` não muda (não é módulo Node).

### 2. Motor de transcrição (novo, baixado sob demanda)

- Python embutido + faster-whisper + modelo `large-v3-turbo` (~1 GB no total), baixados para `SQLITE_DIR/motor-transcricao/` em Configurações → Sistema → "Preparar monitorIA para reuniões", com progresso. Fora da release, que continua leve.
- Fixar a versão do PyAV compatível (o teste quebrou com `av` 19: `open()` sem `metadata_errors`) ou ler o WAV direto, como no teste.
- Processo `transcritor.py` vivo durante a reunião: carrega o modelo uma vez, recebe pedaços pela pasta da sessão, aplica VAD, transcreve com `initial_prompt`/`hotwords` do vocabulário e grava `transcricao.jsonl` (`{inicio, fim, falante, texto}`).
- Limitado a ~metade dos núcleos (`cpu_threads`), para não travar o Zoom. Medir na construção se acompanha em 1×; se atrasar, os insights atrasam, nada se perde.

### 3. Vocabulário (novo, `server/reuniao/vocabulario.cjs`)

Lista passada ao Whisper, montada por reunião:
- fixa da 2D: arquivo versionado `server/reuniao/vocabulario2D.txt` (CMV, markup, DRE, Price, Protocolo GPS, Monitoria, OptiMarco, Raptor, Apura…), editável;
- do cliente: `empresa`, nomes de `lojasCadastro`, nomes dos contatos, produtos e clientes de `catalogoDoCliente` (Alvos — já usado na ata).
Limite de tamanho (o `initial_prompt` do Whisper aceita ~224 tokens): prioriza nomes do cliente, depois o catálogo mais relevante.

### 4. Sessão de reunião (novo, `server/reuniao/sessao.cjs` + rotas em `server/routes/reuniao.cjs`)

Orquestra uma reunião por máquina: inicia/para `captura.exe` e o transcritor, roda o ciclo de insights, detecta o fim, gera a ata.

Rotas (aceitam só requisição que chega direto na porta 3011 desta máquina; via Apache, `X-Forwarded-For` presente, respondem 403):
- `POST /api/reuniao/iniciar` `{eventId, incluirMonitorIA}` → abre a sala (o frontend abre o link) e inicia a captura.
- `GET /api/reuniao/estado` → `{ativa, eventId, minutos, atrasoTranscricao}`.
- `POST /api/reuniao/encerrar`.
- `GET/PUT /api/reuniao/config` → link da sala pessoal (arquivo em `SQLITE_DIR`, padrão de `server/enderecoLocal.cjs`).

Fim da reunião: botão "Encerrar"; ou 5 min de silêncio nas duas faixas; ou 3 h de gravação.

**Eco** (sem fone): após transcrever, um trecho do microfone com texto muito parecido a um trecho do "Cliente" com início a ±3 s é descartado. Limite conhecido: eco baixo transcrito pela metade em fala simultânea pode passar.

### 5. Insights ao vivo (novo, `server/reuniao/insights.cjs`)

A cada 3 min, só se houve transcrição nova: uma chamada `clienteLLM().gerarJSON` (sem ferramentas, padrão de `analiseCliente.cjs`), medida em `UsoIA` com `origem: 'reuniao-ao-vivo'`.

Entrada: dossiê + última análise do cliente; pauta (assunto, descrição, checklist do evento); transcrição nova + resumo curto do que veio antes; insights já enviados.

Saída: `[{tipo: 'historico'|'compromisso'|'pauta'|'risco', texto, chave}]`, `texto` ≤ 2 linhas.

Regras (código, não prompt):
- dedupe por `chave`;
- `pauta` só depois da metade da duração prevista do evento;
- no máximo 1 notificação a cada 2 min; os que chegarem juntos saem agrupados.

Notificação: toast nativo do Windows via PowerShell (WinRT `ToastNotificationManager`), sem dependência nova. Título "monitorIA · <cliente>".

Todos os insights são guardados na sessão e vão para a ata.

Falha do provedor (CLI deslogado, sem internet): sem insights ao vivo; captura e transcrição seguem; a ata é gerada quando o provedor voltar.

### 5b. Pasta da reunião + investigação pelo Claude CLI (aprovado em 23/10/2026)

Ideia do usuário: quando o cliente diz algo crítico, o monitorIA investiga de
verdade (agente com ferramentas), não só reage ao texto.

- **Pasta da reunião** criada ao iniciar a sessão: `SQLITE_DIR/reunioes/<sessaoId>/pasta-cliente/` com `pauta.md`, `dossie.md`, `analise.md`, `atas-anteriores.md` (últimas 5 com ata), `alvos.json` (análise estratégica + resumo de vendas, quando o Alvos tem dado) e `transcricao.txt` (reescrita a cada checagem). Apagada ao encerrar; pastas órfãs (queda da Carteira) apagadas no boot.
- **A checagem de 3 min** devolve também `investigar: [{chave, oQueDisse, porque}]` para o que for crítico (cancelar/reduzir serviço, queixa de resultado, número contestado).
- **Investigação**: `investigar()` no provedor `claude-cli`. O conteúdo da pasta da reunião (com teto por arquivo; transcrição pelo fim) vai **no próprio pedido**, marcado como dado; o agente aprofunda só pelo MCP da carteira, com **todas** as ferramentas nativas negadas, igual ao chat. Verificado em 23/10/2026: com `Read` liberado (mesmo sem `bypassPermissions`) o CLI lia arquivo FORA da pasta — e a fala do cliente, entrada não confiável, está no pedido. Resposta: texto (≤ 220) + linha "O que fazer:" + linha "Fontes:".
- **Limites**: no máximo 5 investigações por reunião, uma por vez, em segundo plano (a checagem não espera). Medido em `UsoIA` com `origem: 'reuniao-investigacao'`. Provedor Ollama: sem investigação (checagem leve segue).
- O resultado vira insight tipo `analise`, passa pelo mesmo limite de notificações e entra na ata com as fontes.

Substitui o tipo "Dado" (números do Alvos sem IA) cogitado antes.

### 6. Ata no final

1. Termina a transcrição pendente.
2. `gerarAtaIA` (já existente; recebe `transcricao`, catálogo do cliente) + seção "Insights da reunião".
3. Salva no evento com a marca "Gerada pelo monitorIA — revise"; anexa `transcricao.txt` (falante + horário).
4. Apaga os WAV da sessão.
5. Toast "Ata pronta · <cliente>".

O evento não é concluído sozinho; a conclusão pelo monitor dispara o fluxo de dossiê que já existe.

Gravação: escrita no evento passa pelo mesmo caminho das outras escritas (`executarMutacao` em `isClient`), já que as máquinas dos monitores são `APP_MODE=client`.

### 7. Frontend

- `EventFormModal`/cartão do evento: "Iniciar no Zoom" + caixa "Incluir monitorIA", "Copiar convite", indicador e "Encerrar". Só quando servido pela porta 3011 e com o link da sala configurado.
- Configurações → Sistema: link da sala pessoal; "Preparar monitorIA para reuniões" (download + estado).

### 8. monitorIA (checklist do CLAUDE.md)

- `buscar_historico_eventos` já devolve a ata; incluir a transcrição anexada como anexo listado.
- Ferramenta nova não é necessária nesta versão: a transcrição é lida pela ata/anexo. Reavaliar se surgir "o que o cliente disse sobre X na reunião de ontem" (busca na transcrição).

## Testes

1. **Automáticos (vitest):** vocabulário por cliente; descarte de eco; dedupe e limite de notificações; regra da pauta pela metade do tempo; fim por silêncio; montagem da ata com insights; rotas recusando fora da porta local. Isolar `ONEDRIVE_ROOT` e `SQLITE_DIR` (ver `server/ia/modoCliente.test.ts`).
2. **Reunião simulada:** modo de teste em que a "captura" toca um arquivo de áudio em tempo real nas duas faixas; roda a gravação "Demonstração Plataforma 2D" (67 min) no `start:dev` e compara a ata com a do read.ai.
3. **Captura real:** chamada Zoom computador ↔ celular, com e sem fone; conferir faixas separadas e eco descartado.
4. **Piloto:** 2–3 reuniões reais do usuário antes de liberar aos outros monitores (cada máquina ativa o recurso em Configurações).

## Riscos

- **CPU durante a reunião:** Whisper + Zoom na mesma máquina. Mitigação: limite de núcleos; medir no teste 2.
- **Máquinas mais fracas que a de produção:** atraso nos insights; a ata sai mais tarde.
- **Consentimento:** o cliente precisa saber que a reunião é gravada (como hoje com o read.ai).
- **Link `zoom.us/s/<id>`:** abrir a sala como anfitrião depende de o Zoom da máquina estar logado na conta do monitor; validar no teste 3.

### 5c. Pré-análise do analisador do Ecossistema + gatilho pela dor do cliente (aprovado em 23/10/2026)

- **Fonte nova, só leitura:** `Ecossistema-Monitoria\analisador\<empresa>\` — `resumo_monitor.json` (série mensal da rede e por loja: receita, CMV, lucro, dias com venda) e `_cache_telas\*.json.gz` (cartões já calculados pelo analisador: `atencao` — fila crítico/atenção/oportunidade com texto, ritmo do mês, lucro, KPIs; `clientes-painel` — novos/recuperados/perdidos, top clientes, concentração; `a-precificar` — produtos que pedem preço novo, lucro perdido/dia, GPS). Cliente → pasta/loja pelo mesmo vínculo dos Dados Alvos (`mapa.cjs`: empresa → { loja: clientId }).
- Cartões só existem para o que alguém abriu no analisador: usar o mais recente (loja do cliente; senão rede) e sempre informar a data dele. Formato de outro sistema: leitura defensiva — cartão ilegível é omitido, nunca derruba a reunião.
- **Material da reunião e do chat:** a pré-análise do analisador entra na pasta da reunião junto da nossa (dossiê, análise, atas, Alvos), na checagem leve e na investigação; e vira ferramenta do chat (`buscar_pre_analise_ecossistema`).
- **Gatilho:** qualquer fala relevante do cliente (dor, dúvida sobre número, produto, cliente final, concorrente, preço) pode pedir investigação — não só o crítico. Teto por reunião: 8, uma por vez.
- **Notificação:** sem marcação markdown; texto e ação com teto de tamanho para caber no balão (o detalhe completo fica no "Ver na Carteira").

### 5d. Investigação de produto + popups da reunião (aprovado em 23/10/2026)

Origem: simulação com dados reais da Pecita (Vela Ignição, Bateria) — `docs`/conversa de 23/10.

**Ferramenta `investigar_produto(clientId, produto)`** — script Python no ambiente do motor de transcrição (DuckDB), lendo os parquet do cliente (`Dados Alvos\<empresa>\*_MOVIMENTO_ATUAL/_PRODUTO.parquet`; compras de `DB\DW\<EMPRESA>\BI\*_MOVIMENTO_ATUAL.parquet`). Devolve JSON com:
- venda no mesmo período (dias 1..hoje) mês atual × anterior × ano anterior, por loja; série mensal de unidades, receita e margem;
- ocorrência de venda e giro (15/30 dias) por loja, pelas regras do transfer (`transfer/docs/REGRAS-NEGOCIO.md` §2–3);
- estoque × máximo do giro por loja e por SKU: excesso, falta, dias de cobertura; transferências sugeridas (SKU, de, para, unidades); quanto ainda precisa comprar para 15 dias;
- clientes importantes (top 150 em receita, sem balcão) que pararam ou caíram no produto;
- custo da última compra × média das anteriores, por fabricante;
- candidatos a promoção: acima do máximo, vendendo em 8+ dos 11 meses, com margem; **exclui** item que o analisador manda reajustar para cima (preço defasado).

Regra de dado: **devolução ao fornecedor (`TIPO_MOVIMENTO = DEVOLUCAO` e `MOV = S`) nunca entra como venda** — na Pecita, R$ 1,13 mi em out/26 faziam a vela parecer em queda.

**Popup do insight** (substitui o balão do Windows para insights; formato aprovado):
- janela Edge `--app` ~436×400 no canto inferior direito, aberta **por cima sem tirar o foco** (`SetWindowPos HWND_TOPMOST + SWP_NOACTIVATE`); vários insights empilham para cima, no máximo 3 visíveis;
- anatomia fixa: cabeçalho mínimo → título-conclusão → 3 números → gráfico → 1 ação com "Feito"; "Ver na Carteira" leva ao detalhe;
- tipos de gráfico: `venda` (barras mensais + linha de margem com marco), `estoque` (dias por loja × linha do ideal), `promocao` (excesso por produto + margem);
- **números e gráficos vêm do JSON da ferramenta**; o modelo só escolhe o tipo e redige título e ação (com teto de caracteres). Insight sem dado não vira popup.

### 5e. Tela ampliada e revisão da ata (pedido do usuário, 23/10/2026)

- **Ampliar:** o popup ganha um botão de ampliar que abre uma **janela local maior** (mesma janela própria com WebView2, ~960×720, centralizada) com a análise completa daquele insight: gráficos maiores, a tabela por loja/SKU, os clientes que caíram, as transferências e as fontes. Não é legenda nem tooltip.
- **Fim da reunião:** ao parar a captura, a transcrição é salva no evento (como hoje) e o monitorIA gera a **ata completa** + **perguntas** (o que ficou em dúvida ou parece errado) + **sugestões**. Abre uma **tela de revisão** (janela local grande): ata editável, perguntas com campo de resposta, "Aplicar respostas" (refaz a ata com as respostas) e **"Salvar ata na reunião"**. A ata NÃO é mais gravada sozinha; o áudio só é apagado depois de salvar (ou ao descartar explicitamente).
