import { useEffect, useState } from 'react';
import { AppWindow, Mic } from 'lucide-react';
import { abrirPainelReuniao, encerrarReuniao, estadoReuniao, iniciarReuniao, pausarReuniao, type EstadoReuniao } from '../../api/client';
import { useCarteira } from '../../context/CarteiraContext';
import { Button } from '../../ui';

/**
 * monitorIA na reunião, no cabeçalho do evento (só em dev por enquanto): ouve
 * ao vivo (microfone = monitor, som do computador = cliente). A janela por cima
 * do Zoom só abre quando pedida ("Janela"). Reunião simulada (arquivo tocado como
 * reunião) segue na API (`simularArquivo` em POST /api/reuniao/iniciar), sem botão.
 */
export function ReuniaoMonitorIA({ eventId }: { eventId: string }) {
  const { revalidarSilencioso } = useCarteira();
  const [estado, setEstado] = useState<EstadoReuniao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false); // preparar o material do cliente leva ~40 s
  const [confirmarAte, setConfirmarAte] = useState(0);

  const daqui = estado?.eventId === eventId;
  const ativa = daqui && estado?.ativa;

  // Polling enquanto a sessão deste evento está viva (ouvindo/finalizando).
  useEffect(() => {
    let vivo = true;
    const ler = () => estadoReuniao().then((e) => { if (vivo) setEstado(e); }).catch(() => {});
    ler();
    if (!ativa) return () => { vivo = false; };
    const id = setInterval(ler, 5000);
    return () => { vivo = false; clearInterval(id); };
  }, [ativa]);

  // Ata pronta: traz o evento atualizado (ata + anexo) sem recarregar a tela.
  const concluiu = daqui && (estado?.fase === 'concluida' || estado?.fase === 'erro');
  useEffect(() => {
    if (concluiu) revalidarSilencioso();
  }, [concluiu, revalidarSilencioso]);

  // "Confirmar" volta a "Encerrar" se o segundo clique não vier.
  useEffect(() => {
    if (!confirmarAte) return;
    const t = setTimeout(() => setConfirmarAte(0), confirmarAte - Date.now());
    return () => clearTimeout(t);
  }, [confirmarAte]);

  async function agir(fn: () => Promise<EstadoReuniao>) {
    setErro(null);
    try {
      setEstado(await fn());
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha.');
    }
  }

  function iniciar() {
    setIniciando(true);
    agir(() => iniciarReuniao({ eventId })).finally(() => setIniciando(false));
  }

  function encerrar() {
    if (Date.now() < confirmarAte) { setConfirmarAte(0); agir(encerrarReuniao); }
    else setConfirmarAte(Date.now() + 4000); // encerrar gera a ata e não tem volta
  }

  const status = (texto: string, cor = 'var(--text-secondary)') => (
    <span style={{ fontSize: 13, color: cor, whiteSpace: 'nowrap' }} aria-live="polite">{texto}</span>
  );

  let conteudo;
  if (ativa && estado?.fase === 'finalizando') {
    conteudo = status('Gerando a ata…');
  } else if (ativa) {
    conteudo = (
      <>
        {status(`${estado?.pausada ? 'Pausado' : 'Ouvindo'} · ${estado?.minutos ?? 0} min`, estado?.pausada ? 'var(--accent-fg)' : 'var(--text-secondary)')}
        <Button variant="secondary" size="sm" onClick={() => agir(() => pausarReuniao(!estado?.pausada))}>
          {estado?.pausada ? 'Retomar' : 'Pausar'}
        </Button>
        <Button variant={confirmarAte ? 'danger' : 'secondary'} size="sm" onClick={encerrar}>
          {confirmarAte ? 'Confirmar' : 'Encerrar'}
        </Button>
        <Button variant="ghost" size="sm" title="Abrir a janela da reunião (por cima do Zoom)" onClick={() => { abrirPainelReuniao().catch(() => {}); }}>
          <AppWindow size={15} /> Janela
        </Button>
      </>
    );
  } else {
    conteudo = (
      <>
        {daqui && estado?.fase === 'concluida' && status('Ata gerada')}
        {daqui && estado?.fase === 'erro' && status('A ata falhou', 'var(--danger-fg)')}
        <Button variant="secondary" size="sm" carregando={iniciando} title="Microfone = você · som do computador = cliente" onClick={iniciar}>
          <Mic size={15} /> {iniciando ? 'Preparando…' : 'Ouvir reunião'}
        </Button>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2" title={daqui && estado?.fase === 'erro' ? `${estado.erro}. A transcrição ficou salva no evento.` : undefined}>
      {erro && status(erro, 'var(--danger-fg)')}
      {conteudo}
    </div>
  );
}
