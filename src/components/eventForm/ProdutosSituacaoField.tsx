import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Chip, Field, Input } from '../../ui';
import { Dropdown } from '../Dropdown';
import { AutocompleteInput } from '../AutocompleteInput';
import { MODO_PRODUTO_SITUACAO_LABEL, type DirecaoSituacao, type ModoProdutoSituacao } from '../../types';
import type { useProdutosSituacao } from './useProdutosSituacao';

const MODOS: ModoProdutoSituacao[] = ['cliente', 'cliente_produto', 'produto'];

interface ProdutosSituacaoFieldProps {
  ps: ReturnType<typeof useProdutosSituacao>;
  /** Nomes REAIS do arquivo de vendas (Dados Alvos) deste cliente — vazio quando
   *  a integração não está disponível/aquecida: aí o campo é só texto livre. */
  produtosDisponiveis?: string[];
  clientesDisponiveis?: string[];
  /** Opções de grupo referência (categoria `grupo_referencia`: G1/G2/G3) — do
   *  CLIENTE FINAL, não do cliente da carteira. */
  gruposReferencia?: string[];
}

/**
 * Bloco "Registro da Monitoria" (serviço Monitoria). Registro do que aconteceu
 * na reunião — vira fato consumido pela análise de IA
 * (`server/ia/analiseCliente.cjs`, textoEvento), não é preparação.
 *
 * Três modos (pedido do usuário): só cliente final, cliente + produto, ou só
 * produto. Nome de produto/cliente final vem por AUTOCOMPLETE do catálogo real
 * — digitar às cegas gerava nome que nenhum cálculo encontra depois.
 *
 * A situação virou um indicador de direção (seta ↑ verde = aumento, ↓ vermelha
 * = queda) em vez de texto livre — pedido do usuário, pra ficar rápido de
 * registrar e visualmente óbvio na lista. `observacao` (opcional) cobre o que
 * antes ia no texto livre, quando há algo a detalhar. Registro ANTIGO
 * (`situacao` de texto livre, sem `direcao`) continua exibido como estava —
 * ver renderização condicional abaixo.
 */
export function ProdutosSituacaoField({ ps, produtosDisponiveis = [], clientesDisponiveis = [], gruposReferencia = [] }: ProdutosSituacaoFieldProps) {
  // Grupo referência (G1/G2/G3) é do CLIENTE FINAL — só faz sentido quando há cliente final.
  const mostrarGrupo = ps.precisaCliente && gruposReferencia.length > 0;

  // Recolhido por padrão quando já há vários registros (edição de reunião
  // antiga, ex.: 14 linhas) — a lista inteira dominava o formulário mesmo
  // quando o monitor só queria adicionar um item novo. Poucos registros
  // (o caso comum, reunião nova) já aparece aberto, sem precisar de clique.
  const [expandido, setExpandido] = useState(ps.itens.length <= 3);

  return (
    <Field
      as="div"
      label={
        <>
          Registro da Monitoria{' '}
          <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>
            · o que mudou em cada produto e/ou cliente final
          </span>
        </>
      }
    >
      {ps.itens.length === 0 ? (
        <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none', display: 'block', marginTop: 4, marginBottom: 8 }}>
          Nenhum registro.
        </span>
      ) : (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setExpandido((e) => !e)}
            className="text-text-muted"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, textTransform: 'none',
              letterSpacing: 'normal', fontWeight: 600, background: 'none', border: 'none', padding: '2px 0',
              cursor: 'pointer', marginBottom: expandido ? 6 : 0,
            }}
          >
            {expandido ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {ps.itens.length} registro{ps.itens.length > 1 ? 's' : ''}
          </button>
          {expandido && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}>
              {ps.itens.map((it) => (
                <div key={it.id} className="check-item">
                  <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {it.direcao === 'aumento' && <ArrowUpCircle size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />}
                    {it.direcao === 'queda' && <ArrowDownCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                    <span>
                      {it.cliente && <strong>{it.cliente}</strong>}
                      {it.cliente && it.produto ? ' · ' : null}
                      {it.produto && <strong>{it.produto}</strong>}
                      {(it.cliente || it.produto) && ': '}
                      {/* Registro antigo (sem direcao) mostra o texto livre legado. */}
                      {it.direcao ? (it.observacao || '—') : it.situacao}
                      {it.grupo && <Badge variant="warning" style={{ marginLeft: 6 }}>{it.grupo}</Badge>}
                    </span>
                  </span>
                  <Button variant="secondary" size="icon" onClick={() => ps.removeItem(it.id)} aria-label="Remover"><X size={12} /></Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
        {MODOS.map((m) => (
          <Chip key={m} variant="toggle" active={ps.modo === m} onClick={() => ps.trocarModo(m)}>
            {MODO_PRODUTO_SITUACAO_LABEL[m]}
          </Chip>
        ))}
      </div>

      <div className="flex-row" style={{ gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {ps.precisaCliente && (
          <AutocompleteInput
            tone="modal"
            style={{ flex: '1 1 160px' }}
            placeholder="Cliente final"
            value={ps.cliente}
            onChange={ps.setCliente}
            opcoes={clientesDisponiveis}
          />
        )}
        {ps.precisaProduto && (
          <AutocompleteInput
            tone="modal"
            style={{ flex: '1 1 160px' }}
            placeholder="Produto"
            value={ps.produto}
            onChange={ps.setProduto}
            opcoes={produtosDisponiveis}
          />
        )}
        <DirecaoToggle value={ps.direcao} onChange={ps.setDirecao} />
        <Input
          tone="modal"
          style={{ flex: '2 1 200px' }}
          placeholder="Observação (opcional)"
          value={ps.observacao}
          onChange={(e) => ps.setObservacao(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ps.addItem(); } }}
        />
        {mostrarGrupo && (
          <div style={{ flex: '0 1 150px' }}>
            <Dropdown
              variant="campo"
              label="Grupo (opcional)"
              value={ps.grupo}
              onChange={(v) => ps.setGrupo(v as string)}
              options={[{ value: '', label: 'Grupo (opcional)' }, ...gruposReferencia.map((g) => ({ value: g, label: g }))]}
            />
          </div>
        )}
        <Button variant="primary" size="icon" onClick={ps.addItem} disabled={ps.incompleto} title="Adicionar registro"><Plus size={16} /></Button>
      </div>

      {ps.precisaCliente && clientesDisponiveis.length === 0 && (
        <span className="text-text-muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 'normal', marginTop: 6, display: 'block' }}>
          Ainda sem lista de clientes finais para este cliente (sem dados de venda vinculados). Digite o nome manualmente — a lista passa a aparecer aqui depois da primeira leitura dos dados.
        </span>
      )}
    </Field>
  );
}

/** Toggle exclusivo aumento (seta verde) / queda (seta vermelha) — nenhuma
 *  das duas marcada por padrão, exatamente uma escolhida é obrigatório
 *  (`useProdutosSituacao.incompleto`). */
function DirecaoToggle({ value, onChange }: { value: DirecaoSituacao | null; onChange: (v: DirecaoSituacao) => void }) {
  return (
    <div className="flex-row" style={{ gap: 4, flex: '0 0 auto' }}>
      <button
        type="button"
        title="Aumento"
        aria-pressed={value === 'aumento'}
        onClick={() => onChange('aumento')}
        className={clsx('direcao-toggle-btn', value === 'aumento' && 'is-active-aumento')}
      >
        <ArrowUpCircle size={18} />
      </button>
      <button
        type="button"
        title="Queda"
        aria-pressed={value === 'queda'}
        onClick={() => onChange('queda')}
        className={clsx('direcao-toggle-btn', value === 'queda' && 'is-active-queda')}
      >
        <ArrowDownCircle size={18} />
      </button>
    </div>
  );
}
