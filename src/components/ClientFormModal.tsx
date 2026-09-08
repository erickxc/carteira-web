import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import { ModalShell } from './ModalShell';
import { SelectField } from './SelectField';
import { Dropdown } from './Dropdown';
import { DIAS_SEMANA } from '../utils/diasSemana';
import { ehLojaPrincipal, lojaPrincipal } from '../utils/gruposLojas';
import { Badge, Button, Chip, Field, Input, SecaoLabel, Textarea } from '../ui';
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
  const { clientes, criarCliente, criarClientesEmLote, atualizarCliente, opcoesPorTipo, categoriasPorTipo } = useCarteira();
  // Links de Power BI (e a credencial do Price) só são editados pela loja
  // PRINCIPAL do grupo (a mais antiga) — as outras lojas da mesma rede
  // reaproveitam os da principal na tela de listagem (ver gruposLojas.ts,
  // AcessosExternosButton). Sem grupo, o cliente é sempre "principal" de
  // si mesmo, então isso não muda nada pra cadastro avulso.
  const ehPrincipal = !initial || ehLojaPrincipal(initial, clientes);
  const nomePrincipalDoGrupo = initial?.grupo && !ehPrincipal ? lojaPrincipal(initial.grupo, clientes)?.empresa : undefined;
  const servicoOpcoes = opcoesPorTipo('servico');
  const statusOpcoes = [...CLIENTE_STATUS_OPCOES];
  const monitorOpcoes = opcoesPorTipo('monitor');
  const localOpcoes = opcoesPorTipo('local_cliente');
  const linhaOpcoes = opcoesPorTipo('linha_cliente');
  const editando = !!initial;

  const [empresa, setEmpresa] = useState(initial?.empresa ?? '');
  const [monitor, setMonitor] = useState(initial?.monitor ?? '');
  const [servicos, setServicos] = useState<string[]>(initial?.servicos ?? []);
  const [servicosIndependentes, setServicosIndependentes] = useState<string[]>(initial?.servicosIndependentes ?? []);
  const statusLegado = /^(ativ|inativ|suspens)/i.test(initial?.status ?? '');
  const [status, setStatus] = useState(statusLegado ? 'Regular' : (initial?.status ?? 'Regular'));
  const [estado, setEstado] = useState(initial?.estado ?? (/^(ativ|gratuidade)/i.test(initial?.status ?? '') ? 'Ativo' : 'Inativo'));
  // Pausa temporária — conceito à parte de status/estado (ver Cliente.pausadoAte
  // em types/index.ts pro porquê). Data em input type="date" (string
  // "AAAA-MM-DD"); vazio = sem pausa.
  const [pausadoAte, setPausadoAte] = useState(initial?.pausadoAte ? initial.pausadoAte.slice(0, 10) : '');
  const [motivoPausa, setMotivoPausa] = useState(initial?.motivoPausa ?? '');
  const [observacao, setObservacao] = useState(initial?.observacao ?? '');
  const [local, setLocal] = useState(initial?.local ?? '');
  const [linha, setLinha] = useState(initial?.linha ?? '');
  const [endereco, setEndereco] = useState(initial?.endereco ?? '');
  const [linksServicos, setLinksServicos] = useState<Record<string, string>>(initial?.linksServicos ?? {});
  const [loginPrice, setLoginPrice] = useState(initial?.loginPrice ?? '');
  // Nunca vem preenchido do servidor (a senha não trafega em texto puro numa
  // leitura) — campo vazio SEMPRE ao abrir o cadastro. Vazio ao salvar = "não
  // mexer na senha atual" (ver server/routes/clients.cjs, prepararPatchPrice);
  // `temSenhaPrice` é só o que diz se já existe uma, pro placeholder.
  const [senhaPrice, setSenhaPrice] = useState('');
  // true = ao salvar, apaga login+senha do Price de vez (envia `senhaPrice:
  // null`, que o backend trata como remoção explícita — ver prepararPatchPrice).
  // Existe porque limpar só o campo Login não bastava pra remover o acesso:
  // a senha continuava guardada (campo de senha vazio = "não mexer"), então
  // o botão de abrir o Price seguia funcionando com a senha antiga mesmo com
  // o login em branco na tela — reportado como bug real.
  const [removerCredencialPrice, setRemoverCredencialPrice] = useState(false);
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
          monitor, servicos, servicosIndependentes, estado, status, observacao, local, linha, endereco, linksServicos, relatorioCadencia, pausadoAte: pausadoAte || undefined, motivoPausa: pausadoAte ? motivoPausa : undefined,
        });
        if (resto.length > 0) {
          const novos: NovoCliente[] = resto.map((nome) => ({
            empresa: `${grupo} - ${nome}`,
            grupo,
            tipoAnalise: 'segmentado',
            monitor, servicos, servicosIndependentes, estado, status, observacao, local, linha, endereco, linksServicos, relatorioCadencia, pausadoAte: pausadoAte || undefined, motivoPausa: pausadoAte ? motivoPausa : undefined,
          }));
          await criarClientesEmLote(novos);
        }
      } else if (editando) {
        await atualizarCliente(initial.id, {
          empresa: base, monitor, servicos, servicosIndependentes, estado, status, observacao, local, linha, endereco, linksServicos, tipoAnalise, relatorioCadencia, pausadoAte: pausadoAte || undefined, motivoPausa: pausadoAte ? motivoPausa : undefined,
          loginPrice: removerCredencialPrice ? '' : loginPrice,
          senhaPrice: removerCredencialPrice ? null : (senhaPrice.trim() || undefined),
        });
      } else if (tipoAnalise === 'segmentado') {
        if (lojasFinais.length === 0) { toastError('Adicione ao menos uma loja para a análise segmentada.'); setSaving(false); return; }
        const novos: NovoCliente[] = lojasFinais.map((nome) => ({
          empresa: `${base} - ${nome}`,
          grupo: base,
          tipoAnalise: 'segmentado',
          monitor, servicos, servicosIndependentes, estado, status, observacao, local, linha, endereco, linksServicos, relatorioCadencia, pausadoAte: pausadoAte || undefined, motivoPausa: pausadoAte ? motivoPausa : undefined,
        }));
        await criarClientesEmLote(novos);
      } else {
        await criarCliente({
          empresa: base, monitor, servicos, servicosIndependentes, estado, status, observacao, local, linha, endereco, linksServicos, tipoAnalise: 'unitaria', relatorioCadencia, pausadoAte: pausadoAte || undefined, motivoPausa: pausadoAte ? motivoPausa : undefined,
          loginPrice, senhaPrice: senhaPrice.trim() || undefined,
        });
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

            <SecaoLabel>Identificação</SecaoLabel>

            <Field label={segmentadoNovo ? 'Empresa / grupo (rede)' : 'Empresa'}>
              <Input tone="modal" autoFocus value={empresa} onChange={(e) => setEmpresa(e.target.value)} required />
            </Field>

            <Field label="Endereço">
              <Input tone="modal" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade/UF" />
            </Field>

            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <SelectField
                className="flex-1"
                label="Monitor responsável"
                placeholder="Nenhum"
                value={monitor}
                onChange={setMonitor}
                options={[{ value: '', label: 'Nenhum' }, ...monitorOpcoes.map((m) => ({ value: m, label: m }))]}
              />

              <SelectField
                className="flex-1"
                label="Segmento"
                placeholder="Não informado"
                value={local}
                onChange={setLocal}
                options={[{ value: '', label: 'Não informado' }, ...localOpcoes.map((l) => ({ value: l, label: l }))]}
              />

              <SelectField
                className="flex-1"
                label="Linha"
                placeholder="Não informada"
                value={linha}
                onChange={setLinha}
                options={[{ value: '', label: 'Não informada' }, ...linhaOpcoes.map((l) => ({ value: l, label: l }))]}
              />
            </div>

            <SecaoLabel>Situação</SecaoLabel>

            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <SelectField
                className="flex-1"
                label="Status"
                value={status}
                onChange={setStatus}
                options={(statusOpcoes.length ? statusOpcoes : [...CLIENTE_STATUS_OPCOES]).map((s) => ({ value: s, label: s }))}
              />

              <SelectField
                className="flex-1"
                label="Estado"
                value={estado}
                onChange={setEstado}
                options={CLIENTE_ESTADO_OPCOES.map((e) => ({ value: e, label: e }))}
              />
            </div>

            {/* Pausa temporária — conceito à parte de Status/Estado: não muda
                a "situação" do cliente, só tira ele da fila de cadência por
                um período com data de volta automática (sem precisar lembrar
                de reverter status manualmente depois). */}
            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Field className="flex-1" label="Pausado até (opcional)">
                <Input tone="modal" type="date" value={pausadoAte} onChange={(e) => setPausadoAte(e.target.value)} />
              </Field>
              {pausadoAte && (
                <Field className="flex-1" label="Motivo da pausa">
                  <Input tone="modal" value={motivoPausa} onChange={(e) => setMotivoPausa(e.target.value)} placeholder="Ex.: Obra fechada, férias coletivas..." />
                </Field>
              )}
            </div>
            {pausadoAte && (
              <p className="text-[0.78rem] text-text-muted" style={{ marginTop: -8, marginBottom: 16 }}>
                O cliente some da fila de Ações até essa data e volta sozinho no dia seguinte — sem precisar mudar Status/Estado.
              </p>
            )}

            <SecaoLabel>Serviços</SecaoLabel>

            <Field as="div" label="Serviços contratados">
              {servicoOpcoes.length === 0 ? (
                <span className="text-text-muted" style={{ fontSize: 13, textTransform: 'none' }}>
                  Nenhum serviço cadastrado — adicione em Configurações.
                </span>
              ) : (
                <div className="flex flex-wrap gap-2" style={{ marginTop: 4 }}>
                  {servicoOpcoes.map((s) => (
                    <Chip key={s} variant="toggle" active={servicos.includes(s)} onClick={() => toggleServico(s)}>{s}</Chip>
                  ))}
                </div>
              )}
              {/* "Independente" só faz sentido pra serviço já contratado — lista
                  separada abaixo em vez de um segundo controle grudado em cada
                  chip, que ficava apertado e confuso de ler. */}
              {servicos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                  <span className="text-text-muted" style={{ fontSize: 11, textTransform: 'none', letterSpacing: 'normal' }}>
                    Independente (o cliente faz sozinho, não depende de reunião/monitoria):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {servicos.map((s) => (
                      <label key={s} className="check-row" style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'none' }}>
                        <input type="checkbox" checked={servicosIndependentes.includes(s)} onChange={() => toggleIndependente(s)} /> {s}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </Field>

            <SecaoLabel>Estrutura</SecaoLabel>

            <Field as="div" label="Tipo de análise">
              <Dropdown
                variant="campo"
                label={TIPO_ANALISE_LABEL.unitaria}
                value={tipoAnalise}
                onChange={(v) => setTipoAnalise(v as TipoAnalise)}
                options={[
                  { value: 'unitaria', label: TIPO_ANALISE_LABEL.unitaria },
                  { value: 'segmentado', label: TIPO_ANALISE_LABEL.segmentado },
                ]}
              />
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
                  <Button type="button" variant="primary" size="icon" onClick={adicionarLoja} disabled={!novaLoja.trim()} title="Adicionar loja"><Plus size={16} /></Button>
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

            <SecaoLabel>Notas e links</SecaoLabel>

            <Field label="Observação">
              <Textarea tone="modal" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </Field>

            {/* Só serviços marcados como "PowerBI" (Configurações → Categorias
                → Serviço) E que este cliente já tem contratado — o link é
                por (cliente, serviço), não um campo genérico fixo. Sem
                nenhum serviço PowerBI contratado, a seção nem aparece.
                Um campo POR serviço, todos visíveis ao mesmo tempo — a versão
                anterior tinha um seletor único escondendo os outros serviços
                atrás de um dropdown, e "adicionar o link do segundo serviço"
                não era nada óbvio (bug real relatado: cliente com Monitoria +
                OptiMarco só mostrava campo pra editar um dos dois). */}
            {(() => {
              const servicosPowerBI = categoriasPorTipo('servico').filter((c) => c.tipoLink === 'powerbi' && servicos.includes(c.valor));
              if (servicosPowerBI.length === 0) return null;
              // Loja que não é a principal do grupo: os links (e o botão de
              // acesso na listagem) vêm da principal, não daqui — editar
              // nesta tela não teria efeito nenhum na tabela, então nem
              // mostra o campo (evitava confusão: usuário editava aqui e o
              // botão de acesso continuava mostrando o link antigo).
              if (!ehPrincipal) {
                return (
                  <Field as="div" label="Links PowerBI">
                    <p className="text-[0.8rem] text-text-muted" style={{ margin: 0 }}>
                      Esta loja faz parte do grupo "{initial?.grupo}" — os links de acesso ficam cadastrados em{' '}
                      <strong>{nomePrincipalDoGrupo}</strong> (a loja mais antiga do grupo), não aqui.
                    </p>
                  </Field>
                );
              }
              return (
                <Field as="div" label={<>Links PowerBI <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· um por serviço, vira botão de acesso no cadastro</span></>}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {servicosPowerBI.map((c) => (
                      <div key={c.valor} className="flex-row" style={{ gap: 8, alignItems: 'center' }}>
                        <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal', width: 110, flexShrink: 0 }}>{c.valor}</span>
                        <Input
                          tone="modal"
                          type="url"
                          placeholder={`Link do ${c.valor} deste cliente`}
                          value={linksServicos[c.valor] ?? ''}
                          onChange={(e) => setLinksServicos((prev) => ({ ...prev, [c.valor]: e.target.value }))}
                          style={{ flex: 1 }}
                        />
                      </div>
                    ))}
                  </div>
                </Field>
              );
            })()}

            {/* Login do cliente no Price — só aparece se o cliente tem o
                serviço contratado. A senha nunca vem preenchida do servidor
                (não trafega em texto puro numa leitura); o placeholder avisa
                se já existe uma salva, sem revelar o valor. Deixar em branco
                ao salvar preserva a senha atual — só troca se digitar algo
                novo. Fase 2 (ainda não construída): um programa auxiliar por
                máquina usa esse login/senha pra abrir o Price já logado. */}
            {servicos.includes('Precificação') && (
              <Field as="div" label="Login no Price">
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    tone="modal"
                    placeholder="Login"
                    value={removerCredencialPrice ? '' : loginPrice}
                    onChange={(e) => setLoginPrice(e.target.value)}
                    disabled={removerCredencialPrice}
                    style={{ flex: 1 }}
                  />
                  <Input
                    tone="modal"
                    type="password"
                    placeholder={removerCredencialPrice ? 'será removida' : initial?.temSenhaPrice ? '•••••• (senha já salva — deixe em branco pra manter)' : 'Senha'}
                    value={senhaPrice}
                    onChange={(e) => setSenhaPrice(e.target.value)}
                    disabled={removerCredencialPrice}
                    style={{ flex: 1 }}
                  />
                </div>
                {/* Limpar só o campo Login não apagava a credencial — a senha
                    continuava guardada (campo vazio = "não mexer"), então o
                    acesso ao Price seguia funcionando com a senha antiga
                    mesmo com o login em branco na tela. Isso é a forma
                    explícita de remover os dois de vez. */}
                {initial?.temSenhaPrice && (
                  removerCredencialPrice ? (
                    <p className="text-[0.78rem] text-danger" style={{ marginTop: 4 }}>
                      Login e senha do Price serão removidos ao salvar.{' '}
                      <button type="button" className="link-button" onClick={() => setRemoverCredencialPrice(false)}>Desfazer</button>
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="link-button text-[0.78rem] text-text-muted"
                      style={{ marginTop: 4 }}
                      onClick={() => setRemoverCredencialPrice(true)}
                    >
                      Remover credencial do Price
                    </button>
                  )
                )}
              </Field>
            )}

            <SecaoLabel>Automação</SecaoLabel>

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
                    <SelectField
                      className="flex-1"
                      label="Unidade"
                      value={relatorioUnidade}
                      onChange={(v) => setRelatorioUnidade(v as UnidadeCadenciaRelatorio)}
                      options={UNIDADES_CADENCIA.map((u) => ({ value: u, label: UNIDADE_CADENCIA_LABEL[u] }))}
                    />
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
