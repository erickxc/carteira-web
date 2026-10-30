import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { eh2DPrice, PRODUTOS_OFICIAIS } from 'carteira-shared/produtos.cjs';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { formatarCNPJ } from '../../utils/cnpj';
import { DIAS_SEMANA } from '../../utils/diasSemana';
import { ehLojaPrincipal, lojaPrincipal } from '../../utils/gruposLojas';
import { lojasParaEdicao, lojasParaSalvar, type LojaEmEdicao } from '../../utils/lojas';
import { SelectField } from '../SelectField';
import { EditorLojas } from './EditorLojas';
import { ProdutosCliente } from './ProdutosCliente';
import { Button, Card, Chip, Field, Input, SecaoLabel } from '../../ui';
import {
  CLIENTE_ESTADO_OPCOES, CLIENTE_STATUS_OPCOES, UNIDADE_CADENCIA_LABEL,
  type Cliente, type RelatorioCadencia, type UnidadeCadenciaRelatorio,
} from '../../types';

const UNIDADES_CADENCIA: UnidadeCadenciaRelatorio[] = ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'personalizado'];

const COLUNAS = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' };

type CadastroClienteProps =
  | { valor: Cliente; somenteLeitura: true }
  /** `cliente` é o vivo (o bloco de produtos grava sozinho e precisa ver o que
   *  gravou); `valor` é o rascunho dos demais campos. */
  | { cliente: Cliente; valor: Cliente; onChange: (next: Cliente) => void; somenteLeitura?: false };

/** Cadastro do cliente: em leitura na ficha, e em edição controlada no painel
 *  "Editar cadastro" (`EditarCadastroModal`, quem grava de uma vez). */
export function CadastroCliente(props: CadastroClienteProps) {
  return props.somenteLeitura
    ? <CadastroLeitura cliente={props.valor} />
    : <CadastroEdicao cliente={props.cliente} valor={props.valor} onChange={props.onChange} />;
}

function CadastroEdicao({ cliente, valor, onChange }: { cliente: Cliente; valor: Cliente; onChange: (next: Cliente) => void }) {
  const { clientes, atualizarCliente, opcoesPorTipo } = useCarteira();
  const [pausando, setPausando] = useState(false);
  // CNPJ fica como digitado (com máscara) só aqui; o rascunho guarda o formato
  // gravado, então desfazer a edição não conta como mudança no patch.
  const [lojas, setLojas] = useState<LojaEmEdicao[]>(() => lojasParaEdicao(valor.lojasCadastro));

  const mudar = (patch: Partial<Cliente>) => onChange({ ...valor, ...patch });
  const mudarLojas = (l: LojaEmEdicao[]) => {
    setLojas(l);
    mudar({ lojasCadastro: lojasParaSalvar(l) });
  };

  // Produtos seguem gravando sozinhos: devolve se gravou para o bloco só fechar a
  // edição de fase quando o servidor aceitou (recusa mantém o motivo digitado).
  async function salvarProduto(patch: Partial<Cliente>): Promise<boolean> {
    try {
      await atualizarCliente(cliente.id, patch);
      return true;
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.');
      return false;
    }
  }
  // Enter num campo de produto enviaria o formulário do painel e o fecharia sem o
  // blur que grava o campo. Aqui dentro, como na ficha antiga, Enter não faz nada.
  const segurarEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
  };

  const ehPrincipal = ehLojaPrincipal(cliente, clientes);
  const nomePrincipal = cliente.grupo && !ehPrincipal ? lojaPrincipal(cliente.grupo, clientes)?.empresa : undefined;
  const statusOpcoes: string[] = [...CLIENTE_STATUS_OPCOES];
  if (valor.status && !statusOpcoes.includes(valor.status)) statusOpcoes.push(valor.status);

  const rel = valor.relatorioCadencia;
  const mudarRelatorio = (r: RelatorioCadencia | undefined) => mudar({ relatorioCadencia: r });

  return (
    <div className="grid gap-x-6" style={COLUNAS} aria-label="Cadastro do cliente">
      <div>
        <SecaoLabel>Identificação</SecaoLabel>
        <Field label="Nome">
          <Input tone="modal" value={valor.empresa} onChange={(e) => mudar({ empresa: e.target.value })} />
        </Field>
        <Field label="Endereço">
          <Input tone="modal" value={valor.endereco ?? ''} onChange={(e) => mudar({ endereco: e.target.value })} placeholder="Rua, número, bairro, cidade/UF" />
        </Field>
        <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <SelectField className="flex-1 basis-[140px]" label="Monitor" placeholder="Nenhum" value={valor.monitor ?? ''} onChange={(v) => mudar({ monitor: v })}
            options={[{ value: '', label: 'Nenhum' }, ...opcoesPorTipo('monitor').map((m) => ({ value: m, label: m }))]} />
          <SelectField className="flex-1 basis-[140px]" label="Segmento" placeholder="Não informado" value={valor.local ?? ''} onChange={(v) => mudar({ local: v })}
            options={[{ value: '', label: 'Não informado' }, ...opcoesPorTipo('local_cliente').map((l) => ({ value: l, label: l }))]} />
          <SelectField className="flex-1 basis-[140px]" label="Linha" placeholder="Não informada" value={valor.linha ?? ''} onChange={(v) => mudar({ linha: v })}
            options={[{ value: '', label: 'Não informada' }, ...opcoesPorTipo('linha_cliente').map((l) => ({ value: l, label: l }))]} />
        </div>

        <SecaoLabel>Situação</SecaoLabel>
        <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <SelectField className="flex-1 basis-[140px]" label="Status" value={valor.status ?? ''} onChange={(v) => mudar({ status: v })}
            options={statusOpcoes.map((s) => ({ value: s, label: s }))} />
          <SelectField className="flex-1 basis-[140px]" label="Estado" value={valor.estado || 'Ativo'} onChange={(v) => mudar({ estado: v })}
            options={CLIENTE_ESTADO_OPCOES.map((e) => ({ value: e, label: e }))} />
          {/* Pausa só existe pra cliente ativo (tira da fila até a data); fica escondida até ser pedida. */}
          {(valor.pausadoAte || pausando) && (
            <Field className="flex-1 basis-[140px]" label="Pausado até">
              <Input tone="modal" type="date" value={valor.pausadoAte ? valor.pausadoAte.slice(0, 10) : ''}
                // Limpar manda '' (não undefined, que sumiria do JSON e deixaria a pausa valendo).
                onChange={(e) => mudar(e.target.value ? { pausadoAte: e.target.value } : { pausadoAte: '', motivoPausa: '' })} />
            </Field>
          )}
        </div>
        {!valor.pausadoAte && !pausando && (valor.estado || 'Ativo') === 'Ativo' && (
          <Button variant="ghost" size="sm" style={{ marginBottom: 14 }} onClick={() => setPausando(true)}>
            Pausar temporariamente
          </Button>
        )}
        {valor.pausadoAte && (
          <Field label="Motivo da pausa">
            <Input tone="modal" value={valor.motivoPausa ?? ''} onChange={(e) => mudar({ motivoPausa: e.target.value })} placeholder="Ex.: obra, férias coletivas…" />
          </Field>
        )}

        {/* Produtos (1.7.0): fase, motivo e acesso de cada produto, gravados na hora.
            Recebem o cliente vivo, não o rascunho. */}
        <div onKeyDown={segurarEnter}>
          <ProdutosCliente cliente={cliente} salvar={salvarProduto} linksEditaveis={ehPrincipal} nomePrincipal={nomePrincipal} />
        </div>
        <p className="text-text-muted" style={{ fontSize: 12, margin: '0 0 14px' }}>
          Produtos gravam na hora (a fase, em "Salvar fase"): Cancelar não desfaz.
        </p>
      </div>

      <div>
        <SecaoLabel>Lojas ({lojas.length})</SecaoLabel>
        <details open={lojas.length <= 4} style={{ marginBottom: 14 }}>
          <summary className="cursor-pointer text-text-secondary" style={{ fontSize: 13, marginBottom: 8 }}>
            {lojas.length > 4 ? `Mostrar as ${lojas.length} lojas` : 'Nome, CNPJ e endereço de cada loja'}
          </summary>
          <EditorLojas lojas={lojas} onChange={mudarLojas} />
        </details>

        <SecaoLabel>Relatório automático</SecaoLabel>
        <label className="check-row" style={{ margin: '0.25rem 0 0.6rem' }}>
          <input type="checkbox" checked={!!rel} onChange={(e) => mudarRelatorio(e.target.checked ? { numero: 1, unidade: 'mes' } : undefined)} />
          Gerar relatórios automaticamente na agenda
        </label>
        {rel && (
          <div className="flex-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field className="w-[100px]" label="A cada">
              {/* Vazio enquanto digita; o painel grava no mínimo 1. */}
              <Input tone="modal" type="number" min={1} value={rel.numero || ''} onChange={(e) => mudarRelatorio({ ...rel, numero: Number(e.target.value) })} />
            </Field>
            <SelectField className="flex-1 basis-[140px]" label="Unidade" value={rel.unidade}
              onChange={(v) => mudarRelatorio({ numero: rel.numero, unidade: v as UnidadeCadenciaRelatorio, ...(v === 'personalizado' ? { diasSemana: rel.diasSemana ?? [] } : {}) })}
              options={UNIDADES_CADENCIA.map((u) => ({ value: u, label: UNIDADE_CADENCIA_LABEL[u] }))} />
          </div>
        )}
        {rel?.unidade === 'personalizado' && (
          <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
            {DIAS_SEMANA.map((d) => {
              const dias = rel.diasSemana ?? [];
              return (
                <Chip key={d.v} variant="toggle" active={dias.includes(d.v)}
                  onClick={() => mudarRelatorio({ ...rel, diasSemana: dias.includes(d.v) ? dias.filter((x) => x !== d.v) : [...dias, d.v] })}>{d.label}</Chip>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const ordemProduto = (nome: string) => {
  const i = PRODUTOS_OFICIAIS.indexOf(nome);
  return i === -1 ? PRODUTOS_OFICIAIS.length : i;
};

// parseISO lê 'yyyy-MM-dd' em hora local (new Date() leria UTC e voltaria um dia).
const dataOu = (iso: string | undefined, molde: string) => {
  const d = iso ? parseISO(iso) : null;
  return d && isValid(d) ? format(d, molde) : '—';
};

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-2" style={{ fontSize: 13, marginBottom: 6 }}>
      <dt className="text-text-muted shrink-0" style={{ width: 96 }}>{rotulo}</dt>
      <dd style={{ margin: 0, minWidth: 0 }}>{children || '—'}</dd>
    </div>
  );
}

function textoRelatorio(rel: RelatorioCadencia | undefined) {
  if (!rel) return 'Desligado';
  if (rel.unidade !== 'personalizado') return `A cada ${rel.numero} (${UNIDADE_CADENCIA_LABEL[rel.unidade]})`;
  const dias = DIAS_SEMANA.filter((d) => rel.diasSemana?.includes(d.v)).map((d) => d.label);
  return `Personalizado: ${dias.join(', ') || 'nenhum dia marcado'}`;
}

/** O cadastro como texto, para consultar sem risco de mexer. A senha nunca chega
 *  ao navegador: aqui só aparece que ela existe. */
function CadastroLeitura({ cliente }: { cliente: Cliente }) {
  const produtos = [...(cliente.produtos ?? [])].sort((a, b) => ordemProduto(a.produto) - ordemProduto(b.produto));
  const price = produtos.find((p) => eh2DPrice(p.produto));
  const lojas = cliente.lojasCadastro ?? [];

  return (
    <Card aria-label="Cadastro do cliente">
      <div className="grid gap-x-6" style={COLUNAS}>
        <div>
          <SecaoLabel>Identificação</SecaoLabel>
          <dl style={{ margin: 0 }}>
            <Linha rotulo="Nome">{cliente.empresa}</Linha>
            <Linha rotulo="Endereço">{cliente.endereco}</Linha>
            <Linha rotulo="Monitor">{cliente.monitor}</Linha>
            <Linha rotulo="Segmento">{cliente.local}</Linha>
            <Linha rotulo="Linha">{cliente.linha}</Linha>
          </dl>

          <SecaoLabel>Situação</SecaoLabel>
          <dl style={{ margin: 0 }}>
            <Linha rotulo="Status">{cliente.status}</Linha>
            <Linha rotulo="Estado">{cliente.estado}</Linha>
            {cliente.pausadoAte && <Linha rotulo="Pausado até">{dataOu(cliente.pausadoAte, 'dd/MM/yyyy')}</Linha>}
            {cliente.pausadoAte && <Linha rotulo="Motivo">{cliente.motivoPausa}</Linha>}
          </dl>

          <SecaoLabel>Produtos</SecaoLabel>
          {produtos.length === 0 && <p className="text-text-muted" style={{ fontSize: 13, margin: 0 }}>Nenhum produto</p>}
          {produtos.map((p) => (
            <p key={p.produto} style={{ fontSize: 13, margin: '0 0 6px' }}>
              <strong>{p.produto}</strong>
              <span className="text-text-secondary"> · {p.fase} desde {dataOu(p.faseDesde, 'MM/yyyy')}{p.independente && ' · independente'}</span>
            </p>
          ))}
        </div>

        <div>
          <SecaoLabel>Lojas ({lojas.length})</SecaoLabel>
          {lojas.length === 0 && <p className="text-text-muted" style={{ fontSize: 13, margin: 0 }}>Nenhuma loja cadastrada</p>}
          {lojas.map((l, i) => (
            <p key={i} style={{ fontSize: 13, margin: '0 0 6px' }}>
              <strong>{l.nome}</strong>
              {l.cnpj && <span className="text-text-secondary"> · {formatarCNPJ(l.cnpj)}</span>}
              {l.endereco && <span className="text-text-muted" style={{ display: 'block' }}>{l.endereco}</span>}
            </p>
          ))}

          <SecaoLabel>Login no Price</SecaoLabel>
          <p style={{ fontSize: 13, margin: 0 }}>
            {price?.login || 'Sem login'}
            {price?.temSenha && <span className="text-text-muted"> · senha salva</span>}
          </p>

          <SecaoLabel>Relatório automático</SecaoLabel>
          <p style={{ fontSize: 13, margin: 0 }}>{textoRelatorio(cliente.relatorioCadencia)}</p>
        </div>
      </div>
    </Card>
  );
}
