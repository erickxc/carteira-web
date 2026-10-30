import { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { FASES, PRODUTOS_OFICIAIS, renomearProduto } from 'carteira-shared/produtos.cjs';
import { useCarteira } from '../../context/CarteiraContext';
import { atualizarRetratoDw, buscarRetratoDw } from '../../api/client';
import { produtosNoDw, type ProdutoNoDw, type RetratoDw } from '../../utils/produtosNoDw';
import { toastError } from '../../utils/toast';
import { Button, Field, SecaoLabel, Textarea } from '../../ui';
import { SelectField } from '../SelectField';
import { CampoTexto } from './CampoTexto';
import type { Cliente, ProdutoClienteTela } from '../../types';

type Patch = Partial<Cliente>;

/** Mudança de fase (ou produto novo) em edição: só grava com motivo. */
interface EdicaoFase { produto: string; fase: string; motivo: string; novo: boolean }

const ordem = (nome: string) => {
  const i = PRODUTOS_OFICIAIS.indexOf(nome);
  return i === -1 ? PRODUTOS_OFICIAIS.length : i;
};

// parseISO lê 'yyyy-MM-dd' em hora local (new Date() leria UTC e voltaria um dia).
const formatar = (iso: string | undefined, molde: string) => {
  const d = iso ? parseISO(iso) : null;
  return d && isValid(d) ? format(d, molde) : '—';
};
const mesAno = (iso: string) => formatar(iso, 'MM/yyyy');

/** Texto da coluna "No DW agora". `undefined` = produto que não existe no DW
 *  (Protocolo GPS, Raptor) ou atendimento sem loja achada no retrato. */
function textoDw(info: ProdutoNoDw | undefined) {
  if (!info) return '—';
  if (info.marcado === 0) return 'não marcado';
  if (info.marcado === info.total) return 'marcado';
  return `${info.marcado} de ${info.total} lojas`;
}

/** Divergência DW × fase, só em texto: o DW nunca altera o cadastro (spec §5). */
function divergencia(p: ProdutoClienteTela, info: ProdutoNoDw | undefined) {
  if (!info) return '';
  if (info.marcado > 0 && p.fase !== 'Ativo') return `marcado no DW, mas ${p.fase} aqui`;
  if (info.marcado === 0 && p.fase === 'Ativo') return 'Ativo aqui, mas não marcado no DW';
  return '';
}

/**
 * Bloco Produtos da ficha (1.7.0): um item por produto, na ordem oficial, com
 * fase, desde quando, último motivo, "No DW agora" e o acesso (link, login,
 * senha). Toda gravação manda a lista INTEIRA de `produtos` — o servidor
 * compara com a anterior e recusa troca de fase sem motivo novo, então a tela
 * só oferece trocar fase junto com o motivo. Produto não se remove: vira
 * Cancelado (o servidor também recusa tirar da lista).
 */
export function ProdutosCliente({ cliente, salvar, linksEditaveis, nomePrincipal }: {
  cliente: Cliente;
  salvar: (patch: Patch) => Promise<boolean>;
  /** Links ficam na loja principal do grupo (é a que o botão de acessos da Carteira usa). */
  linksEditaveis: boolean;
  nomePrincipal?: string;
}) {
  const { clientes, opcoesPorTipo } = useCarteira();
  const [edicao, setEdicao] = useState<EdicaoFase | null>(null);
  const [retrato, setRetrato] = useState<RetratoDw | null>(null);
  const [lendoDw, setLendoDw] = useState(false);

  // Retrato do DW é informativo: falhar em lê-lo só deixa a coluna com "—".
  useEffect(() => {
    let vivo = true;
    buscarRetratoDw().then((r) => { if (vivo) setRetrato(r); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const produtos = [...(cliente.produtos ?? [])].sort((a, b) => ordem(a.produto) - ordem(b.produto));
  const noDw = produtosNoDw(cliente, retrato, clientes);
  const semLojaNoDw = retrato && Object.keys(noDw).length === 0;
  const tem = new Set(produtos.map((p) => renomearProduto(p.produto)));
  const soNoDw = Object.entries(noDw).filter(([nome, i]) => i.marcado > 0 && !tem.has(nome)).map(([nome]) => nome);
  const disponiveis = [...new Set([...PRODUTOS_OFICIAIS, ...opcoesPorTipo('servico').map(renomearProduto)])]
    .filter((nome) => !tem.has(nome));

  const salvarLista = (lista: ProdutoClienteTela[]) => salvar({ produtos: lista });
  const mudar = (nome: string, campos: Partial<ProdutoClienteTela>) =>
    salvarLista(produtos.map((p) => (p.produto === nome ? { ...p, ...campos } : p)));

  async function gravarEdicao() {
    if (!edicao) return;
    const motivoFase = edicao.motivo.trim();
    const ok = edicao.novo
      ? await salvarLista([...produtos, { produto: edicao.produto, fase: edicao.fase, faseDesde: '', motivoFase }])
      : await mudar(edicao.produto, { fase: edicao.fase, motivoFase, faseDesde: '' });
    if (ok) setEdicao(null);
  }

  async function lerDw() {
    setLendoDw(true);
    try {
      setRetrato(await atualizarRetratoDw());
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Não foi possível ler o DW agora.');
    } finally {
      setLendoDw(false);
    }
  }

  const opcoesFase = FASES.map((f) => ({ value: f, label: f }));
  const editorMotivo = (e: EdicaoFase) => (
    <>
      <Field label="Motivo (obrigatório)">
        <Textarea value={e.motivo} autoFocus onChange={(ev) => setEdicao({ ...e, motivo: ev.target.value })}
          placeholder="Por que o produto está mudando de fase?" />
      </Field>
      <div className="flex gap-2" style={{ marginBottom: 14 }}>
        <Button size="sm" disabled={!e.motivo.trim()} onClick={gravarEdicao}>Salvar fase</Button>
        <Button size="sm" variant="ghost" onClick={() => setEdicao(null)}>Cancelar</Button>
      </div>
    </>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <SecaoLabel>Produtos</SecaoLabel>
        <Button variant="ghost" size="sm" carregando={lendoDw} onClick={lerDw}
          title={retrato ? `DW lido em ${formatar(retrato.geradoEm, 'dd/MM HH:mm')}` : 'DW ainda não lido'}>
          <RefreshCw size={13} /> Atualizar DW
        </Button>
      </div>
      {semLojaNoDw && (
        <p className="text-text-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Nenhuma loja deste atendimento tem CNPJ no DW — a coluna "No DW" fica sem dado.
        </p>
      )}

      {produtos.map((p) => {
        const info = noDw[renomearProduto(p.produto)];
        const aviso = divergencia(p, info);
        const emEdicao = edicao && !edicao.novo && edicao.produto === p.produto ? edicao : null;
        return (
          <details key={p.produto} style={{ marginBottom: 8 }}>
            <summary className="cursor-pointer" style={{ fontSize: 13 }}>
              <strong>{p.produto}</strong>
              <span className="text-text-secondary"> · {p.fase} desde {mesAno(p.faseDesde)} · No DW: {textoDw(info)}</span>
              {aviso && <span className="text-[color:var(--warning-fg)]"> · {aviso}</span>}
            </summary>
            <div style={{ padding: '10px 0 4px 14px' }}>
              <SelectField label="Fase" value={emEdicao?.fase ?? p.fase} options={opcoesFase}
                onChange={(fase) => setEdicao(fase === p.fase ? null : { produto: p.produto, fase, motivo: '', novo: false })} />
              {emEdicao ? editorMotivo(emEdicao) : p.motivoFase && (
                <p className="text-text-muted" style={{ fontSize: 12, margin: '-8px 0 12px' }}>Último motivo: {p.motivoFase}</p>
              )}
              <label className="check-row" style={{ fontSize: 12, marginBottom: 12 }}>
                <input type="checkbox" checked={!!p.independente} onChange={() => mudar(p.produto, { independente: !p.independente })} />
                Independente (o cliente faz sozinho — sem relógio de cadência)
              </label>
              {linksEditaveis ? (
                <Field label="Link de acesso">
                  <CampoTexto key={`l-${p.link ?? ''}`} type="url" valor={p.link ?? ''} placeholder={`Link do ${p.produto}`}
                    onSalvar={(v) => mudar(p.produto, { link: v })} />
                </Field>
              ) : (
                <p className="text-text-muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
                  Os links desta rede ficam em <strong>{nomePrincipal}</strong> (a loja mais antiga do grupo "{cliente.grupo}").
                </p>
              )}
              <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Field className="flex-1 basis-[140px]" label="Login">
                  <CampoTexto key={`lg-${p.login ?? ''}`} valor={p.login ?? ''} onSalvar={(v) => mudar(p.produto, { login: v })} />
                </Field>
                <Field className="flex-1 basis-[140px]" label="Senha">
                  {/* A senha nunca vem do servidor; vazio = manter a atual. */}
                  <CampoTexto key={`s-${p.temSenha ? 1 : 0}`} type="password" valor="" autoComplete="new-password"
                    onSalvar={(v) => { if (v) void mudar(p.produto, { senha: v }); }}
                    placeholder={p.temSenha ? '•••••• (salva — digite para trocar)' : 'Definir senha'} />
                </Field>
              </div>
              {p.temSenha && (
                <Button variant="ghost" size="sm" style={{ marginBottom: 8 }} onClick={() => mudar(p.produto, { senha: null })}>
                  Remover senha
                </Button>
              )}
            </div>
          </details>
        );
      })}

      {soNoDw.length > 0 && (
        <p className="text-[color:var(--warning-fg)]" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          Marcado no DW, mas fora do cadastro: {soNoDw.join(', ')}.
        </p>
      )}

      {edicao?.novo ? (
        <div style={{ marginTop: 8 }}>
          <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <SelectField className="flex-1 basis-[140px]" label="Produto" value={edicao.produto}
              options={disponiveis.map((d) => ({ value: d, label: d }))} onChange={(produto) => setEdicao({ ...edicao, produto })} />
            <SelectField className="flex-1 basis-[140px]" label="Fase" value={edicao.fase}
              options={opcoesFase} onChange={(fase) => setEdicao({ ...edicao, fase })} />
          </div>
          {editorMotivo(edicao)}
        </div>
      ) : disponiveis.length > 0 && (
        <Button variant="ghost" size="sm" style={{ marginBottom: 14 }}
          onClick={() => setEdicao({ produto: disponiveis[0], fase: 'Ativo', motivo: '', novo: true })}>
          Adicionar produto
        </Button>
      )}
    </>
  );
}
