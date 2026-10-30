import type { ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import { Button, Card } from '../../ui';
import { linkWhatsApp } from '../../utils/whatsapp';
import type { ContatoVisivel } from '../../utils/contatos';
import { resumoDaConversa, type ResumoFicha } from '../../utils/resumoFicha';
import type { Cliente, Contato } from '../../types';
import { ListaAcessos } from './AcessosExternosButton';
import { AnaliseIACard } from './AnaliseIACard';

const CONTATOS_NO_PAINEL = 3;

interface PainelFichaProps {
  cliente: Cliente;
  resumo: ResumoFicha;
  /** Já com os herdados do grupo (`contatosVisiveis`). */
  contatos: ContatoVisivel[];
  onWhatsApp: (contato: Contato) => void;
  onVerContatos: () => void;
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Card flat style={{ minWidth: 0 }}>
      <div className="section-header"><h3>{titulo}</h3></div>
      {children}
    </Card>
  );
}

const Vazio = ({ children }: { children: ReactNode }) => (
  <p className="text-[0.82rem] text-text-muted" style={{ margin: 0 }}>{children}</p>
);

/** A cor vai no próprio número (design 1.6). Token `-fg`: o vivo não passa AA no tema claro. */
function ValorPrazo({ prazo }: { prazo: ResumoFicha['prazos'][number] }) {
  if (prazo.independente) return <span className="text-text-muted">independente</span>;
  // 'nunca' vem antes de qualquer conta: sem data de cadastro o atraso é negativo.
  if (prazo.status === 'nunca') return <span className="text-[color:var(--danger-fg)] font-semibold">nunca atendido</span>;
  const atraso = prazo.atraso ?? 0;
  if (prazo.status === 'vencido') return <span className="text-[color:var(--danger-fg)] font-semibold">+{atraso} d</span>;
  const cor = prazo.status === 'vencendo' ? 'text-[color:var(--warning-fg)]' : 'text-[color:var(--success-fg)]';
  return <span className={`${cor} font-semibold`}>{atraso === 0 ? 'vence hoje' : `${-atraso} d`}</span>;
}

function LinhaReuniao({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="text-[0.75rem] text-text-muted">{rotulo}</div>
      {children}
    </div>
  );
}

/** O que se consulta ao abrir o cliente, sem rolar. Bloco sem dado mantém a linha curta: o layout não pula. */
export function PainelFicha({ cliente, resumo, contatos, onWhatsApp, onVerContatos }: PainelFichaProps) {
  const { prazos, ultima, proxima } = resumo;
  const resumoUltima = ultima ? resumoDaConversa(ultima) : '';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginBottom: 16 }}>
      <Bloco titulo="Prazos">
        {prazos.length === 0 ? <Vazio>Sem produto com prazo</Vazio> : (
          <div className="flex flex-col gap-1.5 text-[0.85rem]">
            {prazos.map((p) => (
              <div key={p.servico} className="flex-between" style={{ gap: 12 }}>
                <span className="text-text-secondary">{p.servico}</span>
                <ValorPrazo prazo={p} />
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Bloco titulo="Reuniões">
        <div className="flex flex-col gap-3 text-[0.85rem]">
          <LinhaReuniao rotulo="Última">
            {ultima ? (
              <>
                <div>{[format(parseISO(ultima.date), 'dd/MM'), ultima.type, ultima.subject].filter(Boolean).join(' · ')}</div>
                {resumoUltima && <div className="text-text-muted truncate" title={resumoUltima}>{resumoUltima}</div>}
              </>
            ) : <Vazio>Nenhuma conversa concluída</Vazio>}
          </LinhaReuniao>
          <LinhaReuniao rotulo="Próxima">
            {proxima ? (
              <div>
                {format(parseISO(proxima.date), 'dd/MM')}{proxima.time ? ` ${proxima.time}` : ''} · {proxima.subject || proxima.type}
                {/pendente/i.test(proxima.status) && <span className="text-text-muted"> (pendente)</span>}
              </div>
            ) : <Vazio>Nenhuma reunião marcada</Vazio>}
          </LinhaReuniao>
        </div>
      </Bloco>

      <Bloco titulo="monitorIA">
        <AnaliseIACard clienteId={cliente.id} compacto />
      </Bloco>

      <Bloco titulo="Contatos e acessos">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 text-[0.85rem]">
            {contatos.length === 0 && <Vazio>Nenhum contato cadastrado</Vazio>}
            {contatos.slice(0, CONTATOS_NO_PAINEL).map((c) => (
              <div key={c.id} className="flex-between" style={{ gap: 12 }}>
                <span style={{ minWidth: 0 }}>{c.nome}{c.cargo && <span className="text-text-muted"> · {c.cargo}</span>}</span>
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => onWhatsApp(c)}
                  disabled={!linkWhatsApp(c.telefone)}
                  title={linkWhatsApp(c.telefone) ? 'Enviar mensagem no WhatsApp' : 'Telefone inválido'}
                >
                  <MessageCircle size={13} /> WhatsApp
                </Button>
              </div>
            ))}
            {/* Aparece também com zero: o modal aberto daqui é onde se cadastra o primeiro contato. */}
            <div>
              <Button variant="ghost" size="sm" onClick={onVerContatos}>ver todos ({contatos.length})</Button>
            </div>
          </div>
          <ListaAcessos cliente={cliente} />
        </div>
      </Bloco>
    </div>
  );
}
