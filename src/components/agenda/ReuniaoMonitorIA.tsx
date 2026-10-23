import { useEffect, useState } from 'react';
import { encerrarReuniao, estadoReuniao, iniciarReuniao, type EstadoReuniao } from '../../api/client';
import { useCarteira } from '../../context/CarteiraContext';
import { Button, Field, Input, SecaoLabel } from '../../ui';
import { SelectField } from '../SelectField';

/**
 * Painel de TESTE do monitorIA nas reuniões (entrega 1, só em dev): toca uma
 * gravação como se fosse a reunião ao vivo. A captura real e o botão do Zoom
 * entram numa entrega seguinte.
 */
export function ReuniaoMonitorIA({ eventId }: { eventId: string }) {
  const { revalidarSilencioso } = useCarteira();
  const [arquivo, setArquivo] = useState('');
  const [velocidade, setVelocidade] = useState(1);
  const [estado, setEstado] = useState<EstadoReuniao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

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

  async function agir(fn: () => Promise<EstadoReuniao>) {
    setErro(null);
    try {
      setEstado(await fn());
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha.');
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <SecaoLabel>monitorIA na reunião (teste)</SecaoLabel>
      {ativa ? (
        <div className="flex items-center gap-3">
          <span className="text-text-secondary" style={{ fontSize: 13 }} aria-live="polite">
            {estado?.fase === 'finalizando'
              ? 'Gerando a ata…'
              : `monitorIA ouvindo · ${estado?.minutos ?? 0} min · ${estado?.insights ?? 0} insight(s)`}
          </span>
          {estado?.fase === 'ouvindo' && (
            <Button variant="secondary" size="sm" type="button" onClick={() => agir(encerrarReuniao)}>Encerrar</Button>
          )}
        </div>
      ) : (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="Arquivo de áudio ou vídeo (caminho)" className="flex-1 basis-[260px]">
            <Input value={arquivo} onChange={(e) => setArquivo(e.target.value)} placeholder="C:\Users\...\gravacao.mp4" />
          </Field>
          <SelectField label="Velocidade" value={String(velocidade)} onChange={(v) => setVelocidade(Number(v))}
            options={[{ value: '1', label: '1×' }, { value: '4', label: '4×' }]} />
          <Button variant="secondary" size="sm" type="button" disabled={!arquivo.trim()}
            onClick={() => agir(() => iniciarReuniao({ eventId, simularArquivo: arquivo.trim().replace(/^"|"$/g, ''), velocidade }))}>
            Simular reunião
          </Button>
        </div>
      )}
      {daqui && estado?.fase === 'concluida' && <p className="text-text-secondary" style={{ fontSize: 13, marginTop: 6 }}>Ata gerada e gravada neste evento, com a transcrição anexada.</p>}
      {daqui && estado?.fase === 'erro' && <p style={{ fontSize: 13, marginTop: 6, color: 'var(--danger-fg)' }}>A ata falhou: {estado.erro}. A transcrição ficou salva no evento.</p>}
      {erro && <p role="alert" style={{ fontSize: 13, marginTop: 6, color: 'var(--danger-fg)' }}>{erro}</p>}
    </div>
  );
}
