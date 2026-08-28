#!/usr/bin/env node
/**
 * Servidor MCP (stdio) que expõe as ferramentas da carteira pro Claude Code
 * CLI. **Este arquivo não é `require`d pelo backend** — ele é um executável
 * que o próprio CLI sobe como processo filho, configurado pelo
 * `--mcp-config` que `cliente.cjs` escreve.
 *
 * Por que MCP e não replicar o loop de tool-calling: o CLI é um agente
 * completo, com o loop de ferramentas dele. Fingir que ele é um endpoint de
 * chat cru (mandar o schema no prompt e implorar por JSON) seria brigar com a
 * ferramenta — foi exatamente o problema que `extrairPseudoToolCall` em
 * `orquestrador.cjs` teve que remendar no Ollama. MCP é o mecanismo próprio do
 * CLI pra ferramenta externa, então o loop, o retry e o parsing ficam por
 * conta dele.
 *
 * Por que este processo NÃO abre o SQLite: ele é só um proxy HTTP pra
 * `/api/ia/interno/*` no backend (loopback). Abrir o banco aqui daria um
 * segundo escritor no mesmo arquivo, em paralelo com o servidor — o cenário
 * que `SQLITE_DIR` fora do OneDrive existe justamente pra evitar. Como
 * consequência boa, o log de auditoria (`AcoesIA`) continua sendo gravado em
 * um único lugar (`orquestrador.registrarAcao`, chamado pela rota interna),
 * sem caminho paralelo.
 *
 * Protocolo: JSON-RPC 2.0 em linhas (uma mensagem por linha), que é o
 * transporte stdio do MCP. Implementado à mão, sem o SDK oficial: são três
 * métodos e o projeto não tem dependência de IA nenhuma hoje (nem o cliente
 * do Ollama usa lib) — e dependência nova ainda teria que sobreviver ao
 * empacotamento do launcher.
 */

const URL_BASE = process.env.CARTEIRA_IA_URL;
const SEGREDO = process.env.CARTEIRA_IA_SEGREDO || '';
const ORIGEM = process.env.CARTEIRA_IA_ORIGEM || 'claude-cli';
// Correlaciona esta chamada de ferramenta com a pergunta que a disparou —
// ver `server/ia/uso.cjs`. Vazio quando chamado fora de um `conversar()`
// instrumentado (ex.: uso manual do MCP externo antes desta mudança).
const TURNO = process.env.CARTEIRA_IA_TURNO || '';
// Identidade voluntária de quem perguntou (filtro global de monitor) — ver
// `server/config.cjs` sobre ACOES_IA_HEADERS.monitor.
const MONITOR = process.env.CARTEIRA_IA_MONITOR || '';
const PROTOCOLO_PADRAO = '2025-06-18';

function responder(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

const ok = (id, result) => responder({ jsonrpc: '2.0', id, result });
const erro = (id, code, message) => responder({ jsonrpc: '2.0', id, error: { code, message } });

async function chamarBackend(rota, body) {
  const resp = await fetch(`${URL_BASE}${rota}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-carteira-ia-segredo': SEGREDO },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const texto = await resp.text();
  if (!resp.ok) throw new Error(`backend ${resp.status}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

let ferramentasCache = null;
async function listarFerramentas() {
  if (!ferramentasCache) {
    const { ferramentas } = await chamarBackend('/api/ia/interno/ferramentas');
    ferramentasCache = ferramentas.map((f) => ({
      name: f.name,
      description: f.description,
      inputSchema: f.parameters,
    }));
  }
  return ferramentasCache;
}

async function tratar(msg) {
  const { id, method, params } = msg;

  // Notificação (sem `id`): protocolo proíbe responder. `notifications/initialized`
  // chega sempre depois do handshake.
  if (id === undefined || id === null) return;

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: params?.protocolVersion || PROTOCOLO_PADRAO,
        capabilities: { tools: {} },
        serverInfo: { name: 'carteira-monitoria', version: '1.0.0' },
      });

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: await listarFerramentas() });

    case 'tools/call': {
      const nome = params?.name;
      const argumentos = params?.arguments ?? {};
      try {
        const { resultado } = await chamarBackend('/api/ia/interno/ferramenta', { nome, argumentos, origem: ORIGEM, turnId: TURNO, monitor: MONITOR });
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(resultado) }] });
      } catch (err) {
        // `isError` (e não erro de JSON-RPC): o CLI repassa isso ao modelo
        // como resultado da ferramenta, que é o que a gente quer — o agente
        // vê a falha e decide o que fazer, em vez de a conversa inteira cair.
        return ok(id, { content: [{ type: 'text', text: `Erro ao executar "${nome}": ${err.message}` }], isError: true });
      }
    }

    // Não declaramos essas capacidades no `initialize`, mas cliente que
    // pergunta mesmo assim recebe lista vazia em vez de erro.
    case 'resources/list':
      return ok(id, { resources: [] });
    case 'prompts/list':
      return ok(id, { prompts: [] });

    default:
      return erro(id, -32601, `Método não suportado: ${method}`);
  }
}

if (!URL_BASE) {
  process.stderr.write('CARTEIRA_IA_URL não definida — este processo só roda spawnado pelo Claude Code CLI.\n');
  process.exit(1);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (pedaco) => {
  buffer += pedaco;
  const linhas = buffer.split('\n');
  buffer = linhas.pop() ?? '';
  for (const linha of linhas) {
    if (!linha.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(linha);
    } catch {
      erro(null, -32700, 'JSON inválido');
      continue;
    }
    // Sem `await` no laço de propósito: mensagens MCP podem ser processadas
    // fora de ordem (cada resposta carrega o `id` da requisição), e serializar
    // aqui faria uma ferramenta lenta bloquear o `tools/list` seguinte.
    tratar(msg).catch((err) => erro(msg.id ?? null, -32603, err.message));
  }
});
process.stdin.on('end', () => process.exit(0));
