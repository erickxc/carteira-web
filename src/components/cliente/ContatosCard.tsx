import { AlertTriangle, MessageCircle, Pencil, Trash2, UserPlus, Users2 } from 'lucide-react';
import { linkWhatsApp } from '../../utils/whatsapp';
import type { ContatoVisivel } from '../../utils/contatos';
import { Badge, Button, Card, Chip, Input } from '../../ui';
import type { Cliente, Contato } from '../../types';

interface ContatosCardProps {
  cliente: Cliente;
  /** Contatos visíveis (próprios + herdados do grupo). */
  contatos: ContatoVisivel[];
  servicosSemContato: string[];
  servicoOpcoes: string[];
  onWhatsApp: (contato: Contato) => void;
  onAlternarEscopo: (contatoId: string) => void;
  onRemover: (contatoId: string) => void;
  onIrParaOrigem: (clienteId: string) => void;
  contatoNome: string;
  setContatoNome: (v: string) => void;
  contatoCargo: string;
  setContatoCargo: (v: string) => void;
  contatoTelefone: string;
  setContatoTelefone: (v: string) => void;
  contatoServicos: string[];
  onToggleServico: (s: string) => void;
  contatoDoGrupo: boolean;
  setContatoDoGrupo: (v: boolean) => void;
  onAdicionar: () => void;
}

/**
 * Cartão "Contatos" da ficha do cliente — extraído de ClienteDetailPage.tsx,
 * mesmo comportamento (lista de contatos visíveis + formulário de novo
 * contato). Compartilhar/parar de compartilhar e remover só se aplicam a
 * contatos gravados NESTE cliente (não aos herdados do grupo).
 */
export function ContatosCard({
  cliente, contatos, servicosSemContato, servicoOpcoes, onWhatsApp, onAlternarEscopo, onRemover, onIrParaOrigem,
  contatoNome, setContatoNome, contatoCargo, setContatoCargo, contatoTelefone, setContatoTelefone,
  contatoServicos, onToggleServico, contatoDoGrupo, setContatoDoGrupo, onAdicionar,
}: ContatosCardProps) {
  return (
    <Card flat style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h3>Contatos</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{contatos.length}</span>
      </div>

      {servicosSemContato.length > 0 && (
        <div className="flex-row" style={{ gap: 6, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
          <AlertTriangle size={14} className="text-[color:var(--warning)] shrink-0" />
          <span className="text-text-secondary">
            Sem contato responsável por <strong>{servicosSemContato.join(', ')}</strong> — só há contatos de outros serviços.
          </span>
        </div>
      )}

      {contatos.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: 12 }}>Nenhum contato cadastrado.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {contatos.map((c) => (
            <div key={c.id} className="flex-between" style={{ gap: 12, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--card-hover)', borderRadius: 6 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{c.nome}</strong>
                {c.cargo && <span className="text-text-muted" style={{ fontSize: 13 }}> · {c.cargo}</span>}
                {c.telefone && <div className="text-text-muted" style={{ fontSize: 13 }}>{c.telefone}</div>}
                <div className="flex-row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                  {(c.servicos ?? []).length === 0 ? (
                    <Badge variant="muted" style={{ fontSize: 10 }}>Geral</Badge>
                  ) : (
                    (c.servicos ?? []).map((s) => (<Badge key={s} variant="accent" style={{ fontSize: 10 }}>{s}</Badge>))
                  )}
                  {/* Herdado de outra loja do grupo: mostra de onde vem, porque
                      editar/remover só é possível na loja de origem. */}
                  {c.doGrupo ? (
                    <Badge variant="success" style={{ fontSize: 10 }} title={`Cadastrado em ${c.origemEmpresa} e compartilhado com o grupo`}>
                      <Users2 size={10} /> do grupo · {c.origemEmpresa}
                    </Badge>
                  ) : c.escopo === 'grupo' ? (
                    <Badge variant="success" style={{ fontSize: 10 }} title="Aparece em todas as lojas deste grupo">
                      <Users2 size={10} /> vale para o grupo
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="flex-row" style={{ gap: 6 }}>
                <Button
                  variant="success"
                  onClick={() => (linkWhatsApp(c.telefone) ? onWhatsApp(c) : undefined)}
                  disabled={!linkWhatsApp(c.telefone)}
                  title={linkWhatsApp(c.telefone) ? 'Enviar mensagem no WhatsApp' : 'Telefone inválido'}
                >
                  <MessageCircle size={15} /> WhatsApp
                </Button>
                {/* Compartilhar/parar de compartilhar só faz sentido em cliente
                    de grupo, e só no contato gravado aqui. */}
                {!c.doGrupo && cliente.grupo && (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => onAlternarEscopo(c.id)}
                    title={c.escopo === 'grupo'
                      ? 'Deixar de compartilhar com as outras lojas do grupo'
                      : 'Compartilhar este contato com todas as lojas do grupo'}
                  >
                    <Users2 size={15} />
                  </Button>
                )}
                {!c.doGrupo ? (
                  <Button variant="danger" size="icon" onClick={() => onRemover(c.id)} title="Remover contato">
                    <Trash2 size={15} />
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => onIrParaOrigem(c.origemClienteId)}
                    title={`Editar em ${c.origemEmpresa}`}
                  >
                    <Pencil size={15} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div className="flex-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: '1 1 180px' }}>
            <Input placeholder="Nome" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdicionar()} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <Input placeholder="Cargo" value={contatoCargo} onChange={(e) => setContatoCargo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdicionar()} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <Input placeholder="Telefone (DDD + número)" value={contatoTelefone} onChange={(e) => setContatoTelefone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdicionar()} />
          </div>
        </div>
        {servicoOpcoes.length > 0 && (
          <div className="flex-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Atende
            </span>
            {servicoOpcoes.map((s) => (
              <Chip variant="toggle" key={s} active={contatoServicos.includes(s)} onClick={() => onToggleServico(s)}>{s}</Chip>
            ))}
            <span className="text-text-muted" style={{ fontSize: 12 }}>
              {contatoServicos.length === 0 ? '(nenhum marcado = contato geral)' : ''}
            </span>
          </div>
        )}
        {/* Só aparece em cliente de grupo: é o caso em que a mesma pessoa pode
            atender mais de uma loja. */}
        {cliente.grupo && (
          <label className="check-row" style={{ fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" checked={contatoDoGrupo} onChange={(e) => setContatoDoGrupo(e.target.checked)} />
            Este contato atende todas as lojas do grupo <strong>{cliente.grupo}</strong>
          </label>
        )}
        <Button variant="primary" onClick={onAdicionar} disabled={!contatoNome.trim()}>
          <UserPlus size={15} /> Adicionar contato
        </Button>
      </div>
    </Card>
  );
}
