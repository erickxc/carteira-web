import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader2, LogOut, Sparkles } from 'lucide-react';
import {
  buscarStatusProvedorIA, definirProvedorIA, iniciarLoginClaude, buscarLoginClaude,
  enviarCodigoLoginClaude, cancelarLoginClaude, definirTokenClaude, desconectarContaClaude,
  type ProvedorIA, type StatusProvedorIA,
} from '../../api/client';
import { toastError, toastInfo } from '../../utils/toast';
import { Badge, Button, Card, Field, Input } from '../../ui';

const LABEL: Record<ProvedorIA, string> = {
  ollama: 'Ollama (modelos abertos)',
  'claude-cli': 'Claude Code CLI (conta Claude)',
};

const DESCRICAO: Record<ProvedorIA, string> = {
  ollama: 'Chamada HTTP direta no Ollama local ou na nuvem gratuita. Sem login, sem custo por token.',
  'claude-cli': 'Roda o Claude Code CLI instalado nesta máquina, autenticado com a conta Claude (assinatura) — não usa chave de API. As ferramentas da carteira vão pro CLI por MCP.',
};

// Enquanto o CLI está sendo dirigido, o backend não bloqueia esperando: o
// estado vive no servidor e a tela busca de 2 em 2s. Fluxo depende de ação
// humana no navegador, pode levar minutos.
const INTERVALO_POLL_MS = 2000;
const EM_ANDAMENTO = ['iniciando', 'aguardando_codigo', 'validando'];

/**
 * Configuração do provedor de IA do monitorIA e login da conta Claude.
 *
 * O login é o `claude auth login` do CLI dirigido pelo backend: ele imprime um
 * link de autorização, que aparece aqui; o usuário aprova no navegador, cola o
 * código que o navegador devolve, e o CLI guarda a credencial na máquina.
 *
 * Duas credenciais valem, e a tela precisa dizer QUAL está valendo
 * (`origemCredencial`): o login desta máquina — que pode já existir porque o
 * usuário usa o Claude Code no terminal ou no VS Code, e nesse caso o provedor
 * funciona sem ninguém clicar em nada — ou um token de 1 ano colado à mão
 * (`claude setup-token`). Sem essa distinção, o botão de desconectar prometeria
 * algo que não faz: ele apaga só o token, nunca derruba o login da máquina.
 */
export default function ProvedorIACard() {
  const [status, setStatus] = useState<StatusProvedorIA | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [token, setToken] = useState('');
  const [validandoToken, setValidandoToken] = useState(false);
  const timer = useRef<number | null>(null);

  const carregar = useCallback(() => buscarStatusProvedorIA().then(setStatus).catch(() => setStatus(null)), []);

  useEffect(() => { carregar(); }, [carregar]);

  const estadoLogin = status?.claude.login.estado ?? 'inativo';

  // Poll só enquanto há login em andamento — o resto do tempo esta tela é
  // estática e ficar batendo no backend não muda nada.
  useEffect(() => {
    if (!EM_ANDAMENTO.includes(estadoLogin)) return;
    timer.current = window.setInterval(() => {
      buscarLoginClaude()
        .then((login) => {
          setStatus((atual) => (atual ? { ...atual, claude: { ...atual.claude, login } } : atual));
          // Concluído: recarrega o status inteiro pra refletir `autenticado`.
          if (login.estado === 'concluido') carregar();
        })
        .catch(() => { /* backend reiniciando — próximo tick tenta de novo */ });
    }, INTERVALO_POLL_MS);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [estadoLogin, carregar]);

  async function trocarProvedor(provedor: ProvedorIA) {
    setSalvando(true);
    try {
      await definirProvedorIA(provedor);
      await carregar();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Não foi possível trocar o provedor.');
    } finally {
      setSalvando(false);
    }
  }

  async function conectar() {
    setCodigo('');
    try {
      const login = await iniciarLoginClaude();
      setStatus((atual) => (atual ? { ...atual, claude: { ...atual.claude, login } } : atual));
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao iniciar o login.');
    }
  }

  async function enviarCodigo() {
    try {
      const login = await enviarCodigoLoginClaude(codigo);
      setStatus((atual) => (atual ? { ...atual, claude: { ...atual.claude, login } } : atual));
      setCodigo('');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Código não aceito.');
    }
  }

  async function salvarToken() {
    setValidandoToken(true);
    try {
      await definirTokenClaude(token.trim());
      setToken('');
      toastInfo('Conta Claude conectada.');
      await carregar();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Token inválido.');
    } finally {
      setValidandoToken(false);
    }
  }

  async function desconectar() {
    await desconectarContaClaude().catch(() => toastError('Falha ao desconectar.'));
    await carregar();
  }

  if (!status) return null;

  const { claude, provedor, travado, provedores } = status;
  const login = claude.login;

  return (
    <Card flat>
      <div className="section-header">
        <h3><Sparkles size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />monitorIA — provedor</h3>
        {claude.autenticado && provedor === 'claude-cli' && <Badge variant="success">Conta conectada</Badge>}
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        {provedores.map((p) => (
          <label
            key={p}
            className="check-row"
            style={{ alignItems: 'flex-start', gap: 10, opacity: travado && p !== provedor ? 0.5 : 1 }}
          >
            <input
              type="radio"
              name="provedor-ia"
              checked={provedor === p}
              disabled={travado || salvando}
              onChange={() => trocarProvedor(p)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong style={{ fontSize: '0.9rem' }}>{LABEL[p]}</strong>
              <span className="text-text-secondary" style={{ display: 'block', fontSize: '0.8rem' }}>{DESCRICAO[p]}</span>
            </span>
          </label>
        ))}
      </div>

      {travado && (
        <p className="text-text-secondary" style={{ fontSize: '0.8rem', marginBottom: 14 }}>
          Provedor fixado por <code>IA_PROVIDER</code> no <code>.env</code> desta máquina — trocar aqui está desabilitado de propósito.
        </p>
      )}

      {provedor === 'claude-cli' && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {!claude.cliInstalado ? (
            <p style={{ fontSize: '0.85rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Claude Code CLI não encontrado nesta máquina. Instale com{' '}
                <code>irm https://claude.ai/install.ps1 | iex</code> no PowerShell (ou aponte{' '}
                <code>CLAUDE_CLI_PATH</code> no <code>.env</code>) e recarregue esta página.
              </span>
            </p>
          ) : (
            <>
              <p className="text-text-secondary" style={{ fontSize: '0.8rem', marginBottom: 14 }}>
                CLI: <code>{claude.caminho}</code>{claude.versao ? ` · ${claude.versao}` : ''} · modelo <code>{claude.modelo}</code>
              </p>

              {claude.autenticado ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <span style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={15} />
                    {claude.origemCredencial === 'maquina'
                      ? `Usando o login do Claude Code desta máquina${claude.email ? ` (${claude.email}` : ''}${claude.plano ? `, plano ${claude.plano})` : claude.email ? ')' : ''}.`
                      : 'Usando o token de acesso guardado nesta máquina.'}
                  </span>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Button variant="secondary" onClick={conectar}>Entrar com outra conta</Button>
                    {claude.origemCredencial === 'token' && (
                      <Button variant="secondary" onClick={desconectar}><LogOut size={14} /> Apagar o token</Button>
                    )}
                  </div>
                  {claude.origemCredencial === 'maquina' && (
                    <p className="text-text-secondary" style={{ fontSize: '0.78rem' }}>
                      Esse login é da máquina, compartilhado com o Claude Code no terminal e no VS Code. Para
                      desconectar de verdade, rode <code>claude auth logout</code> — um botão aqui derrubaria o
                      login que você usa fora da carteira.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {!EM_ANDAMENTO.includes(login.estado) && (
                    <Button onClick={conectar}>Conectar conta Claude</Button>
                  )}

                  {EM_ANDAMENTO.includes(login.estado) && (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <p style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Loader2 size={15} className="animate-spin" /> {login.mensagem}
                      </p>

                      {login.link && (
                        <>
                          <a
                            href={login.link}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 6, wordBreak: 'break-all' }}
                          >
                            <ExternalLink size={14} style={{ flexShrink: 0 }} /> Abrir o link de autorização
                          </a>
                          <Field label="Código devolvido pelo navegador">
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="cole o código aqui" />
                              <Button onClick={enviarCodigo} disabled={!codigo.trim()}>Enviar</Button>
                            </div>
                          </Field>
                        </>
                      )}

                      <Button variant="secondary" onClick={() => cancelarLoginClaude().then(carregar)}>Cancelar</Button>
                    </div>
                  )}

                  {login.estado === 'erro' && (
                    <p style={{ fontSize: '0.8rem', marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {login.mensagem}
                    </p>
                  )}

                  <details style={{ marginTop: 16 }}>
                    <summary style={{ fontSize: '0.82rem', cursor: 'pointer' }}>Colar o token manualmente</summary>
                    <p className="text-text-secondary" style={{ fontSize: '0.78rem', margin: '8px 0' }}>
                      Rode <code>claude setup-token</code> num terminal desta máquina e cole aqui o token impresso
                      (vale 1 ano). Alternativa ao login acima — útil se o link não aparecer.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="sk-ant-oat01-..." />
                      <Button onClick={salvarToken} disabled={!token.trim() || validandoToken}>
                        {validandoToken ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}
                      </Button>
                    </div>
                  </details>
                </>
              )}

              {claude.empacotado && (
                <p style={{ fontSize: '0.8rem', marginTop: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  Backend rodando empacotado (pkg): o servidor MCP das ferramentas precisa de um <code>node.exe</code> real
                  e não vai subir. Este provedor só funciona com o backend rodando sob Node.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
