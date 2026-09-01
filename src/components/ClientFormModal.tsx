import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import { ModalShell } from './ModalShell';
import { DIAS_SEMANA } from '../utils/diasSemana';
import { Badge, Button, Chip, Field, Input, Select, Textarea } from '../ui';
import {
  TIPO_ANALISE_LABEL, UNIDADE_CADENCIA_LABEL, CLIENTE_ESTADO_OPCOES, CLIENTE_STATUS_OPCOES,
  type Cliente, type NovoCliente, type RelatorioCadencia, type TipoAnalise, type UnidadeCadenciaRelatorio,
} from '../types';

const UNIDADES_CADENCIA: UnidadeCadenciaRelatorio[] = ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'personalizado'];

interface ClientFormModalProps {
  initial?: Cliente;
  onClose: () => void;
}

export function ClientFormModal({ initial, onClose }: ClientFormModalProps) {
  const { criarCliente, criarClientesEmLote, atualizarCliente, opcoesPorTipo } = useCarteira();
  const servicoOpcoes = opcoesPorTipo('servico');
  const statusOpcoes = [...CLIENTE_STATUS_OPCOES];
  const monitorOpcoes = opcoesPorTipo('monitor');
  const localOpcoes = opcoesPorTipo('local_cliente');
  const editando = !!initial;

  const [empresa, setEmpresa] = useState(initial?.empresa ?? '');
  const [monitor, setMonitor] = useState(initial?.monitor ?? '');
  const [servicos, setServicos] = useState<string[]>(initial?.servicos ?? []);
  const [servicosIndependentes, setServicosIndependentes] = useState<string[]>(initial?.servicosIndependentes ?? []);
  const statusLegado = /^(ativ|inativ|suspens)/i.test(initial?.status ?? '');
  const [status, setStatus] = useState(statusLegado ? 'Regular' : (initial?.status ?? 'Regular'));
  const [estado, setEstado] = useState(initial?.estado ?? (/^(ativ|gratuidade)/i.test(initial?.status ?? '') ? 'Ativo' : 'Inativo'));
  const [observacao, setObservacao] = useState(initial?.observacao ?? '');
  const [local, setLocal] = useState(initial?.local ?? '');
  const [linkPowerBI, setLinkPowerBI] = useState(initial?.linkPowerBI ?? '');
  const [linkPlataforma, setLinkPlataforma] = useState(initial?.linkPlataforma ?? '');
  const [tipoAnalise, setTipoAnalise] = useState<TipoAnalise>(initial?.tipoAnalise ?? 'unitaria');
  const [lojas, setLojas] = useState<string[]>([]);
  const [novaLoja, setNovaLoja] = useState('');
  const [saving, setSaving] = useState(false);

  const [relatorioAtivo, setRelatorioAtivo] = useState<boolean>(!!initial?.relatorioCadencia);
  const [relatorioNumero, setRelatorioNumero] = useState<number>(initial?.relatorioCadencia?.numero ?? 1);
  const [relatorioUnidade, setRelatorioUnidade] = useState<UnidadeCadenciaRelatorio>(initial?.relatorioCadencia?.unidade ?? 'mes');
  const [relatorioDiasSemana, setRelatorioDiasSemana] = useState<number[]>(initial?.relatorioCadencia?.diasSemana ?? []);

  function toggleRelatorioDiaSemana(dia: number) {
    setRelatorioDiasSemana((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  }

  const relatorioCadencia: RelatorioCadencia | undefined = relatorioAtivo
    ? {
        numero: Math.max(1, relatorioNumero || 1),
        unidade: relatorioUnidade,
        ...(relatorioUnidade === 'personalizado' ? { diasSemana: relatorioDiasSemana } : {}),
      }
    : undefined;

  const segmentadoNovo = tipoAnalise === 'segmentado';

  function toggleServico(nome: string) {
    setServicos((prev) => (prev.includes(nome) ? prev.filter((s) => s !== nome) : [...prev, nome]));
    // Desmarcar o serviço também limpa a independência dele (não faz sentido
    // ficar "independente" de um serviço que o cliente nem tem mais).
    setServicosIndependentes((prev) => prev.filter((s) => s !== nome));
  }
  function toggleIndependente(nome: string) {
    setServicosIndependentes((prev) => (prev.includes(nome) ? prev.filter((s) => s !== nome) : [...prev, nome]));
  }
  function adicionarLoja() {
    const nome = novaLoja.trim();
    if (!nome || lojas.includes(nome)) { setNovaLoja(''); return; }
    setLojas((prev) => [...prev, nome]);
    setNovaLoja('');
  }
  function removerLoja(nome: string) {
    setLojas((prev) => prev.filter((l) => l !== nome));
  }

  // Lojas efetivas (inclui a digitada e não adicionada).
  const lojasFinais = novaLoja.trim() && !lojas.includes(novaLoja.trim()) ? [...lojas, novaLoja.trim()] : lojas;
  const base = empresa.trim();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!base) return;
    setSaving(true);
    try {
      if (editando && tipoAnalise === 'segmentado' && lojasFinais.length > 0) {
        const grupo = initial.grupo || base;
        const [primeira, ...resto] = lojasFinais;
        await atualizarCliente(initial.id, {
          empresa: `${grupo} - ${primeira}`, grupo, tipoAnalise: 'segmentado',
          monitor, servicos, servicosIndependentes, estado, status, observacao, local, linkPowerBI, linkPlataforma, relatorioCadencia,
        });
        if (resto.length > 0) {
          const novos: NovoCliente[] = resto.map((nome) => ({
            empresa: `${grupo} - ${nome}`,
            grupo,
            tipoAnalise: 'segmentado',
            monitor, servicos, servicosIndependentes, estado, status, observacao, local, linkPowerBI, linkPlataforma, relatorioCadencia,
          }));
          await criarClientesEmLote(novos);
        }
      } else if (editando) {
        await atualizarCliente(initial.id, { empresa: base, monitor, servicos, servicosIndependentes, estado, status, observacao, local, linkPowerBI, linkPlataforma, tipoAnalise, relatorioCadencia });
      } else if (tipoAnalise === 'segmentado') {
        if (lojasFinais.length === 0) { toastError('Adicione ao menos uma loja para a análise segmentada.'); setSaving(false); return; }
        const novos: NovoCliente[] = lojasFinais.map((nome) => ({
          empresa: `${base} - ${nome}`,
          grupo: base,
          tipoAnalise: 'segmentado',
          monitor, servicos, servicosIndependentes, estado, status, observacao, local, linkPowerBI, linkPlataforma, relatorioCadencia,
        }));
        await criarClientesEmLote(novos);
      } else {
        await criarCliente({ empresa: base, monitor, servicos, servicosIndependentes, estado, status, observacao, local, linkPowerBI, linkPlataforma, tipoAnalise: 'unitaria', relatorioCadencia });
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={editando ? 'Editar Cliente' : 'Novo Cliente'}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving
              ? 'Salvando...'
              : editando
                ? (segmentadoNovo && lojasFinais.length > 1 ? `Salvar + criar ${lojasFinais.length - 1} loja(s)` : 'Salvar')
                : (segmentadoNovo ? `Criar ${lojasFinais.length || ''} loja(s)` : 'Salvar')}
          </Button>
        </>
      }
    >
            {editando && initial.grupo && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <Badge variant="warning">Grupo: {initial.grupo}</Badge>
              </div>
            )}

            <Field label={segmentadoNovo ? 'Empresa / grupo (rede)' : 'Empresa'}>
              <Input tone="modal" autoFocus value={empresa} onChange={(e) => setEmpresa(e.target.value)} required />
            </Field>

            <Field label="Monitor responsável">
              <Select tone="modal" value={monitor} onChange={(e) => setMonitor(e.target.value)}>
                <option value="">Nenhum</option>
                {monitorOpcoes.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>

            <Field label="Status">
              <Select tone="modal" value={status} onChange={(e) => setStatus(e.target.value)}>
                {(statusOpcoes.length ? statusOpcoes : [...CLIENTE_STATUS_OPCOES]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>

            <Field label="Estado">
              <Select tone="modal" value={estado} onChange={(e) => setEstado(e.target.value)}>
                {CLIENTE_ESTADO_OPCOES.map((e) => <option key={e} value={e}>{e}</option>)}
              </Select>
            </Field>

            <Field label="Local">
              <Select tone="modal" value={local} onChange={(e) => setLocal(e.target.value)}>
                <option value="">Não informado</option>
                {localOpcoes.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </Field>

            <Field as="div" label="Serviços">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {servicoOpcoes.length === 0 && (
                  <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>
                    Nenhum serviço cadastrado — adicione em Configurações.
                  </span>
                )}
                {servicoOpcoes.map((s) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <label className="check-row">
                      <input type="checkbox" checked={servicos.includes(s)} onChange={() => toggleServico(s)} /> {s}
                    </label>
                    {servicos.includes(s) && (
                      <label className="check-row" style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'none' }}>
                        <input type="checkbox" checked={servicosIndependentes.includes(s)} onChange={() => toggleIndependente(s)} /> Independente
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </Field>

            <Field label="Tipo de análise">
              <Select tone="modal" value={tipoAnalise} onChange={(e) => setTipoAnalise(e.target.value as TipoAnalise)}>
                <option value="unitaria">{TIPO_ANALISE_LABEL.unitaria}</option>
                <option value="segmentado">{TIPO_ANALISE_LABEL.segmentado}</option>
              </Select>
              {editando && tipoAnalise === 'segmentado' && (
                <span className="text-text-muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 'normal' }}>
                  Adicione lojas abaixo para dividir este cliente em vários (a primeira renomeia o atual; as demais são criadas). Sem lojas, só marca o tipo.
                </span>
              )}
            </Field>

            {segmentadoNovo && (
              <Field as="div" label={<>Lojas <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· cada loja vira um cliente</span></>}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 8 }}>
                  {lojas.length === 0 && (
                    <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhuma loja adicionada.</span>
                  )}
                  {lojas.map((l) => (
                    <Badge key={l} variant="muted" style={{ gap: 6 }}>
                      {l}
                      <button type="button" onClick={() => removerLoja(l)} aria-label="Remover" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex' }}>
                        <X size={12} />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex-row">
                  <Input
                    tone="modal"
                    placeholder="Nome da loja..."
                    value={novaLoja}
                    onChange={(e) => setNovaLoja(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarLoja(); } }}
                  />
                  <Button type="button" variant="primary" size="icon" onClick={adicionarLoja} disabled={!novaLoja.trim()}><Plus size={16} /></Button>
                </div>
                {base && lojasFinais.length > 0 && (
                  <p className="text-text-muted" style={{ fontSize: 12, marginTop: 8, textTransform: 'none', letterSpacing: 'normal' }}>
                    {editando
                      ? <>Este cliente vira <strong>{`${initial.grupo || base} - ${lojasFinais[0]}`}</strong>{lojasFinais.length > 1 ? <> e serão criados: {lojasFinais.slice(1).map((l) => `${initial.grupo || base} - ${l}`).join(', ')}</> : null}.</>
                      : <>Serão criados {lojasFinais.length} cliente(s): {lojasFinais.map((l) => `${base} - ${l}`).join(', ')}</>}
                  </p>
                )}
              </Field>
            )}

            <Field label="Observação">
              <Textarea tone="modal" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </Field>

            <Field as="div" label={<>Links externos <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· opcional, vira botão de acesso no cadastro</span></>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input tone="modal" type="url" placeholder="Link do Power BI deste cliente" value={linkPowerBI} onChange={(e) => setLinkPowerBI(e.target.value)} />
                <Input tone="modal" type="url" placeholder="Link da Plataforma deste cliente" value={linkPlataforma} onChange={(e) => setLinkPlataforma(e.target.value)} />
              </div>
            </Field>

            <Field as="div" label="Relatório automático">
              <label className="check-row" style={{ margin: '0.25rem 0' }}>
                <input type="checkbox" checked={relatorioAtivo} onChange={(e) => setRelatorioAtivo(e.target.checked)} /> Gerar relatórios automaticamente na agenda
              </label>
              {relatorioAtivo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  <div className="flex-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <Field className="w-[100px]" label="A cada">
                      <Input
                        tone="modal" type="number" min={1}
                        value={relatorioNumero}
                        onChange={(e) => setRelatorioNumero(Number(e.target.value))}
                      />
                    </Field>
                    <Field className="flex-1" label="Unidade">
                      <Select tone="modal" value={relatorioUnidade} onChange={(e) => setRelatorioUnidade(e.target.value as UnidadeCadenciaRelatorio)}>
                        {UNIDADES_CADENCIA.map((u) => (<option key={u} value={u}>{UNIDADE_CADENCIA_LABEL[u]}</option>))}
                      </Select>
                    </Field>
                  </div>
                  {relatorioUnidade === 'personalizado' && (
                    <div>
                      <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal', display: 'block', marginBottom: 6 }}>
                        Dias da semana — "A cada" acima vira "a cada N semanas" nesses dias.
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {DIAS_SEMANA.map((d) => (
                          <Chip key={d.v} variant="toggle" active={relatorioDiasSemana.includes(d.v)} onClick={() => toggleRelatorioDiaSemana(d.v)}>{d.label}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Field>
    </ModalShell>
  );
}
