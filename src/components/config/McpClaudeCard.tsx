import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, Play, Plug, Wrench, X } from 'lucide-react';
import {
  buscarMcpClaude, buscarStatusProvedorIA, definirModeloClaude, testarClaudeCli,
  type ResultadoTesteClaude, type StatusMcpClaude, type StatusProvedorIA,
} from '../../api/client';
import { toastError } from '../../utils/toast';
import { Badge, Button, Card, Field, Select } from '../../ui';

/**
 * Painel do MCP da carteira — a ponte entre o Claude Code CLI e as ferramentas
 * do sistema (`server/ia/claudeCli/mcpServidor.cjs`).
 *
 * Existe porque essa é a parte invisível da integração: sem ela, "o agente não
 * achou a ferramenta" não tem como ser diagnosticado pela tela. Mostra o nome
 * QUALIFICADO de cada ferramenta (`mcp__carteira__x`), que é como o CLI a
 * enxerga e como o filtro de `--allowed-tools` casa, e marca quais ESCREVEM —
 * o agente executa sem confirmação prévia, então quem configura precisa ver o
 * que está colocando na mão dele.
 *
 * O botão de testar não é ping: ele roda a cadeia inteira (backend → CLI →
 * MCP → ferramenta → banco → log de auditoria) com uma pergunta de leitura, e
 * devolve quais ferramentas rodaram de fato.
 */
export default function McpClaudeCard() {
  const [status, setStatus] = useState<StatusProvedorIA | null>(null);
  const [mcp, setMcp] = useState<StatusMcpClaude | null>(null);
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoTesteClaude | { erro: string } | null>(null);
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);

  // Encadeado (e não `async`/`await` no corpo): o mesmo padrão de
  // `ProvedorIACard` — o lint do projeto barra `setState` direto no corpo de um
  // efeito, e este `carregar` é chamado por um.
  const carregar = useCallback(
    () => Promise.all([buscarStatusProvedorIA(), buscarMcpClaude()])
      .then(([s, m]) => { setStatus(s); setMcp(m); })
      .catch(() => setStatus(null)),
    [],
  );

  useEffect(() => { carregar(); }, [carregar]);

  async function trocarModelo(modelo: string) {
    setSalvandoModelo(true);
    try {
      await definirModeloClaude(modelo);
      await carregar();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Não foi possível trocar o modelo.');
    } finally {
      setSalvandoModelo(false);
    }
  }

  async function testar() {
    setTestando(true);
    setResultado(null);
    try {
      setResultado(await testarClaudeCli());
    } catch (err) {
      setResultado({ erro: err instanceof Error ? err.message : 'Falha no teste.' });
    } finally {
      setTestando(false);
    }
  }

  // Card só faz sentido no provedor que usa o CLI — no Ollama o loop de
  // ferramentas é do próprio backend, sem MCP nenhum no meio.
  if (!status || !mcp || status.provedor !== 'claude-cli') return null;

  const { claude } = status;
  const escrita = mcp.ferramentas.filter((f) => f.escreve);

  return (
    <Card flat>
      <div className="section-header">
        <h3><Plug size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Ferramentas da carteira no Claude (MCP)</h3>
        <Badge variant={claude.autenticado ? 'success' : 'warning'}>
          {mcp.ferramentas.length} ferramentas
        </Badge>
      </div>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: '0.8rem', margin: '0 0 16px' }}>
        <dt className="text-text-secondary">Servidor MCP</dt>
        <dd style={{ margin: 0 }}><code>{mcp.servidor}</code> (ferramentas expostas como <code>{mcp.prefixo}…</code>)</dd>
        <dt className="text-text-secondary">Ferramentas nativas do CLI</dt>
        <dd style={{ margin: 0 }}>Bloqueadas — arquivo, terminal e web ficam fora do alcance do agente</dd>
        <dt className="text-text-secondary">Pasta de trabalho</dt>
        <dd style={{ margin: 0 }}><code>{mcp.cwd}</code> (vazia, para o CLI não carregar regras do projeto)</dd>
        <dt className="text-text-secondary">Tempo limite por resposta</dt>
        <dd style={{ margin: 0 }}>{mcp.timeoutSegundos}s</dd>
      </dl>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 200 }}>
          <Field label="Modelo do Claude">
            <Select
              value={claude.modelo}
              disabled={claude.modeloTravado || salvandoModelo}
              onChange={(e) => trocarModelo(e.target.value)}
            >
              {mcp.modelos.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
        </div>
        <Button onClick={testar} disabled={testando || !claude.autenticado}>
          {testando ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {testando ? 'Testando...' : 'Testar a integração'}
        </Button>
      </div>

      {claude.modeloTravado && (
        <p className="text-text-secondary" style={{ fontSize: '0.78rem', marginBottom: 14 }}>
          Modelo fixado por <code>CLAUDE_CLI_MODEL</code> no <code>.env</code> desta máquina.
        </p>
      )}

      {resultado && 'erro' in resultado && (
        <p style={{ fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 }}>
          <X size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {resultado.erro}
        </p>
      )}

      {resultado && 'ok' in resultado && (
        <div style={{ fontSize: '0.82rem', marginBottom: 14, display: 'grid', gap: 6 }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Check size={15} /> Respondeu em {resultado.segundos}s
            {resultado.ferramentas.length > 0
              ? ` usando: ${resultado.ferramentas.join(', ')}`
              : ' — sem chamar ferramenta (o MCP pode não ter sido usado nesta pergunta)'}
          </span>
          <blockquote className="text-text-secondary" style={{ margin: 0, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
            {resultado.resposta}
          </blockquote>
        </div>
      )}

      <p style={{ fontSize: '0.8rem', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          {escrita.length} destas ferramentas <strong>alteram dado</strong> ({escrita.map((f) => f.nome).join(', ')}) e o
          agente as executa sem pedir confirmação. Tudo fica registrado no log de ações do Assistente IA.
        </span>
      </p>

      <button
        type="button"
        className="text-text-secondary"
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => setListaAberta((v) => !v)}
      >
        <Wrench size={13} /> {listaAberta ? 'Esconder' : 'Ver'} as {mcp.ferramentas.length} ferramentas
      </button>

      {listaAberta && (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6, fontSize: '0.78rem' }}>
          {mcp.ferramentas.map((f) => (
            <li key={f.nome} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <code style={{ flexShrink: 0 }}>{f.nome}</code>
              {f.escreve && <Badge variant="warning">escreve</Badge>}
              <span className="text-text-secondary">{f.descricao}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
