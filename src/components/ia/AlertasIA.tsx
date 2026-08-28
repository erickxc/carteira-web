import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, HelpCircle, MessageSquare, PhoneOff, RefreshCw } from 'lucide-react';
import { buscarAlertasIA, type AlertaIA, type SeveridadeAlerta } from '../../api/client';
import { Badge, Button } from '../../ui';

/**
 * Cartões de alerta do monitorIA — a porta de entrada da conversa.
 *
 * As análises automáticas já rodavam e ninguém olhava: viravam relatório que
 * ninguém lê. Aqui cada situação crítica aparece como cartão com um botão que
 * abre o chat JÁ com a pergunta daquele caso — o usuário não precisa formular
 * nada nem lembrar de perguntar sobre aquele cliente.
 *
 * O texto do botão manda a `pergunta` que vem do backend, literal. Formular a
 * frase aqui no frontend duplicaria regra de negócio (quem sabe o que perguntar
 * sobre "risco alto sem pauta" é quem detectou o caso).
 */

const ICONE: Record<AlertaIA['tipo'], typeof AlertTriangle> = {
  risco_sem_pauta: AlertTriangle,
  sem_contato: PhoneOff,
  vencendo: CalendarClock,
  sem_analise: HelpCircle,
};

const VARIANTE: Record<SeveridadeAlerta, 'danger' | 'warning' | 'muted'> = {
  alta: 'danger',
  media: 'warning',
  baixa: 'muted',
};

const ROTULO: Record<SeveridadeAlerta, string> = { alta: 'crítico', media: 'atenção', baixa: 'a ver' };

export default function AlertasIA({ onConversar }: { onConversar: (alerta: AlertaIA) => void }) {
  const [alertas, setAlertas] = useState<AlertaIA[] | null>(null);
  const [recarregando, setRecarregando] = useState(false);

  // `buscar` não mexe em estado de forma síncrona — é o que o efeito chama.
  // Falha vira "sem alertas", não erro na cara do usuário: é painel auxiliar,
  // não pode impedir o uso do chat.
  const buscar = useCallback(
    () => buscarAlertasIA().then(setAlertas).catch(() => setAlertas([])),
    [],
  );

  useEffect(() => { buscar(); }, [buscar]);

  // O spinner só existe no recarregar manual: na carga inicial quem indica
  // "ainda não sei" é o estado `null` abaixo.
  function recarregar() {
    setRecarregando(true);
    buscar().finally(() => setRecarregando(false));
  }

  // `null` = ainda carregando; `[]` = carteira sem pendência. Os dois não
  // podem parecer a mesma coisa: "nada aqui" logo ao abrir a tela seria lido
  // como "está tudo bem" antes de o servidor ter respondido.
  if (alertas === null) return null;

  if (alertas.length === 0) {
    return (
      <p className="text-[0.82rem] text-text-muted">
        Nenhum alerta crítico agora — nenhum cliente em risco alto sem reunião, sem contato prolongado ou com cadência vencendo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[0.8rem] font-semibold text-text-primary">O que precisa de atenção agora</span>
        <button
          type="button"
          onClick={recarregar}
          disabled={recarregando}
          title="Recalcular"
          aria-label="Recalcular alertas"
          className="ml-auto flex items-center justify-center w-6 h-6 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary transition-colors"
        >
          <RefreshCw size={13} className={recarregando ? 'animate-spin' : ''} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {alertas.map((a) => {
          const Icone = ICONE[a.tipo] ?? AlertTriangle;
          return (
            <div key={a.id} className="p-2.5 rounded-sm bg-bg border border-border flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <Icone size={15} className="shrink-0 mt-0.5" />
                <span className="text-[0.8rem] font-semibold text-text-primary">{a.titulo}</span>
                <Badge variant={VARIANTE[a.severidade]} className="ml-auto shrink-0">{ROTULO[a.severidade]}</Badge>
              </div>
              <p className="text-[0.75rem] text-text-muted m-0">{a.detalhe}</p>
              <Button
                variant="secondary"
                onClick={() => onConversar(a)}
                style={{ alignSelf: 'flex-start', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              >
                <MessageSquare size={13} /> Conversar sobre isso
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
