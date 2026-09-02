import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Link2, MessageSquare, RefreshCw } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { usePersistedState } from '../../hooks/usePersistedState';
import {
  buscarAlertasAlvos, buscarCadastroAlvos, buscarEmpresasAlvos,
  type AlertaAlvos, type LinhaCadastroAlvos, type ResumoCadastroAlvos,
} from '../../api/client';
import { Badge, Button, Card } from '../../ui';
import { VincularLojaModal } from './VincularLojaModal';

/**
 * Dashboard de cadastro da integração "Dados Alvos", dentro do módulo
 * Carteira (`/clientes`) — duas seções:
 *
 * - **Cadastro**: integridade — cliente sem loja vinculada, vínculo quebrado
 *   (a loja não existe mais no arquivo de origem), campo Local vazio. É
 *   trabalho de CADASTRO, resolvido aqui mesmo (botão abre o vínculo).
 * - **Alertas**: o que o cálculo de acompanhamento (retorno do combinado)
 *   encontrou — mesmo formato dos alertas do monitorIA, cada um com o botão
 *   "Conversar sobre isso" levando ao chat já com a pergunta pronta.
 *
 * Painel fica RECOLHIDO por padrão (estado persistido) quando não há
 * pendência — não é pra ocupar espaço permanente numa tela que hoje não usa
 * a integração; abre sozinho quando há algo a resolver.
 */

const ROTULO_ESTADO: Record<LinhaCadastroAlvos['estadoAlvos'], string> = {
  ok: 'ok',
  sem_vinculo: 'sem loja vinculada',
  vinculo_quebrado: 'vínculo quebrado',
};

export default function PainelCadastroAlvos() {
  const navigate = useNavigate();
  const { filtroMonitor } = useCarteira();
  // Default ABERTO: a alternativa (fechado por padrão + auto-abrir na 1ª
  // pendência) exigiria setState síncrono dentro de um efeito só pra "abrir
  // sozinho quando há algo a resolver" — mais uma fonte de cascata de render
  // pra um ganho pequeno. Começa RECOLHIDO por padrão (pedido do usuário: a
  // Carteira abre direto na lista de clientes, não neste painel) — quem abrir
  // fica com a preferência persistida daí em diante.
  const [aberto, setAberto] = usePersistedState('alvos:painel:aberto', false);
  const [abaAtiva, setAbaAtiva] = useState<'cadastro' | 'alertas'>('cadastro');

  const [resumo, setResumo] = useState<ResumoCadastroAlvos | null>(null);
  const [linhas, setLinhas] = useState<LinhaCadastroAlvos[] | null>(null);
  const [alertasBrutos, setAlertasBrutos] = useState<AlertaAlvos[] | null>(null);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [empresaVinculo, setEmpresaVinculo] = useState<string | null>(null);
  const [recarregando, setRecarregando] = useState(false);

  const alertas = useMemo(
    () => (alertasBrutos ?? []).filter((a) => filtroMonitor === 'Todos' || a.monitor === filtroMonitor),
    [alertasBrutos, filtroMonitor],
  );

  const carregar = useCallback(() => Promise.all([
    buscarCadastroAlvos().then((r) => { setResumo(r.resumo); setLinhas(r.linhas); }).catch(() => { setResumo(null); setLinhas([]); }),
    buscarAlertasAlvos().then(setAlertasBrutos).catch(() => setAlertasBrutos([])),
    buscarEmpresasAlvos().then(setEmpresas).catch(() => setEmpresas([])),
  ]), []);

  useEffect(() => { carregar(); }, [carregar]);

  const pendencias = (resumo?.sem_vinculo ?? 0) + (resumo?.vinculo_quebrado ?? 0);

  function recarregar() {
    setRecarregando(true);
    carregar().finally(() => setRecarregando(false));
  }

  function conversarSobre(a: AlertaAlvos) {
    navigate('/assistente', { state: { clientId: a.clientId, pergunta: a.pergunta } });
  }

  // Nada da integração existe ainda nesta base (nenhuma empresa disponível E
  // nenhum cliente cadastrado) — não vale mostrar painel vazio permanente.
  if (resumo === null && linhas !== null && linhas.length === 0 && empresas.length === 0) return null;

  return (
    <Card flat style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer p-0 text-left"
      >
        {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-[0.85rem] font-semibold text-text-primary">Integração de vendas (Dados Alvos)</span>
        {pendencias > 0 && <Badge variant="warning">{pendencias} pendência(s) de cadastro</Badge>}
        {alertas.length > 0 && <Badge variant="danger">{alertas.length} alerta(s)</Badge>}
        {resumo && pendencias === 0 && alertas.length === 0 && <Badge variant="muted">tudo ok</Badge>}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); recarregar(); }}
          disabled={recarregando}
          title="Recalcular"
          aria-label="Recalcular"
          className="ml-auto flex items-center justify-center w-6 h-6 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary transition-colors"
        >
          <RefreshCw size={13} className={recarregando ? 'animate-spin' : ''} />
        </button>
      </button>

      {aberto && (
        <div className="flex flex-col gap-3 mt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAbaAtiva('cadastro')}
              className={`text-[0.8rem] px-2 py-1 rounded-sm border-none cursor-pointer bg-transparent ${abaAtiva === 'cadastro' ? 'font-semibold text-text-primary bg-card-hover' : 'text-text-muted'}`}
            >
              Cadastro {pendencias > 0 && `(${pendencias})`}
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('alertas')}
              className={`text-[0.8rem] px-2 py-1 rounded-sm border-none cursor-pointer bg-transparent ${abaAtiva === 'alertas' ? 'font-semibold text-text-primary bg-card-hover' : 'text-text-muted'}`}
            >
              Alertas {alertas.length > 0 && `(${alertas.length})`}
            </button>
          </div>

          {abaAtiva === 'cadastro' && (
            <div className="flex flex-col gap-2">
              {resumo && (
                <p className="text-[0.78rem] text-text-muted m-0">
                  {resumo.ok} de {resumo.total} cliente(s) ativo(s) com dados de venda vinculados
                  {resumo.semLocal > 0 && <> · {resumo.semLocal} sem o campo Local preenchido</>}
                </p>
              )}
              {linhas?.filter((l) => l.estadoAlvos !== 'ok').length === 0 && (
                <p className="text-[0.8rem] text-text-muted">Nenhuma pendência de vínculo — todos os clientes com integração estão ok.</p>
              )}
              {linhas?.filter((l) => l.estadoAlvos !== 'ok').map((l) => (
                <div key={l.clientId} className="flex items-center gap-2 p-2 rounded-sm bg-card border border-border-strong flex-wrap">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span className="text-[0.8rem] font-medium">{l.empresa}</span>
                  <Badge variant={l.estadoAlvos === 'vinculo_quebrado' ? 'danger' : 'warning'}>{ROTULO_ESTADO[l.estadoAlvos]}</Badge>
                  {l.motivo && <span className="text-[0.75rem] text-text-muted">{l.motivo}</span>}
                </div>
              ))}

              {/*
                O nome do cliente na carteira nem sempre casa com o nome da
                pasta em Dados Alvos (medido: 14 de 54 clientes ativos não
                casam por texto — "RioJC" vs "Rio JC", "Só Fiat" vs "SoFiat").
                Por isso não há botão "vincular" direto por linha acima — ele
                precisaria adivinhar a pasta certa. Em vez disso, a pessoa
                escolhe a EMPRESA (que ela reconhece de cara) e resolve todas
                as lojas dela de uma vez no modal.
              */}
              {empresas.length > 0 && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[0.75rem] text-text-muted">Gerenciar vínculos por empresa:</span>
                  {empresas.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmpresaVinculo(e)}
                      className="text-[0.75rem] px-2 py-0.5 rounded-sm border border-border-strong bg-card cursor-pointer hover:bg-card-hover flex items-center gap-1"
                    >
                      <Link2 size={11} /> {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {abaAtiva === 'alertas' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {alertas.length === 0 && (
                <p className="text-[0.8rem] text-text-muted">Nenhum acompanhamento pedindo atenção agora.</p>
              )}
              {alertas.map((a) => (
                <div key={a.id} className="p-2.5 rounded-sm bg-card border border-border-strong flex flex-col gap-1.5" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span className="text-[0.8rem] font-semibold text-text-primary">{a.titulo}</span>
                    <Badge variant={a.severidade === 'alta' ? 'danger' : 'warning'} className="ml-auto shrink-0">
                      {a.severidade === 'alta' ? 'crítico' : 'atenção'}
                    </Badge>
                  </div>
                  <p className="text-[0.75rem] text-text-muted m-0">{a.detalhe}</p>
                  <Button
                    variant="secondary"
                    onClick={() => conversarSobre(a)}
                    style={{ alignSelf: 'flex-start', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    <MessageSquare size={13} /> Conversar sobre isso
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {empresaVinculo && (
        <VincularLojaModal
          empresa={empresaVinculo}
          onClose={() => setEmpresaVinculo(null)}
          onVinculado={carregar}
        />
      )}
    </Card>
  );
}
