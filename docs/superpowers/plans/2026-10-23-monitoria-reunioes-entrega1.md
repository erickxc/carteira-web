# monitorIA nas reuniões — Entrega 1 (reunião simulada) Implementation Plan

> **Status (30/10/2026): Tasks 1–7 implementadas; Task 8 (ensaio ponta a ponta) e as verificações manuais/reais seguem desmarcadas — não dá para confirmá-las pelo código.** Motivo da atualização: o código já existia (`server/reuniao/`, testes verdes) e os checkboxes nunca foram marcados. Desvios do plano: `notificar.cjs` virou `notificacaoReuniao.cjs` (e os insights hoje saem em janela própria, não em toast); o popup usa `popup/popup-host.ps1` + WebView2 em vez de `abrir-popup.ps1` (removido, não era referenciado); o motor fica em `%LOCALAPPDATA%\CarteiraWeb\motor-transcricao` (`server/reuniao/motor.cjs`), não em `SQLITE_DIR`. Já existe também o que vai além da entrega 1: captura ao vivo (`captura.py`, `fonteCaptura.cjs`), pausa, janela da reunião (`popup/painel.html`) e PDF da ata (`ataPdfAnexo.cjs`).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com um arquivo de áudio tocado no ritmo de uma reunião, a Carteira transcreve ao vivo com Whisper, notifica insights no Windows e, ao encerrar, grava a ata no evento com a transcrição anexada e apaga o áudio.

**Architecture:** O backend (`server/reuniao/`) orquestra uma sessão por máquina: uma fonte (aqui, simulada via ffmpeg) solta pedaços WAV de 30 s numa pasta; um processo Python (`transcritor.py`, faster-whisper) transcreve cada pedaço e anexa linhas em `transcricao.jsonl`; o Node lê esse arquivo, roda o ciclo de insights a cada 3 min (`clienteLLM().gerarJSON`) e, no fim, reaproveita `redigirAtaReuniao` de `server/ia/tools.cjs`. Comunicação Node↔Python só por arquivos na pasta da sessão.

**Tech Stack:** Node CommonJS (Express), vitest, Python 3.12 + faster-whisper 1.2.1 (CPU int8), ffmpeg (já instalado na máquina de dev), PowerShell (toast WinRT), React 19 + TS.

**Spec:** `docs/superpowers/specs/2026-10-23-monitoria-reunioes-design.md`

## Global Constraints

- Fora desta entrega: `captura.exe` real, botão "Iniciar no Zoom", link da sala pessoal, download do motor em Configurações.
- Modelo: `large-v3-turbo`, `device='cpu'`, `compute_type='int8'`, `language='pt'`, `vad_filter=True`, `beam_size=1`. Ler o WAV direto (stdlib `wave` + numpy), nunca `decode_audio` (quebra com PyAV 19: `open() got an unexpected keyword argument 'metadata_errors'`).
- Pedaços: 30 s, 16 kHz, mono, `pcm_s16le`, nomes `mic-0001.wav` / `sistema-0001.wav` (4 dígitos).
- Pasta da sessão: `path.join(SQLITE_DIR, 'reunioes', sessaoId)` — nunca OneDrive.
- Falantes: faixa `mic` = nome do monitor do evento (`monitores[0]`, senão "Monitor"); faixa `sistema` = "Cliente".
- Insights: ciclo a cada 3 min só com transcrição nova; tipos `historico | compromisso | pauta | risco`; `texto` ≤ 160 caracteres; dedupe por `chave`; no máximo 1 notificação a cada 2 min (pendentes saem agrupados); `pauta` só depois de metade de `evento.duracao` (minutos; ausente = 60).
- Fim: botão Encerrar; ou 5 min sem segmento novo de transcrição; ou 3 h de sessão.
- Ata: marca exata na primeira linha: `> Gerada pelo monitorIA — revise antes de concluir.`; seção final `### Insights da reunião`. Evento NÃO é concluído.
- Consumo: `registrarUso` com `origem: 'reuniao-ao-vivo'` nos insights (a ata já registra `origem: 'ata'`).
- Rotas `/api/reuniao/*` respondem 403 quando a requisição tem `X-Forwarded-For` (veio pelo Apache).
- Testes de servidor isolam `ONEDRIVE_ROOT` e `SQLITE_DIR` (padrão de `server/ia/modoCliente.test.ts`). Nunca subir `server.cjs` contra dado de teste.
- Commits só quando o usuário pedir (regra do usuário) — os passos de commit abaixo ficam como "pronto para commit".

## Review Focus

- Evento sem `clientId` (reunião interna): vocabulário só da 2D, insights sem dossiê, ata gerada — não pode lançar. → teste na Task 2 e na Task 5.
- Pedaço WAV ainda sendo escrito quando o transcritor o lê: a fonte grava em `*.tmp` e renomeia; o transcritor ignora `.tmp`. → teste na Task 3.
- Provedor de IA fora do ar no ciclo de insights ou na ata: insights pulam o ciclo sem derrubar a sessão; ata com erro deixa a transcrição salva no evento e o áudio NÃO é apagado. → testes na Task 4 e Task 5.
- Encerrar chamado duas vezes / sem sessão ativa: idempotente, 409 sem sessão. → teste na Task 6.
- Iniciar com sessão já ativa: 409, não sobe segundo transcritor. → teste na Task 6.

---

### Task 1: Motor de transcrição (Python) + script de preparo

**Files:**
- Create: `server/reuniao/transcritor.py`
- Create: `scripts/prepararMotorTranscricao.cjs`
- Modify: `.gitignore` (nada: o venv fica em `SQLITE_DIR`, fora do repo)

**Interfaces:**
- Produces: `python transcritor.py --pasta <dir> --vocab <arquivo.txt> --threads <n>`; lê `mic-NNNN.wav`/`sistema-NNNN.wav` em ordem numérica, ignora `*.tmp`, anexa a `<dir>/transcricao.jsonl` uma linha JSON por segmento `{"faixa":"mic"|"sistema","pedaco":N,"inicio":s,"fim":s,"texto":"..."}` (`inicio`/`fim` em segundos desde o início da reunião = `(N-1)*30 + offset`); grava `<dir>/transcritor.pronto` depois de carregar o modelo; ao achar `<dir>/PARAR` e não restar pedaço pendente, grava `<dir>/transcritor.fim` e sai com 0.
- Produces: `node scripts/prepararMotorTranscricao.cjs` cria `SQLITE_DIR/motor-transcricao/venv` e instala `faster-whisper==1.2.1 numpy`; imprime o caminho do `python.exe`. Caminho lido pelo Node via env `TRANSCRICAO_PYTHON` ou o padrão `SQLITE_DIR/motor-transcricao/venv/Scripts/python.exe`.

- [x] **Step 1:** Escrever `transcritor.py` (loop: listar pasta a cada 1 s; `initial_prompt` = conteúdo de `--vocab`; `cpu_threads` = `--threads`; `hotwords` = mesmo vocabulário).
- [x] **Step 2:** Rodar o preparo: `node scripts/prepararMotorTranscricao.cjs` → imprime caminho do python, `pip list` mostra `faster-whisper 1.2.1`.
- [ ] **Step 3:** Verificação manual: gerar 2 pedaços da gravação de demonstração (`ffmpeg -ss 300 -t 30 ... sistema-0001.wav`, `-ss 330 ... sistema-0002.wav`), rodar o transcritor, criar `PARAR`. Esperado: `transcricao.jsonl` com segmentos em português contendo "precificação", `transcritor.fim` criado, exit 0.
- [x] **Step 4:** Pronto para commit.

### Task 2: Vocabulário (2D + cliente)

**Files:**
- Create: `server/reuniao/vocabulario2D.txt` (um termo por linha: CMV, markup, DRE, DRE financeiro, Price, precificação, Protocolo GPS, Monitoria, OptiMarco, Raptor, Apura, Controladoria, ticket médio, curva ABC, 2D Consultores)
- Create: `server/reuniao/vocabulario.cjs`
- Test: `server/reuniao/vocabulario.test.ts`

**Interfaces:**
- Produces: `montarVocabulario({ cliente, catalogo, base }) -> string` — `cliente` pode ser `undefined`; `catalogo = { produtos: string[], clientes: string[] }`; `base` = linhas do `vocabulario2D.txt` (injetável no teste). Ordem: empresa, nomes de `lojasCadastro`, nomes de `contatos`, base 2D, produtos, clientes do catálogo. Sem duplicados (comparação sem acento/maiúscula). Corta em 800 caracteres na fronteira de termo. Separador `, `.
- Produces: `vocabularioDoEvento(repo, evento) -> string` — lê cliente de `repo.get('Clientes')`, catálogo via `catalogoDoCliente` em try/catch (falha = catálogo vazio).

- [x] **Step 1: Testes**
```ts
it('cliente primeiro, depois 2D, depois catálogo, sem duplicar', () => {
  const v = montarVocabulario({ cliente: { empresa: 'Pecita - Campo Grande', lojasCadastro: [{ nome: 'CAMPO GRANDE' }], contatos: [{ nome: 'Natália' }] },
    catalogo: { produtos: ['Kit Embreagem', 'cmv'], clientes: ['Wellestech'] }, base: ['CMV', 'markup'] });
  expect(v).toBe('Pecita - Campo Grande, CAMPO GRANDE, Natália, CMV, markup, Kit Embreagem, Wellestech');
});
it('sem cliente usa só a base', () => expect(montarVocabulario({ base: ['CMV'] })).toBe('CMV'));
it('corta em 800 caracteres sem partir termo', () => {
  const v = montarVocabulario({ base: Array.from({ length: 200 }, (_, i) => `termo${i}`) });
  expect(v.length).toBeLessThanOrEqual(800); expect(v.endsWith(',')).toBe(false);
});
```
(`contatos` e `lojasCadastro` podem chegar como string JSON — usar o `listaJSON` já usado em `tools.cjs`.)
- [x] **Step 2:** `npx vitest run server/reuniao/vocabulario.test.ts` → FAIL (módulo não existe).
- [x] **Step 3:** Implementar.
- [x] **Step 4:** Mesmo comando → PASS.
- [x] **Step 5:** Pronto para commit.

### Task 3: Fonte simulada + leitura da transcrição + eco

**Files:**
- Create: `server/reuniao/fonteSimulada.cjs`
- Create: `server/reuniao/transcricao.cjs`
- Test: `server/reuniao/transcricao.test.ts`, `server/reuniao/fonteSimulada.test.ts`

**Interfaces:**
- Produces: `iniciarFonteSimulada({ arquivo, pasta, faixa = 'sistema', velocidade = 1, inicioSeg = 0 }) -> { parar(): void, concluida: Promise<void> }` — a cada `30/velocidade` s roda `ffmpeg -ss <t> -t 30 -i <arquivo> -vn -ac 1 -ar 16000 -c:a pcm_s16le <pasta>/<faixa>-NNNN.wav.tmp` e renomeia para `.wav`; termina no fim do arquivo (duração via `ffprobe`).
- Produces: `lerSegmentos(pasta) -> Segmento[]` (`{faixa, pedaco, inicio, fim, texto}`, ignora linha malformada), `descartarEco(segs) -> Segmento[]`, `rotular(segs, nomeMonitor) -> {falante, inicio, fim, texto}[]` ordenado por `inicio`, `formatarTranscricao(rotulados) -> string` com linhas `[mm:ss] Falante: texto`.
- Eco: descarta segmento `mic` quando existe `sistema` com `|inicio diff| <= 3` e similaridade ≥ 0,6 (Jaccard de palavras normalizadas sem acento, ≥ 3 palavras).

- [x] **Step 1: Testes**
```ts
it('descarta eco do microfone', () => {
  const s = [{ faixa: 'sistema', pedaco: 1, inicio: 10, fim: 14, texto: 'a gente pode começar pela plataforma' },
             { faixa: 'mic', pedaco: 1, inicio: 11, fim: 15, texto: 'a gente pode começar pela plataforma' },
             { faixa: 'mic', pedaco: 1, inicio: 20, fim: 22, texto: 'perfeito, vamos lá' }];
  expect(descartarEco(s).map((x) => x.texto)).toEqual(['a gente pode começar pela plataforma', 'perfeito, vamos lá']);
});
it('formata com falante e minuto', () => {
  expect(formatarTranscricao(rotular([{ faixa: 'mic', pedaco: 3, inicio: 75, fim: 78, texto: 'Oi' }], 'Erick Cardoso')))
    .toBe('[01:15] Erick Cardoso: Oi');
});
it('linha malformada no jsonl é ignorada', () => { /* grava 2 linhas válidas + 'xx' numa pasta temp; espera 2 */ });
```
`fonteSimulada.test.ts`: gera 65 s de seno com `ffmpeg -f lavfi -i sine=d=65`, roda com `velocidade: 30`, espera `concluida`; asserta `sistema-0001.wav`..`0003.wav` e nenhum `.tmp`. Pular (`it.skipIf`) se `ffmpeg` não estiver no PATH.
- [x] **Step 2:** `npx vitest run server/reuniao/` → FAIL.
- [x] **Step 3:** Implementar os dois módulos.
- [x] **Step 4:** Mesmo comando → PASS.
- [x] **Step 5:** Pronto para commit.

### Task 4: Insights ao vivo + notificação

**Files:**
- Create: `server/reuniao/insights.cjs`, `server/reuniao/notificar.cjs`
- Test: `server/reuniao/insights.test.ts`

**Interfaces:**
- Consumes: `clienteLLM` (`server/ia/provider.cjs`), `registrarUso` (`server/ia/uso.cjs`), `lerDossieCliente` (`server/ia/analisesAutomaticas.cjs`).
- Produces: `montarPromptInsights({ cliente, dossie, analise, evento, resumoAnterior, trechoNovo, jaEnviados, podePauta }) -> string` — instrui JSON `{"resumo": string, "insights": [{"tipo","texto","chave"}]}`; `resumo` ≤ 600 caracteres (vira `resumoAnterior` no próximo ciclo); proíbe tipo `pauta` quando `podePauta` é false; tom das normas TOM/ATA de `server/ia/normas.cjs` (ata vazia nunca é assunto).
- Produces: `criarCicloInsights({ repo, evento, llm = clienteLLM(), notificar, agora = () => Date.now() }) -> { rodar(trechoNovo: string): Promise<void>, enviados(): Insight[] }` — `rodar` com trecho vazio não chama o LLM; erro do LLM é logado e o ciclo segue; filtra `chave` repetida e `pauta` antes de metade da duração (contada do primeiro `rodar`); fila de notificações com intervalo mínimo de 120 s; várias pendentes viram uma notificação com textos unidos por ` · `.
- Produces: `notificar({ titulo, texto }) -> void` em `notificar.cjs` — `spawn('powershell', ['-NoProfile', '-Command', script])` com toast WinRT; título/texto passados por variável de ambiente (nunca interpolados no script). Erro só é logado.

- [x] **Step 1: Testes** (LLM falso `{ gerarJSON: async () => ({ resumo: 'r', insights: [...] }) }`, `notificar` = `vi.fn()`, relógio controlado)
```ts
it('não chama o LLM sem trecho novo', async () => { await ciclo.rodar(''); expect(llm.gerarJSON).not.toHaveBeenCalled(); });
it('mesma chave avisa uma vez', async () => { /* 2 rodadas devolvendo chave 'margem' */ expect(notificar).toHaveBeenCalledTimes(1); });
it('pauta antes da metade é descartada', async () => { /* duracao 60, rodar no minuto 10 com tipo pauta */ expect(ciclo.enviados()).toEqual([]); });
it('duas em menos de 2 min saem juntas', async () => { /* 2 insights no mesmo ciclo */ expect(notificar).toHaveBeenCalledWith(expect.objectContaining({ texto: 'A · B' })); });
it('LLM falhando não lança', async () => { llm.gerarJSON = async () => { throw new Error('fora'); }; await expect(ciclo.rodar('oi')).resolves.toBeUndefined(); });
it('evento sem cliente monta prompt sem dossiê', () => { expect(() => montarPromptInsights({ evento: { subject: 'Interna' }, trechoNovo: 'x', jaEnviados: [], podePauta: false })).not.toThrow(); });
```
- [x] **Step 2:** `npx vitest run server/reuniao/insights.test.ts` → FAIL.
- [x] **Step 3:** Implementar. Uso registrado com `origem: 'reuniao-ao-vivo'` quando `repo` vier.
- [ ] **Step 4:** Mesmo comando → PASS. Verificação manual do toast: `node -e "require('./server/reuniao/notificar.cjs').notificar({titulo:'monitorIA · Teste',texto:'Aparece?'})"` → toast no canto da tela.
- [x] **Step 5:** Pronto para commit.

### Task 4b: Pasta da reunião + investigação pelo CLI

(Acrescentada em 23/10/2026 — spec §5b.)

**Files:**
- Create: `server/reuniao/pastaReuniao.cjs`, `server/reuniao/investigacao.cjs`
- Modify: `server/ia/claudeCli/cliente.cjs` (opção `pastaLeitura` em `rodarCli` + `investigar` exportada), `server/ia/provider.cjs` (exporta `investigar`, `null` fora do claude-cli)
- Modify: `server/reuniao/insights.cjs` (campo `investigar` no JSON; dispara investigação)
- Test: `server/reuniao/pastaReuniao.test.ts`, `server/reuniao/investigacao.test.ts`, `server/ia/claudeCli/cliente.test.ts` (se existir; senão no de investigação, com spawn falso)

**Interfaces:**
- Produces: `criarPastaReuniao({ repo, evento, pastaSessao, alvos = consultaAlvos }) -> string` (caminho de `pasta-cliente`); `atualizarTranscricaoNaPasta(pasta, texto)`; `apagarPastaReuniao(pastaSessao)`; `limparPastasOrfas(raizReunioes, sessaoAtivaId)`.
- Produces: `investigar({ prompt, cwd, origem, repo, monitor }) -> Promise<string>` em `cliente.cjs`: `rodarCli` com `pastaLeitura: cwd` → `cwd` do processo = pasta; `--disallowed-tools` sem `Read,Glob,Grep`; `--allowed-tools mcp__carteira`; **sem** `--permission-mode bypassPermissions`.
- Produces: `criarInvestigador({ cwd, repo, monitor, investigar, limite = 5 }) -> { pedir(item): boolean, ocupado(): boolean, total(): number }` — `pedir` recusa (false) se ocupado, se `chave` já investigada ou se atingiu `limite`; ao terminar chama `aoConcluir({ tipo: 'analise', texto, fontes, chave })`.
- `criarCicloInsights` ganha `investigador` (opcional); repassa cada `investigar[]` do JSON a `investigador.pedir`.

- [x] **Step 1: Testes**
```ts
it('pasta da reunião tem pauta, dossiê e transcrição; sem cliente não lança', ...);
it('alvos indisponível → sem alvos.json, demais arquivos criados', ...);
it('limparPastasOrfas apaga pasta-cliente de sessão que não é a ativa', ...);
it('investigador: uma por vez, sem repetir chave, no máximo 5', ...);
it('resposta do agente separa texto e linha "Fontes:"', ...);
it('rodarCli com pastaLeitura não passa bypassPermissions e libera Read/Glob/Grep', ...); // spawn falso, inspeciona args
```
- [x] **Step 2:** `npx vitest run server/reuniao/` → FAIL nos novos.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** PASS + `npx vitest run server/ia/` verde.
- [ ] **Step 5: Verificação real de confinamento** (VERIFICAR do spec): pasta temp com `a.txt`; `investigar({ prompt: 'Leia a.txt e depois leia C:/Windows/win.ini e diga a primeira linha de cada' , cwd })`. Esperado: lê `a.txt`; leitura de `win.ini` negada. Se o CLI ler fora: parar e trocar por cópia em pasta + `--add-dir` ou negar `Read` com regra de caminho (Ruling no ledger).

### Task 4c: Ferramenta investigar_produto (Python + DuckDB)

(Acrescentada em 23/10/2026 — spec §5d.)

**Files:** Create `server/reuniao/produto/investigar_produto.py`, `server/reuniao/produto.cjs`; Modify `scripts/prepararMotorTranscricao.cjs` (instala `duckdb`); Test `server/reuniao/produto.test.ts` (fixtures parquet gerados no teste via duckdb; pula sem Python/duckdb).

**Interfaces:**
- `python investigar_produto.py --alvos <dir> --dw <dir> --empresa <nome> --produto <harmonizado> [--lojas l1,l2] [--fim AAAA-MM-DD]` → JSON `{ vendaMesmoPeriodo[], serieMensal[], porLoja[{loja, ocorrenciaPct, vendasSemana, giro, d15, estoque, maximo, diasCobertura, excesso, falta}], transferencias[{cod, fab, de, para, un}], comprar{skus, un, rs}, clientesQueCairam[], custoCompras[], promocao[] }`.
- `investigarProduto({ clientId, produto, repo }) -> Promise<objeto>` em `produto.cjs` (resolve empresa/lojas pelo vínculo do Alvos; caminhos por env `ALVOS_DIR`/`DW_DIR`).
- Regras: devolução `MOV = S` fora; D15 = (2·S1+S2)/3·2; Máximo = ⌈⌈D15⌉·1,12⌉; promoção exclui `prod` presente em `a-precificar` com reajuste > 0.

- [x] Testes (fixture com 2 lojas, 3 meses, 1 devolução ao fornecedor): devolução S não reduz a venda; excesso/falta/transferência corretos; promoção exclui item a reajustar.
- [ ] FAIL → implementar → PASS; verificação real: Pecita/Bateria reproduz a simulação (Matriz 128 dias, excesso 91 un).

### Task 4d: Popup do insight

**Files:** Create `server/reuniao/popup/popup.html` (template, CSS da Carteira, 3 tipos de gráfico em SVG), `server/reuniao/popup.cjs` (servir + abrir), `server/reuniao/popup/abrir-popup.ps1`; Modify `server/routes/reuniao.cjs` (`GET /api/reuniao/popup/:id` e JSON), `server/reuniao/insights.cjs` (insight ganha `{titulo, numeros[3], grafico{tipo,dados}, acao{icone,titulo,sub}}`), `server/reuniao/investigacao.cjs` (agente chama `investigar_produto` e devolve o JSON do insight).

**Interfaces:**
- `abrirPopup({ id, url, empilhar })` → spawn do ps1 (Edge `--app`, topmost sem foco, posição empilhada).
- Insight sem `numeros`/`grafico` vindos da ferramenta → cai na notificação curta (`notificacaoReuniao.cjs`), nunca popup vazio.

- [x] Teste do template (jsdom ou string): 3 tipos de gráfico renderizam com os dados da simulação; texto do título/ação cortado no teto.
- [ ] Verificação real: popup da Bateria abre por cima sem tirar o foco.

### Task 5: Ata ao encerrar

**Files:**
- Modify: `server/ia/tools.cjs` — exportar `redigirAtaReuniao` (sem mudar comportamento).
- Create: `server/reuniao/finalizar.cjs`
- Test: `server/reuniao/finalizar.test.ts`

**Interfaces:**
- Consumes: `redigirAtaReuniao(repo, { eventId, salvar: false }) -> { ataCompleta }`, `executarMutacao('agenda','update',{ id, patch })`, `UPLOADS_DIR`, `formatarTranscricao`/`rotular`/`descartarEco`/`lerSegmentos` (Task 3).
- Produces: `finalizarReuniao({ repo, eventId, pasta, insights, nomeMonitor, redigir = redigirAtaReuniao, mutar = executarMutacao }) -> Promise<{ ok: boolean, erro?: string }>`:
  1. monta a transcrição e grava `patch { transcricao }` no evento (antes da IA — se a ata falhar, o texto não se perde);
  2. `redigir` com `salvar: false`; prefixa a marca e acrescenta `### Insights da reunião` (bullets `- <texto>`, ou `- Nenhum.`);
  3. grava `transcricao-<data>.txt` em `UPLOADS_DIR` e `patch { ata, attachments: [...existentes, novo] }`;
  4. só então apaga os `*.wav` da pasta;
  5. erro em 2 ou 3: devolve `{ ok: false, erro }`, mantém os WAV.

- [x] **Step 1: Testes** (`mutar = vi.fn()`, `redigir` falso, pasta temp com 2 WAV e um jsonl, `UPLOADS_DIR` isolado via env)
```ts
it('salva transcrição antes da ata, ata com marca e insights, apaga wav', async () => {
  const r = await finalizarReuniao({ ...base, insights: [{ texto: 'Margem em queda' }] });
  expect(r.ok).toBe(true);
  expect(mutar.mock.calls[0][2].patch).toHaveProperty('transcricao');
  const ata = mutar.mock.calls[1][2].patch.ata;
  expect(ata.startsWith('> Gerada pelo monitorIA — revise antes de concluir.')).toBe(true);
  expect(ata).toContain('### Insights da reunião\n- Margem em queda');
  expect(fs.readdirSync(pasta).filter((f) => f.endsWith('.wav'))).toEqual([]);
});
it('falha da IA mantém o áudio e a transcrição salva', async () => {
  const r = await finalizarReuniao({ ...base, redigir: async () => { throw new Error('fora'); } });
  expect(r).toEqual({ ok: false, erro: 'fora' });
  expect(fs.readdirSync(pasta).filter((f) => f.endsWith('.wav')).length).toBe(2);
});
```
- [x] **Step 2:** `npx vitest run server/reuniao/finalizar.test.ts` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** PASS; `npx vitest run server/ia/` continua verde (export novo não quebra `toolsSchema.test`).
- [x] **Step 5:** Pronto para commit.

### Task 6: Sessão + rotas

**Files:**
- Create: `server/reuniao/sessao.cjs`, `server/routes/reuniao.cjs`
- Modify: `server.cjs` (montar `app.use('/api/reuniao', require('./server/routes/reuniao.cjs'))` junto das outras rotas, linha ~214)
- Test: `server/reuniao/sessao.test.ts`, `server/routes/reuniao.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `iniciarSessao({ repo, eventId, simularArquivo, velocidade, deps }) -> Estado`; `estadoSessao() -> { ativa, eventId, minutos, atrasoSeg, fase: 'ouvindo'|'finalizando'|'concluida'|'erro', erro? }`; `encerrarSessao() -> Promise<Estado>`. `deps` injeta `spawnTranscritor`, `iniciarFonte`, `finalizar`, `criarCicloInsights`, `agora` (testes sem Python/ffmpeg).
- Loop a cada 10 s: lê segmentos novos; a cada 180 s passa o texto novo (formatado) ao ciclo de insights; encerra sozinho com 300 s sem segmento novo (após o primeiro) ou 3 h.
- Encerrar: para a fonte, cria `PARAR`, espera `transcritor.fim` (timeout 10 min), roda `finalizar`, fase `concluida` (ou `erro`), notifica "Ata pronta · <cliente>".
- Ao iniciar: grava `<pasta>/vocabulario.txt` com `vocabularioDoEvento(repo, evento)` e passa como `--vocab`.
- Threads do transcritor: `Math.max(2, Math.floor(os.cpus().length / 2))`.
- Rotas: `POST /iniciar {eventId, simularArquivo, velocidade}` (400 sem `eventId`/`simularArquivo` nesta entrega; 404 evento inexistente; 409 sessão ativa), `GET /estado`, `POST /encerrar` (409 sem sessão ativa ou já finalizando). Middleware: 403 se `req.headers['x-forwarded-for']`.

- [x] **Step 1: Testes** (deps falsas; relógio controlado)
```ts
it('409 ao iniciar com sessão ativa', ...);
it('encerra sozinha após 5 min sem segmento novo', ...);
it('encerrar duas vezes: segunda é 409, finalizar chamado uma vez', ...);
it('rota recusa requisição vinda do Apache', async () => { /* header x-forwarded-for → 403 */ });
```
- [x] **Step 2:** `npx vitest run server/reuniao/sessao.test.ts server/routes/reuniao.test.ts` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** PASS. `npm test` inteiro verde (os 2 flaky de `server/fila/` passam ao reexecutar).
- [x] **Step 5:** Pronto para commit.

### Task 7: Painel de teste no evento (só dev)

**Files:**
- Modify: `src/api/client.ts` (`iniciarReuniao`, `estadoReuniao`, `encerrarReuniao`)
- Create: `src/components/agenda/ReuniaoMonitorIA.tsx`
- Modify: `src/components/EventFormModal.tsx` (renderiza o painel em modo edição quando `import.meta.env.DEV`)

**Interfaces:**
- Consumes: rotas da Task 6.
- Produces: painel com campo "Arquivo de áudio (caminho)", velocidade (1× / 4×), "Simular reunião"; enquanto ativa: "monitorIA ouvindo · N min" (polling de `/estado` a cada 5 s) e "Encerrar"; ao concluir, recarrega o evento (`ata`/`attachments`) via o CRUD do `CarteiraContext`.
- Visual: componentes de `src/ui` (Button secondary/sm, Field, Input), sem cor nova, sem ponto colorido (memória "Status sem enfeite").

- [x] **Step 1:** Implementar; `npx tsc -b` e `npx eslint src/components/agenda/ReuniaoMonitorIA.tsx src/components/EventFormModal.tsx` limpos.
- [x] **Step 2:** Pronto para commit.

### Task 8: Ensaio ponta a ponta no start:dev

- [ ] **Step 1:** `npm run start:dev`; abrir `http://127.0.0.1:5173/agenda`, editar uma reunião da Pecita na cópia `.dev`.
- [ ] **Step 2:** Simular com `C:\Users\Kerol\Downloads\Demonstração Plataforma 2D Gravação.mp4`, velocidade 1×, por 15 min. Esperado: indicador subindo; `transcricao.jsonl` crescendo; ao menos um toast "monitorIA · Pecita…"; Gerenciador de Tarefas: Python ≤ ~50% de CPU.
- [ ] **Step 3:** Encerrar. Esperado em até ~3 min: ata no evento com a marca e `### Insights da reunião`, anexo `transcricao-*.txt`, nenhum `.wav` na pasta da sessão, toast "Ata pronta".
- [ ] **Step 4:** Mostrar ao usuário (prints da ata + toast) antes de qualquer release — memória "UI: mostrar local antes de publicar".
