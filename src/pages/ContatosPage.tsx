import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useSearchFilter } from '../hooks/useSearchFilter';
import { linkWhatsApp } from '../utils/whatsapp';
import { WhatsAppMensagemModal } from '../components/WhatsAppMensagemModal';
import { Badge, Button, Card, Th, Td } from '../ui';
import type { Contato } from '../types';

interface ContatoLinha extends Contato {
  empresa: string;
  clienteId: string;
  monitor: string;
}

/** Módulo Contatos — lista única de todas as pessoas de contato dos clientes
 * (nome, cargo, telefone), com busca e atalho de WhatsApp. Os contatos são
 * cadastrados dentro de cada cliente; aqui é a visão agregada. */
export default function ContatosPage() {
  const navigate = useNavigate();
  const { clientes } = useCarteira();
  const { value: busca, debounced, setValue: setBusca } = useSearchFilter();
  const [wa, setWa] = useState<{ contato: Contato; empresa: string } | null>(null);

  const linhas = useMemo<ContatoLinha[]>(() => {
    const out: ContatoLinha[] = [];
    clientes.forEach((c) =>
      (c.contatos ?? []).forEach((ct) =>
        out.push({ ...ct, empresa: c.empresa, clienteId: c.id, monitor: c.monitor })
      )
    );
    return out.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [clientes]);

  const filtradas = useMemo(() => {
    const t = debounced.trim().toLowerCase();
    if (!t) return linhas;
    return linhas.filter((l) =>
      [l.nome, l.cargo, l.empresa, l.telefone].some((v) => (v ?? '').toLowerCase().includes(t))
    );
  }, [linhas, debounced]);

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Contatos</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Pessoas de contato de todos os clientes. Cadastre dentro de cada cliente.</p>
        </div>
      </div>

      <Card flat className="mb-4" style={{ marginTop: '1.25rem' }}>
        <label className="filter-ctl filter-search" style={{ maxWidth: 360 }}>
          <Search size={16} />
          <input placeholder="Buscar por nome, cargo, empresa ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </Card>

      <Card flat style={{ padding: 0, overflow: 'hidden' }}>
        {filtradas.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            {linhas.length === 0 ? 'Nenhum contato cadastrado ainda. Abra um cliente e adicione contatos.' : 'Nenhum contato encontrado.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full border-collapse text-[0.9rem]">
              <thead><tr>
                <Th>Nome</Th>
                <Th>Cargo</Th>
                <Th>Empresa</Th>
                <Th>Telefone</Th>
                <Th></Th>
              </tr></thead>
              <tbody>
                {filtradas.map((l) => {
                  const link = linkWhatsApp(l.telefone);
                  return (
                    <tr key={l.clienteId + '-' + l.id} className="group [&:last-child>td]:border-b-0">
                      <Td first style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.nome}</Td>
                      <Td className="text-text-muted">{l.cargo || '—'}</Td>
                      <Td>
                        <button className="link-button" onClick={() => navigate(`/clientes/${l.clienteId}`, { state: { from: '/contatos', fromLabel: 'Contatos' } })}>{l.empresa}</button>
                        {l.monitor && <Badge variant="muted" style={{ marginLeft: 8 }}>{l.monitor}</Badge>}
                      </Td>
                      <Td className="text-text-muted">{l.telefone || '—'}</Td>
                      <Td>
                        <div className="flex-row" style={{ justifyContent: 'flex-end' }}>
                          <Button
                            variant="success"
                            onClick={() => (link ? setWa({ contato: l, empresa: l.empresa }) : undefined)}
                            disabled={!link}
                            title={link ? 'Enviar mensagem no WhatsApp' : 'Telefone inválido'}
                          >
                            <MessageCircle size={15} /> WhatsApp
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {linhas.length > 0 && (
        <p className="text-text-muted" style={{ fontSize: 12, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={13} /> {filtradas.length} de {linhas.length} contato{linhas.length === 1 ? '' : 's'}
        </p>
      )}

      {wa && <WhatsAppMensagemModal contato={wa.contato} empresa={wa.empresa} onClose={() => setWa(null)} />}
    </div>
  );
}
