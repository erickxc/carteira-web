import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { verificarStatusFila, type StatusFila } from '../../api/client';
import { Card } from '../../ui';

/**
 * Versão expandida (com botão manual e quebra por entidade) do indicador que
 * já existe na Sidebar (`FilaStatusBadge.tsx`) — esse é só um número que soma
 * e diminui sozinho a cada 30s; este card existe pra quando esse número
 * empaca (caso real: "178 pendentes" que não baixava mesmo com o OneDrive
 * reportando sincronizado).
 *
 * "Verificar novamente" não força o OneDrive a sincronizar (não existe API
 * pra isso) — só relê os arquivos locais de `filas/pendentes/`/`resultados/`
 * na hora, sem esperar o próximo poll automático. Se o número não mudar
 * depois de clicar, o atraso é mesmo do OneDrive (ver texto de ajuda abaixo),
 * não do app — útil pra descartar uma hipótese antes de investigar mais.
 */
export default function FilaSincronizacaoCard() {
  const [status, setStatus] = useState<StatusFila | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ultimaChecagem, setUltimaChecagem] = useState<Date | null>(null);

  const buscar = useCallback(
    () => verificarStatusFila().then((s) => { setStatus(s); setUltimaChecagem(new Date()); }).catch(() => setStatus(null)),
    []
  );
  useEffect(() => { buscar(); }, [buscar]);

  function verificarNovamente() {
    setCarregando(true);
    buscar().finally(() => setCarregando(false));
  }

  // Nada pendente: não vale ocupar espaço na tela (mesmo critério da
  // FilaStatusBadge da Sidebar) — só o botão de checar sozinho, sem card em
  // volta, não faria sentido aqui.
  if (!status || status.pendentes === 0) return null;

  const entidades = Object.entries(status.porEntidade).sort((a, b) => b[1] - a[1]);

  return (
    <Card flat>
      <div className="section-header">
        <h3><CloudOff size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Sincronização com o servidor</h3>
        <button
          type="button"
          onClick={verificarNovamente}
          disabled={carregando}
          title="Reler agora, sem esperar o próximo ciclo automático"
          aria-label="Verificar novamente"
          className="flex items-center justify-center w-6 h-6 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary transition-colors"
        >
          <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>

      <p style={{ fontSize: '0.82rem', margin: '0 0 10px' }}>
        <strong>{status.pendentes}</strong> alteração(ões) desta máquina ainda aguardando confirmação do servidor
        principal{status.comErro > 0 ? ` — ${status.comErro} com erro` : ''}.
      </p>

      {entidades.length > 0 && (
        <ul style={{ display: 'grid', gap: 4, margin: '0 0 10px', paddingLeft: 18, fontSize: '0.78rem' }}>
          {entidades.map(([entidade, n]) => (
            <li key={entidade} className="text-text-secondary">{n} em {entidade}</li>
          ))}
        </ul>
      )}

      {status.ultimoErro && (
        <p style={{ fontSize: '0.78rem', color: 'var(--danger-fg)', margin: '0 0 10px' }}>
          Último erro: {status.ultimoErro}
        </p>
      )}

      <p className="text-text-secondary" style={{ fontSize: '0.75rem', margin: '0 0 4px' }}>
        Essas alterações já foram salvas nesta máquina e serão aplicadas assim que o servidor principal
        (Karol-2D) as processar — não se perdem. O botão relê os arquivos locais na hora; se o número não mudar,
        o atraso é da sincronização do próprio OneDrive (confira se o ícone dele está "sincronizado", não só
        "conectado"), não deste app.
      </p>
      {ultimaChecagem && (
        <p className="text-text-secondary" style={{ fontSize: '0.72rem', margin: 0 }}>
          Última checagem: {ultimaChecagem.toLocaleTimeString('pt-BR')}
        </p>
      )}
    </Card>
  );
}
