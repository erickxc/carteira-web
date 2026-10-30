import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { ModalShell } from '../ModalShell';
import { Button, Field, SecaoLabel, Textarea } from '../../ui';
import { SelectField } from '../SelectField';
import { toastError, toastSuccess } from '../../utils/toast';
import { lojasDoAtendimento, planejarMudancas } from '../../utils/unirAtendimentos';
import {
  buscarEmpresasAlvos, buscarHistoricoVinculosAlvos, buscarSugestoesVinculo, buscarVinculosAlvos, vincularLojaAlvos,
  type LojaVinculoAlvos, type MudancaVinculoAlvos,
} from '../../api/client';
import { useCarteira } from '../../context/CarteiraContext';

interface UnirAtendimentosModalProps {
  onClose: () => void;
  /** Chamado depois de salvar, pra tela recarregar o que depende dos vínculos. */
  onSalvo?: () => void;
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

/**
 * "Unir atendimentos": escolher um atendimento e marcar quais lojas dos Dados
 * Alvos fazem parte dele (ex.: Altese Penha = VW, Ford, Fiat, GM + CD + EC).
 *
 * É a visão por ATENDIMENTO do mesmo arquivo de vínculos que o modal por
 * empresa (`VincularLojaModal`) edita — nada novo no dado. Uma loja só pertence
 * a um atendimento: marcar uma que está em outro MOVE (ver `planejarMudancas`).
 * Toda mudança exige motivo, que vai pro histórico (regra do usuário).
 * Lojas de mais de uma empresa num atendimento funcionam: a leitura de vendas
 * já soma as pastas (`server/alvos/consulta.cjs`) — aqui se troca a empresa e
 * marca as lojas de cada uma.
 */
export function UnirAtendimentosModal({ onClose, onSalvo }: UnirAtendimentosModalProps) {
  const { clientes, filtroMonitor } = useCarteira();
  const [vinculos, setVinculos] = useState<Record<string, Record<string, string>>>({});
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [historico, setHistorico] = useState<MudancaVinculoAlvos[]>([]);
  const [clientId, setClientId] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [lojas, setLojas] = useState<LojaVinculoAlvos[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ativos = clientes
    .filter((c) => (c.estado || 'Ativo') !== 'Inativo')
    .sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
  const nomeDe = (id: string | null) => (id ? clientes.find((c) => c.id === id)?.empresa ?? id : 'nenhum');

  // setState só dentro do `.then` — mesmo padrão de `VincularLojaModal.carregar`.
  const carregarBase = useCallback(() => Promise.all([buscarVinculosAlvos(), buscarEmpresasAlvos(), buscarHistoricoVinculosAlvos()])
    .then(([v, e, h]) => { setVinculos(v); setEmpresas(e); setHistorico(h); })
    .catch((err) => setErro(err instanceof Error ? err.message : 'Falha ao ler os vínculos.')), []);

  useEffect(() => { carregarBase(); }, [carregarBase]);

  function carregarLojas(emp: string, cid: string) {
    setLojas(null);
    setErro(null);
    return buscarSugestoesVinculo(emp)
      .then((dados) => { setLojas(dados); setMarcadas(lojasDoAtendimento(dados, cid)); })
      .catch((err) => { setErro(err instanceof Error ? err.message : 'Falha ao ler as lojas desta empresa.'); setLojas([]); });
  }

  /** Empresas onde o atendimento já tem loja, com quantas. */
  const empresasDoAtendimento = (cid: string) => Object.entries(vinculos)
    .map(([emp, mapa]) => [emp, Object.values(mapa).filter((id) => id === cid).length] as const)
    .filter(([, n]) => n > 0);

  function escolherAtendimento(cid: string) {
    setClientId(cid);
    const emp = empresasDoAtendimento(cid)[0]?.[0] ?? empresa;
    setEmpresa(emp);
    if (cid && emp) carregarLojas(emp, cid);
  }

  function escolherEmpresa(emp: string) {
    setEmpresa(emp);
    if (clientId && emp) carregarLojas(emp, clientId);
  }

  function alternar(loja: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(loja)) nova.delete(loja); else nova.add(loja);
      return nova;
    });
  }

  const mudancas = lojas && clientId ? planejarMudancas(lojas, clientId, marcadas) : [];
  const totalMarcado = (lojas ?? []).filter((l) => marcadas.has(l.loja)).reduce((s, l) => s + l.receita, 0);
  const historicoDoAtendimento = historico.filter((h) => h.de === clientId || h.para === clientId).slice(-5).reverse();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!mudancas.length || salvando) return;
    if (!motivo.trim()) { toastError('Informe o motivo da mudança.'); return; }
    setSalvando(true);
    const autor = filtroMonitor !== 'Todos' ? filtroMonitor : undefined;
    let feitas = 0;
    try {
      // Uma por vez: o arquivo de vínculos é reescrito inteiro a cada gravação.
      for (const m of mudancas) {
        await vincularLojaAlvos(empresa, m.loja, m.para, motivo.trim(), autor);
        feitas += 1;
      }
      toastSuccess(`${feitas} loja(s) atualizada(s).`);
      setMotivo('');
      onSalvo?.();
    } catch (err) {
      toastError(`${err instanceof Error ? err.message : 'Falha ao gravar.'} (${feitas} de ${mudancas.length} gravada(s))`);
    } finally {
      setSalvando(false);
      // Relê sempre — inclusive após falha no meio, pra tela mostrar o que ficou gravado.
      await carregarBase();
      await carregarLojas(empresa, clientId);
    }
  }

  return (
    <ModalShell
      title="Unir atendimentos"
      onClose={onClose}
      onSubmit={salvar}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button type="submit" variant="primary" carregando={salvando} disabled={!mudancas.length || !motivo.trim()}>
            Salvar {mudancas.length > 0 && `(${mudancas.length})`}
          </Button>
        </>
      }
    >
      <p className="text-[0.8rem] text-text-muted mt-0 mb-4">
        Escolha o atendimento e marque as lojas dos Dados Alvos que fazem parte dele. As vendas, o painel e as análises
        passam a somar as lojas marcadas.
      </p>

      <SelectField
        label="Atendimento"
        placeholder="Escolha o atendimento"
        value={clientId}
        onChange={escolherAtendimento}
        options={ativos.map((c) => ({ value: c.id, label: c.empresa }))}
      />

      {clientId && (
        <>
          <SelectField
            label="Empresa (pasta dos Dados Alvos)"
            placeholder="Escolha a empresa"
            value={empresa}
            onChange={escolherEmpresa}
            options={empresas.map((e) => ({ value: e, label: e }))}
          />
          {empresasDoAtendimento(clientId).length > 0 && (
            <p className="text-[0.75rem] text-text-muted -mt-2 mb-4">
              Hoje tem lojas em: {empresasDoAtendimento(clientId).map(([e, n]) => `${e} (${n})`).join(', ')}
            </p>
          )}
        </>
      )}

      {erro && <p className="text-[0.85rem]" style={{ color: 'var(--danger-fg)' }}>{erro}</p>}

      {clientId && empresa && lojas === null && !erro && (
        <p className="text-[0.85rem] text-text-muted">Lendo as lojas desta empresa — pode levar até ~20 segundos em arquivos grandes.</p>
      )}

      {clientId && lojas && lojas.length > 0 && (
        <>
          <SecaoLabel>Lojas de {empresa}</SecaoLabel>
          <div className="flex flex-col gap-1 mb-2">
            {lojas.map((l) => {
              const deOutro = l.vinculado && l.vinculado !== clientId;
              return (
                <label key={l.loja} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 rounded-sm border border-border-strong cursor-pointer hover:bg-card-hover">
                  <input type="checkbox" checked={marcadas.has(l.loja)} onChange={() => alternar(l.loja)} disabled={salvando} />
                  <span className="font-semibold text-[0.85rem]">{l.loja}</span>
                  <span className="text-[0.78rem] text-text-muted whitespace-nowrap">{reais(l.receita)}</span>
                  {deOutro && (
                    <span className="text-[0.75rem] text-text-muted basis-full pl-7 sm:basis-auto sm:pl-0 sm:ml-auto">
                      hoje em: {nomeDe(l.vinculado)}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="text-[0.8rem] mb-4">
            <strong>{marcadas.size} loja(s)</strong> neste atendimento · {reais(totalMarcado)}
          </p>
        </>
      )}

      {mudancas.length > 0 && (
        <>
          <SecaoLabel>O que vai mudar</SecaoLabel>
          <ul className="text-[0.8rem] mt-0 mb-3 pl-5">
            {mudancas.map((m) => (
              <li key={m.loja}>
                {m.para
                  ? <>{m.loja} entra{m.de && <> — <strong>sai de {nomeDe(m.de)}</strong></>}</>
                  : <>{m.loja} sai deste atendimento e fica sem vínculo</>}
              </li>
            ))}
          </ul>
          <Field label="Motivo (obrigatório — fica no histórico)">
            <Textarea tone="modal" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: o CD abastece as lojas da Penha" required />
          </Field>
        </>
      )}

      {historicoDoAtendimento.length > 0 && (
        <>
          <SecaoLabel>Últimas mudanças deste atendimento</SecaoLabel>
          <ul className="text-[0.75rem] text-text-muted mt-0 pl-5">
            {historicoDoAtendimento.map((h) => (
              <li key={`${h.em}-${h.loja}`}>
                {format(parseISO(h.em), 'dd/MM/yyyy HH:mm')} · {h.loja}: {nomeDe(h.de)} → {nomeDe(h.para)} · “{h.motivo}”{h.autor && ` · ${h.autor}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </ModalShell>
  );
}
