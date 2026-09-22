import { useEffect, useState } from 'react';
import { verificarNotificacoesSuportadas, dispararNotificacaoNativa } from '../../api/client';
import { toastError, toastSuccess } from '../../utils/toast';
import { usePersistedState } from '../../hooks/usePersistedState';
import {
  CATEGORIA_NOTIFICACAO_LABEL, PREFS_NOTIFICACAO_CHAVE, PREFS_NOTIFICACAO_PADRAO,
  type CategoriaNotificacao, type PrefsNotificacao,
} from '../../utils/notificacoesNativas';
import { Button, Card } from '../../ui';

const CATEGORIAS = Object.keys(CATEGORIA_NOTIFICACAO_LABEL) as CategoriaNotificacao[];

/**
 * Toast nativo do Windows (não confundir com o toast in-app do ReminderPopup)
 * — mesma limitação de "Iniciar com o Windows": só aparece de fato na tela de
 * quem abriu o app pelo `.exe` local, então o card só mostra os toggles reais
 * quando `suportado` (verificado pelo mesmo critério no backend).
 */
export default function NotificacoesWindowsCard() {
  const [suportado, setSuportado] = useState<boolean | null>(null);
  const [prefs, setPrefs] = usePersistedState<PrefsNotificacao>(PREFS_NOTIFICACAO_CHAVE, PREFS_NOTIFICACAO_PADRAO);
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    verificarNotificacoesSuportadas().then((s) => setSuportado(s.suportado)).catch(() => setSuportado(false));
  }, []);

  function alternar(categoria: CategoriaNotificacao) {
    setPrefs((prev) => ({ ...prev, [categoria]: !prev[categoria] }));
  }

  async function testar() {
    setTestando(true);
    try {
      await dispararNotificacaoNativa('CARTEIRA 2D', 'Notificação de teste — se você está vendo isto no Windows, está funcionando.');
      toastSuccess('Notificação enviada — confira o canto da tela.');
    } catch {
      toastError('Não foi possível disparar a notificação de teste.');
    } finally {
      setTestando(false);
    }
  }

  if (suportado === null) return null;

  return (
    <Card flat>
      <div className="section-header">
        <h3>Notificações do Windows</h3>
      </div>
      {suportado ? (
        <>
          <p className="text-text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
            Além do aviso na própria tela, mostra um toast nativo do Windows nesta máquina para as categorias marcadas abaixo.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {CATEGORIAS.map((categoria) => (
              <label key={categoria} className="check-row" style={{ fontSize: '0.85rem' }}>
                <input type="checkbox" checked={prefs[categoria]} onChange={() => alternar(categoria)} />
                {CATEGORIA_NOTIFICACAO_LABEL[categoria]}
              </label>
            ))}
          </div>
          <div className="flex-row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={testar} disabled={testando}>
              {testando ? 'Enviando…' : 'Testar notificação'}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-text-secondary" style={{ fontSize: '0.85rem' }}>
          Disponível só abrindo o sistema pelo <code>2D_Carteira.exe</code> local — acessando pelo navegador/rede não
          é possível saber em qual tela deveria aparecer o aviso.
        </p>
      )}
    </Card>
  );
}
