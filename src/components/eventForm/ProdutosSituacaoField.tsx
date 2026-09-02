import { Plus, X } from 'lucide-react';
import { Badge, Button, Chip, Field, Input, Select } from '../../ui';
import { AutocompleteInput } from '../AutocompleteInput';
import { MODO_PRODUTO_SITUACAO_LABEL, type ModoProdutoSituacao } from '../../types';
import type { TagClienteFinal } from '../../api/client';
import type { useProdutosSituacao } from './useProdutosSituacao';

const MODOS: ModoProdutoSituacao[] = ['cliente', 'cliente_produto', 'produto'];

interface ProdutosSituacaoFieldProps {
  ps: ReturnType<typeof useProdutosSituacao>;
  /** Nomes REAIS do arquivo de vendas (Dados Alvos) deste cliente — vazio quando
   *  a integração não está disponível/aquecida: aí o campo é só texto livre. */
  produtosDisponiveis?: string[];
  clientesDisponiveis?: string[];
  /** Vocabulário compartilhado do Ecossistema (tags.json) — usado como situação
   *  no modo "Cliente × Situação". */
  tags?: TagClienteFinal[];
}

/**
 * Bloco "Registro da Monitoria" (serviço Monitoria). Registro do que aconteceu
 * na reunião — vira fato consumido pela análise de IA
 * (`server/ia/analiseCliente.cjs`, textoEvento), não é preparação.
 *
 * Três modos (pedido do usuário): só cliente final, cliente + produto, ou só
 * produto. Nome de produto/cliente final vem por AUTOCOMPLETE do catálogo real
 * — digitar às cegas gerava nome que nenhum cálculo encontra depois. No modo
 * "só cliente", a situação vem das TAGS compartilhadas (Alerta, Inadimplente,
 * Cliente Balcão, Encerrou operação) em vez de texto livre, pra harmonizar com
 * o resto do Ecossistema.
 */
export function ProdutosSituacaoField({ ps, produtosDisponiveis = [], clientesDisponiveis = [], tags = [] }: ProdutosSituacaoFieldProps) {
  // Tag aparece como campo PRÓPRIO e opcional, ao lado da situação — nunca no
  // lugar dela: situação é o relato do que foi conversado (texto livre), tag é
  // classificação do cliente final. Só faz sentido quando há cliente final.
  const mostrarTag = ps.precisaCliente && tags.length > 0;

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4, marginBottom: 8 }}>
        {ps.itens.length === 0 && <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhum registro.</span>}
        {ps.itens.map((it) => (
          <div key={it.id} className="check-item">
            <span style={{ flex: 1 }}>
              {it.cliente && <strong>{it.cliente}</strong>}
              {it.cliente && it.produto ? ' · ' : null}
              {it.produto && <strong>{it.produto}</strong>}
              {': '}{it.situacao}
              {it.tag && <Badge variant="muted" style={{ marginLeft: 6 }}>{it.tag}</Badge>}
            </span>
            <Button variant="secondary" size="icon" onClick={() => ps.removeItem(it.id)} aria-label="Remover"><X size={12} /></Button>
          </div>
        ))}
      </div>

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
        <Input
          tone="modal"
          style={{ flex: '2 1 200px' }}
          placeholder="Situação — o que foi conversado/mudou"
          value={ps.situacao}
          onChange={(e) => ps.setSituacao(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ps.addItem(); } }}
        />
        {mostrarTag && (
          <Select tone="modal" style={{ flex: '0 1 170px' }} value={ps.tag} onChange={(e) => ps.setTag(e.target.value)}>
            <option value="">Tag (opcional)</option>
            {tags.map((t) => <option key={t.id} value={t.rotulo}>{t.rotulo}</option>)}
          </Select>
        )}
        <Button variant="primary" size="icon" onClick={ps.addItem} disabled={ps.incompleto}><Plus size={16} /></Button>
      </div>

      {ps.precisaCliente && clientesDisponiveis.length === 0 && (
        <span className="text-text-muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 'normal', marginTop: 6, display: 'block' }}>
          Ainda sem lista de clientes finais para este cliente (sem dados de venda vinculados). Digite o nome manualmente — a lista passa a aparecer aqui depois da primeira leitura dos dados.
        </span>
      )}
      {mostrarTag && (
        <span className="text-text-muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 'normal', marginTop: 6, display: 'block' }}>
          A tag classifica o cliente final (vocabulário do Ecossistema) e é opcional — a situação é o relato do que foi conversado.
        </span>
      )}
    </Field>
  );
}
