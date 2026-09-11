import { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowRightCircle, ArrowUpCircle, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, Chip, Field, Input } from '../../ui';
import { Dropdown } from '../Dropdown';
import { AutocompleteInput } from '../AutocompleteInput';
import { MODO_PRODUTO_SITUACAO_LABEL, type DirecaoSituacao, type ModoProdutoSituacao, type ProdutoSituacaoItem } from '../../types';
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
  /** Trava o modo (esconde os chips de troca) — usado no evento tipo
   *  Precificação, que só faz sentido em "Produto × Situação" (não há
   *  cliente final envolvido em precificar um produto). */
  modoFixo?: ModoProdutoSituacao;
}

/**
 * Bloco "Registro da Monitoria" — unifica o que antes eram dois campos
 * separados (registro de Monitoria por cliente final/produto, e o marcador
 * de produto precificado por margem). Vira fato consumido pela análise de IA
 * (`server/ia/analiseCliente.cjs`, textoEvento), não é preparação.
 *
 * Três modos: só cliente final, cliente + produto, ou só produto (este
 * último é o único disponível quando `modoFixo="produto"`, evento
 * Precificação). Nome de produto/cliente final vem por AUTOCOMPLETE do
 * catálogo real — digitar às cegas gerava nome que nenhum cálculo encontra
 * depois.
 *
 * A situação é um indicador de direção (seta ↑ verde = aumento, ↓ vermelha =
 * queda, → cinza = manteve) em vez de texto livre. `observacao` (opcional)
 * cobre o que antes ia no texto livre, quando há algo a detalhar. Registro
 * ANTIGO (`situacao` de texto livre, sem `direcao`) continua exibido como
 * estava — ver renderização condicional abaixo.
 *
 * Cliente/grupo ficam PRONTOS pro próximo produto do mesmo cliente depois de
 * adicionar (só produto/direção/observação são limpos) — pedido do usuário:
 * lançar vários produtos do mesmo cliente não deve exigir redigitar o
 * cliente a cada linha. A lista abaixo agrupa visualmente por cliente pelo
 * mesmo motivo (grupo referência é do cliente, não do produto — mostrado uma
 * vez por grupo, não repetido em cada linha).
 */
export function ProdutosSituacaoField({ ps, produtosDisponiveis = [], clientesDisponiveis = [], gruposReferencia = [], modoFixo }: ProdutosSituacaoFieldProps) {
  // Grupo referência (G1/G2/G3) é do CLIENTE FINAL — só faz sentido quando há cliente final.
  const mostrarGrupo = ps.precisaCliente && gruposReferencia.length > 0;

  // Recolhido por padrão quando já há vários registros (edição de reunião
  // antiga, ex.: 14 linhas) — a lista inteira dominava o formulário mesmo
  // quando o monitor só queria adicionar um item novo. Poucos registros
  // (o caso comum, reunião nova) já aparece aberto, sem precisar de clique.
  const [expandido, setExpandido] = useState(ps.itens.length <= 3);

  // Trava reativa (não só na montagem): se o evento trocar de tipo pra
  // Precificação depois de aberto, o modo é forçado pra "produto" mesmo já
  // tendo itens lançados em outro modo antes.
  useEffect(() => {
    if (modoFixo && ps.modo !== modoFixo) ps.trocarModo(modoFixo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoFixo, ps.modo]);

  const grupos = agruparPorCliente(ps.itens);

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 2 }}>
              {grupos.map((grupo) => (
                <div key={grupo.chave} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {grupo.cliente && (
                    <div className="flex-row" style={{ gap: 6, alignItems: 'center' }}>
                      <strong style={{ fontSize: 13 }}>{grupo.cliente}</strong>
                      {grupo.referencia && <Badge variant="warning">{grupo.referencia}</Badge>}
                    </div>
                  )}
                  {grupo.itens.map((it) => (
                    <div key={it.id} className="check-item">
                      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <DirecaoIcone direcao={it.direcao} />
                        <span>
                          {it.produto && <strong>{it.produto}</strong>}
                          {!it.produto && !grupo.cliente && <strong>(sem identificação)</strong>}
                          {it.produto && ': '}
                          {/* Registro antigo (sem direcao) mostra o texto livre legado. */}
                          {it.direcao ? (it.observacao || '—') : it.situacao}
                        </span>
                      </span>
                      <Button variant="secondary" size="icon" onClick={() => ps.removeItem(it.id)} aria-label="Remover"><X size={12} /></Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!modoFixo && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
          {MODOS.map((m) => (
            <Chip key={m} variant="toggle" active={ps.modo === m} onClick={() => ps.trocarModo(m)}>
              {MODO_PRODUTO_SITUACAO_LABEL[m]}
            </Chip>
          ))}
        </div>
      )}

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

      {ps.precisaCliente && ps.cliente.trim() && (
        <span className="text-text-muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 'normal', marginTop: 6, display: 'block' }}>
          Cliente e grupo continuam preenchidos após adicionar — troque o nome acima pra lançar produtos de outro cliente.
        </span>
      )}
      {ps.precisaCliente && clientesDisponiveis.length === 0 && (
        <span className="text-text-muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 'normal', marginTop: 6, display: 'block' }}>
          Ainda sem lista de clientes finais para este cliente (sem dados de venda vinculados). Digite o nome manualmente — a lista passa a aparecer aqui depois da primeira leitura dos dados.
        </span>
      )}
    </Field>
  );
}

interface GrupoExibicao {
  chave: string;
  cliente?: string;
  referencia?: string;
  itens: ProdutoSituacaoItem[];
}

/** Agrupa os itens por cliente final (preservando a ordem de primeira
 *  aparição) — itens sem cliente (modo "produto") formam um grupo só, sem
 *  cabeçalho. O grupo referência (G1/G2/G3) é exibido uma vez por cliente,
 *  não repetido em cada produto. */
function agruparPorCliente(itens: ProdutoSituacaoItem[]): GrupoExibicao[] {
  const grupos: GrupoExibicao[] = [];
  const porChave = new Map<string, GrupoExibicao>();
  for (const it of itens) {
    const chave = it.cliente ?? '';
    let grupo = porChave.get(chave);
    if (!grupo) {
      grupo = { chave, cliente: it.cliente, referencia: it.grupo, itens: [] };
      porChave.set(chave, grupo);
      grupos.push(grupo);
    }
    grupo.itens.push(it);
    if (!grupo.referencia && it.grupo) grupo.referencia = it.grupo;
  }
  return grupos;
}

function DirecaoIcone({ direcao }: { direcao?: DirecaoSituacao }) {
  if (direcao === 'aumento') return <ArrowUpCircle size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />;
  if (direcao === 'queda') return <ArrowDownCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />;
  if (direcao === 'manteve') return <ArrowRightCircle size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />;
  return null;
}

/** Toggle exclusivo aumento (seta verde) / manteve (seta cinza) / queda (seta
 *  vermelha) — nenhuma marcada por padrão, exatamente uma escolhida é
 *  obrigatório (`useProdutosSituacao.incompleto`). */
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
        title="Manteve"
        aria-pressed={value === 'manteve'}
        onClick={() => onChange('manteve')}
        className={clsx('direcao-toggle-btn', value === 'manteve' && 'is-active-manteve')}
      >
        <ArrowRightCircle size={18} />
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
