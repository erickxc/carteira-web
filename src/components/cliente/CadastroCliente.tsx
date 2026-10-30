import { useRef, useState, type FocusEvent } from 'react';
import { Check } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { DIAS_SEMANA } from '../../utils/diasSemana';
import { ehLojaPrincipal, lojaPrincipal } from '../../utils/gruposLojas';
import { cnpjIncompleto, lojasParaEdicao, lojasParaSalvar, type LojaEmEdicao } from '../../utils/lojas';
import { SelectField } from '../SelectField';
import { EditorLojas } from './EditorLojas';
import { CampoTexto } from './CampoTexto';
import { ProdutosCliente } from './ProdutosCliente';
import { Button, Card, Chip, Field, Input, SecaoLabel } from '../../ui';
import {
  CLIENTE_ESTADO_OPCOES, CLIENTE_STATUS_OPCOES, UNIDADE_CADENCIA_LABEL,
  type Cliente, type RelatorioCadencia, type UnidadeCadenciaRelatorio,
} from '../../types';

const UNIDADES_CADENCIA: UnidadeCadenciaRelatorio[] = ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'personalizado'];

type Patch = Partial<Cliente>;

/**
 * Cadastro do cliente DENTRO da ficha (1.6.11): todos os campos editáveis
 * juntos, cada um salvando sozinho ao sair do campo (selects e marcações salvam
 * na hora). Substitui o caminho ficha → lápis → modal, que o usuário não quer
 * mais ("uma ficha só"). O modal continua só para criar cliente novo.
 */
export function CadastroCliente({ cliente }: { cliente: Cliente }) {
  const { clientes, atualizarCliente, opcoesPorTipo } = useCarteira();
  const [situacao, setSituacao] = useState<'ocioso' | 'salvando' | 'salvo'>('ocioso');
  const [pausando, setPausando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Devolve se gravou: o bloco de produtos só fecha a edição de fase quando o
  // servidor aceitou (ex.: recusa por falta de motivo mantém o texto digitado).
  async function salvar(patch: Patch): Promise<boolean> {
    setSituacao('salvando');
    try {
      await atualizarCliente(cliente.id, patch);
      setSituacao('salvo');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSituacao('ocioso'), 2000);
      return true;
    } catch (err) {
      setSituacao('ocioso');
      toastError(err instanceof Error ? err.message : 'Não foi possível salvar. Tente de novo.');
      return false;
    }
  }

  const ehPrincipal = ehLojaPrincipal(cliente, clientes);
  const nomePrincipal = cliente.grupo && !ehPrincipal ? lojaPrincipal(cliente.grupo, clientes)?.empresa : undefined;
  const statusOpcoes: string[] = [...CLIENTE_STATUS_OPCOES];
  if (cliente.status && !statusOpcoes.includes(cliente.status)) statusOpcoes.push(cliente.status);

  // Lojas: rascunho local, salvo quando o foco sai do bloco de lojas (ou na hora,
  // ao remover uma) — digitar um CNPJ não pode gravar a cada tecla.
  const [lojas, setLojas] = useState<LojaEmEdicao[]>(() => lojasParaEdicao(cliente.lojasCadastro));
  // CNPJ incompleto nunca é salvo: o servidor o gravaria vazio e apagaria o número anterior.
  const lojasMudaram = (l: LojaEmEdicao[]) => !l.some((x) => cnpjIncompleto(x.cnpj))
    && JSON.stringify(lojasParaSalvar(l)) !== JSON.stringify(cliente.lojasCadastro ?? []);
  const mudarLojas = (l: LojaEmEdicao[]) => {
    setLojas(l);
    if (l.length < lojas.length && lojasMudaram(l)) salvar({ lojasCadastro: lojasParaSalvar(l) });
  };
  const sairDasLojas = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (lojasMudaram(lojas)) salvar({ lojasCadastro: lojasParaSalvar(lojas) });
  };

  const rel = cliente.relatorioCadencia;
  const salvarRelatorio = (r: RelatorioCadencia | undefined) => salvar({ relatorioCadencia: r });

  return (
    <Card style={{ marginBottom: 24 }} aria-label="Cadastro do cliente">
      <div className="section-header">
        <h3>Cadastro</h3>
        <span className="text-text-muted inline-flex items-center gap-1" style={{ fontSize: 12 }} aria-live="polite">
          {situacao === 'salvando' && 'Salvando…'}
          {situacao === 'salvo' && <><Check size={13} className="text-[color:var(--success-fg)]" /> Salvo</>}
          {situacao === 'ocioso' && 'As alterações são salvas ao sair de cada campo'}
        </span>
      </div>

      <div className="grid gap-x-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
        <div>
          <SecaoLabel>Identificação</SecaoLabel>
          <Field label="Nome">
            <CampoTexto key={`n-${cliente.empresa}`} valor={cliente.empresa} onSalvar={(v) => (v ? salvar({ empresa: v }) : toastError('O nome não pode ficar vazio.'))} />
          </Field>
          <Field label="Endereço">
            <CampoTexto key={`e-${cliente.endereco ?? ''}`} valor={cliente.endereco ?? ''} onSalvar={(v) => salvar({ endereco: v })} placeholder="Rua, número, bairro, cidade/UF" />
          </Field>
          <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <SelectField className="flex-1 basis-[140px]" label="Monitor" placeholder="Nenhum" value={cliente.monitor ?? ''} onChange={(v) => salvar({ monitor: v })}
              options={[{ value: '', label: 'Nenhum' }, ...opcoesPorTipo('monitor').map((m) => ({ value: m, label: m }))]} />
            <SelectField className="flex-1 basis-[140px]" label="Segmento" placeholder="Não informado" value={cliente.local ?? ''} onChange={(v) => salvar({ local: v })}
              options={[{ value: '', label: 'Não informado' }, ...opcoesPorTipo('local_cliente').map((l) => ({ value: l, label: l }))]} />
            <SelectField className="flex-1 basis-[140px]" label="Linha" placeholder="Não informada" value={cliente.linha ?? ''} onChange={(v) => salvar({ linha: v })}
              options={[{ value: '', label: 'Não informada' }, ...opcoesPorTipo('linha_cliente').map((l) => ({ value: l, label: l }))]} />
          </div>

          <SecaoLabel>Situação</SecaoLabel>
          <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <SelectField className="flex-1 basis-[140px]" label="Status" value={cliente.status ?? ''} onChange={(v) => salvar({ status: v })}
              options={statusOpcoes.map((s) => ({ value: s, label: s }))} />
            <SelectField className="flex-1 basis-[140px]" label="Estado" value={cliente.estado || 'Ativo'} onChange={(v) => salvar({ estado: v })}
              options={CLIENTE_ESTADO_OPCOES.map((e) => ({ value: e, label: e }))} />
            {/* Pausa só existe pra cliente ativo (tira da fila até a data); fica escondida até ser pedida. */}
            {(cliente.pausadoAte || pausando) && (
              <Field className="flex-1 basis-[140px]" label="Pausado até">
                <Input type="date" value={cliente.pausadoAte ? cliente.pausadoAte.slice(0, 10) : ''}
                  // Limpar manda '' (não undefined, que sumiria do JSON e deixaria a pausa valendo).
                  onChange={(e) => salvar(e.target.value ? { pausadoAte: e.target.value } : { pausadoAte: '', motivoPausa: '' })} />
              </Field>
            )}
          </div>
          {!cliente.pausadoAte && !pausando && (cliente.estado || 'Ativo') === 'Ativo' && (
            <Button variant="ghost" size="sm" style={{ marginBottom: 14 }}
              onClick={() => setPausando(true)}>
              Pausar temporariamente
            </Button>
          )}
          {cliente.pausadoAte && (
            <Field label="Motivo da pausa">
              <CampoTexto key={`mp-${cliente.motivoPausa ?? ''}`} valor={cliente.motivoPausa ?? ''} onSalvar={(v) => salvar({ motivoPausa: v })} placeholder="Ex.: obra, férias coletivas…" />
            </Field>
          )}

          {/* Produtos (1.7.0) substituem "Serviços", os links Power BI e o login do Price:
              fase, motivo e acesso de cada produto ficam num lugar só. */}
          <ProdutosCliente cliente={cliente} salvar={salvar} linksEditaveis={ehPrincipal} nomePrincipal={nomePrincipal} />

          <SecaoLabel>Observação</SecaoLabel>
          <Field label="Observação">
            <CampoTexto key={`o-${cliente.observacao ?? ''}`} multilinha valor={cliente.observacao ?? ''} onSalvar={(v) => salvar({ observacao: v })} aria-label="Observação" />
          </Field>
        </div>

        <div>
          <SecaoLabel>Lojas ({lojas.length})</SecaoLabel>
          <details open={lojas.length <= 4} style={{ marginBottom: 14 }}>
            <summary className="cursor-pointer text-text-secondary" style={{ fontSize: 13, marginBottom: 8 }}>
              {lojas.length > 4 ? `Mostrar as ${lojas.length} lojas` : 'Nome, CNPJ e endereço de cada loja'}
            </summary>
            <div onBlur={sairDasLojas}>
              <EditorLojas lojas={lojas} onChange={mudarLojas} />
            </div>
          </details>

          <SecaoLabel>Relatório automático</SecaoLabel>
          <label className="check-row" style={{ margin: '0.25rem 0 0.6rem' }}>
            <input type="checkbox" checked={!!rel} onChange={(e) => salvarRelatorio(e.target.checked ? { numero: 1, unidade: 'mes' } : undefined)} />
            Gerar relatórios automaticamente na agenda
          </label>
          {rel && (
            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field className="w-[100px]" label="A cada">
                <CampoTexto key={`rn-${rel.numero}`} type="number" min={1} valor={String(rel.numero)}
                  onSalvar={(v) => salvarRelatorio({ ...rel, numero: Math.max(1, Number(v) || 1) })} />
              </Field>
              <SelectField className="flex-1 basis-[140px]" label="Unidade" value={rel.unidade}
                onChange={(v) => salvarRelatorio({ numero: rel.numero, unidade: v as UnidadeCadenciaRelatorio, ...(v === 'personalizado' ? { diasSemana: rel.diasSemana ?? [] } : {}) })}
                options={UNIDADES_CADENCIA.map((u) => ({ value: u, label: UNIDADE_CADENCIA_LABEL[u] }))} />
            </div>
          )}
          {rel?.unidade === 'personalizado' && (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
              {DIAS_SEMANA.map((d) => {
                const dias = rel.diasSemana ?? [];
                return (
                  <Chip key={d.v} variant="toggle" active={dias.includes(d.v)}
                    onClick={() => salvarRelatorio({ ...rel, diasSemana: dias.includes(d.v) ? dias.filter((x) => x !== d.v) : [...dias, d.v] })}>{d.label}</Chip>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
