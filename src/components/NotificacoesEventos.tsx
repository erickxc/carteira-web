import { useEffect, useRef } from 'react';
import { useCarteira } from '../context/CarteiraContext';
import { detectarNovidades, notificarSeHabilitado, snapshotVazio } from '../utils/notificacoesNativas';

/**
 * Componente invisível: dispara toast nativo do Windows quando surge algo
 * novo em clientes/agenda/análises de IA. Diferente de lembretes (que têm um
 * "vencimento" próprio, tratado no ReminderPopup), estas categorias não têm
 * estado — o único jeito de saber que "é novo" é comparar com o que já foi
 * visto (ver `detectarNovidades`, em src/utils/notificacoesNativas.ts).
 *
 * Reaproveita a revalidação periódica que o CarteiraContext já faz sozinho
 * (não cria nenhum polling novo). Snapshot fica só em memória (ref): a
 * primeira carga da página grava a baseline SEM notificar (senão a carteira
 * inteira dispararia toast na primeira vez), e fechar/reabrir a aba reseta a
 * baseline silenciosamente — mesma limitação aceita do ReminderPopup, só
 * funciona enquanto o app está aberto.
 */
export function NotificacoesEventos() {
  const { clientes, agenda, analisesIA } = useCarteira();
  const iniciado = useRef(false);
  const snapshot = useRef(snapshotVazio());

  useEffect(() => {
    if (!iniciado.current) {
      iniciado.current = true;
      detectarNovidades(snapshot.current, { clientes, agenda, analisesIA }); // grava baseline sem notificar
      return;
    }
    for (const novidade of detectarNovidades(snapshot.current, { clientes, agenda, analisesIA })) {
      notificarSeHabilitado(novidade.categoria, novidade.titulo, novidade.mensagem);
    }
  }, [clientes, agenda, analisesIA]);

  return null;
}
