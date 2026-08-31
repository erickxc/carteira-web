import { useCallback, useEffect, useState } from 'react';
import { ModalShell } from '../ModalShell';
import { Badge, Button, Field, Select } from '../../ui';
import { toastError, toastSuccess } from '../../utils/toast';
import {
  buscarSugestoesVinculo, vincularLojaAlvos,
  type LojaVinculoAlvos,
} from '../../api/client';
import { useCarteira } from '../../context/CarteiraContext';

interface VincularLojaModalProps {
  empresa: string;
  onClose: () => void;
  /** Chamado depois de qualquer vínculo confirmado, pra tela recarregar o resumo. */
  onVinculado: () => void;
}

const CONFIANCA_LABEL: Record<LojaVinculoAlvos['candidatos'][number]['confianca'], string> = {
  alta: 'alta confiança', media: 'confiança média', baixa: 'baixa confiança',
};

/**
 * Confirma o vínculo loja↔cliente de uma empresa dos Dados Alvos.
 *
 * Nunca decide sozinho: mostra a sugestão calculada (balcão/sigla, ver
 * `server/alvos/mapa.cjs`) com o motivo, mas quem grava é sempre uma escolha
 * explícita da pessoa — inclusive "nenhum destes", que limpa o vínculo em vez
 * de deixar um id errado gravado.
 *
 * Primeira leitura força `forcar=1` implicitamente via a rota (sem cache) —
 * é ação deliberada de tela, o único lugar do app onde 20s de espera é
 * esperado e sinalizado.
 */
export function VincularLojaModal({ empresa, onClose, onVinculado }: VincularLojaModalProps) {
  const { clientes } = useCarteira();
  const [lojas, setLojas] = useState<LojaVinculoAlvos[] | null>(null);
  const [relendo, setRelendo] = useState(false);
  const [salvandoLoja, setSalvandoLoja] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const ativos = clientes.filter((c) => (c.estado || 'Ativo') !== 'Inativo');

  // Sem setState síncrono no corpo — só dentro do `.then`/`.catch`, que roda
  // depois de um microtask. É o que permite chamar `carregar()` direto do
  // efeito abaixo sem cair na regra que bane setState síncrono em efeito
  // (mesmo padrão de `AlertasIA.buscar`). `lojas === null` já é o indicador de
  // "carregando pela 1ª vez"; `relendo` cobre só o clique manual de reler.
  const carregar = useCallback((forcar = false) => buscarSugestoesVinculo(empresa, forcar)
    .then((dados) => { setLojas(dados); setErro(null); })
    .catch((err) => {
      setErro(err instanceof Error ? err.message : 'Falha ao ler os dados de vendas desta empresa.');
      setLojas([]);
    }), [empresa]);

  useEffect(() => { carregar(); }, [carregar]);

  function relerArquivo() {
    setRelendo(true);
    carregar(true).finally(() => setRelendo(false));
  }

  async function confirmar(loja: string, clientId: string | null) {
    setSalvandoLoja(loja);
    try {
      await vincularLojaAlvos(empresa, loja, clientId);
      toastSuccess(clientId ? 'Loja vinculada.' : 'Vínculo removido.');
      onVinculado();
      await carregar();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao gravar o vínculo.');
    } finally {
      setSalvandoLoja(null);
    }
  }

  return (
    <ModalShell
      title={`Vincular lojas — ${empresa}`}
      onClose={onClose}
      onSubmit={(e) => e.preventDefault()}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={relerArquivo} disabled={relendo}>
            {relendo ? 'Lendo arquivo...' : 'Reler arquivo (ignorar cache)'}
          </Button>
          <Button variant="primary" onClick={onClose}>Fechar</Button>
        </>
      }
    >
      {lojas === null && !erro && (
        <p className="text-[0.85rem] text-text-muted">
          Lendo o arquivo de vendas desta empresa — pode levar até ~20 segundos em arquivos grandes.
        </p>
      )}

      {erro && <p className="text-[0.85rem]" style={{ color: 'var(--danger-fg)' }}>{erro}</p>}

      {lojas && lojas.length === 0 && !erro && (
        <p className="text-[0.85rem] text-text-muted">Nenhuma loja encontrada no arquivo desta empresa.</p>
      )}

      <div className="flex flex-col gap-3">
        {lojas?.map((l) => (
          <div key={l.loja} className="p-3 rounded-sm bg-card border border-border-strong flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[0.85rem]">{l.loja}</span>
              <span className="text-[0.78rem] text-text-muted">
                receita: R$ {l.receita.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
              {l.vinculado && (
                <Badge variant="accent">
                  vinculado a {ativos.find((c) => c.id === l.vinculado)?.empresa ?? l.vinculado}
                </Badge>
              )}
              {l.ambiguo && <Badge variant="warning">candidatos ambíguos — confira antes de escolher</Badge>}
            </div>

            {l.sugestao && !l.vinculado && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[0.8rem] text-text-muted">
                  Sugestão: <strong>{l.sugestao.empresa}</strong> ({CONFIANCA_LABEL[l.sugestao.confianca]} — {l.sugestao.motivo})
                </span>
                <Button
                  variant="primary"
                  disabled={salvandoLoja === l.loja}
                  onClick={() => confirmar(l.loja, l.sugestao!.clientId)}
                  style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                >
                  Confirmar
                </Button>
              </div>
            )}

            <Field label="Ou escolha manualmente">
              <div className="flex items-center gap-2">
                <Select
                  tone="modal"
                  value={l.vinculado ?? ''}
                  disabled={salvandoLoja === l.loja}
                  onChange={(e) => confirmar(l.loja, e.target.value || null)}
                >
                  <option value="">Nenhum / desvincular</option>
                  {ativos.map((c) => (
                    <option key={c.id} value={c.id}>{c.empresa}</option>
                  ))}
                </Select>
              </div>
            </Field>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
