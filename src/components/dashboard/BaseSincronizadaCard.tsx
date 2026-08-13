import { useEffect, useState } from 'react';
import { Cloud, CloudOff } from 'lucide-react';
import { Card } from '../../ui';
import { verificarStatusBase, type StatusBase } from '../../api/client';

function tempoDesde(iso?: string) {
  if (!iso) return 'indisponível';
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'agora';
  if (minutos === 1) return 'há 1 minuto';
  if (minutos < 60) return `há ${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  return horas === 1 ? 'há 1 hora' : `há ${horas} horas`;
}

export function BaseSincronizadaCard() {
  const [status, setStatus] = useState<StatusBase | null>(null);

  useEffect(() => {
    let ativo = true;
    const verificar = () => verificarStatusBase().then((s) => ativo && setStatus(s)).catch(() => ativo && setStatus({ ok: false, checkedAt: new Date().toISOString() }));
    verificar();
    const polling = window.setInterval(verificar, 20000);
    return () => { ativo = false; window.clearInterval(polling); };
  }, []);

  const ok = status?.ok === true;
  // Uma linha só: ícone + "Base sincronizada". O detalhe (quando foi a última
  // gravação / falha na verificação) vai para o tooltip — na barra superior o
  // que importa é o sinal de que está tudo certo, e a segunda linha obrigava o
  // elemento a ter o dobro da altura dos controles ao lado.
  //
  // Sem relógio de re-render: o texto de tempo agora só aparece no title, que o
  // navegador lê no momento do hover. (O `useState(Date.now())` que existia para
  // isso também quebrava o lint — chamada impura durante o render.)
  const detalhe = ok
    ? `Gravação no OneDrive respondendo · última ${tempoDesde(status?.updatedAt)}`
    : 'Não foi possível verificar a base agora';

  return (
    <Card className="base-sync" title={detalhe}>
      {ok
        ? <Cloud size={17} className="text-status-success shrink-0" />
        : <CloudOff size={17} className="text-status-danger shrink-0" />}
      <span className="base-sync-txt">Base sincronizada</span>
    </Card>
  );
}
