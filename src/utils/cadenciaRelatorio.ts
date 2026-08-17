import { addDays, addMonths, addWeeks, getDay } from 'date-fns';
import type { RelatorioCadencia } from '../types';

/**
 * Calcula a próxima data de geração de relatório a partir de uma data de
 * referência (o relatório passado mais recente do cliente, ou hoje se nunca
 * houve um). Espelhada em `server/cadenciaRelatorio.cjs` — o backend roda
 * direto com `node server.cjs` (CommonJS, sem build step) e não compartilha
 * módulos com o frontend (TS/ESM); ao mudar a regra aqui, mude lá também.
 */
export function calcularProximaDataRelatorio(cadencia: RelatorioCadencia, referencia: Date): Date {
  const numero = Math.max(1, Math.floor(cadencia.numero) || 1);
  switch (cadencia.unidade) {
    case 'dia':
      return addDays(referencia, numero);
    case 'semana':
      return addWeeks(referencia, numero);
    case 'mes':
      return addMonths(referencia, numero);
    case 'trimestre':
      return addMonths(referencia, numero * 3);
    case 'semestre':
      return addMonths(referencia, numero * 6);
    case 'personalizado': {
      const dias = cadencia.diasSemana && cadencia.diasSemana.length > 0 ? cadencia.diasSemana : [getDay(referencia)];
      // Próxima ocorrência estritamente futura (nunca "hoje") de qualquer um
      // dos dias escolhidos — depois pula (numero - 1) semanas extras.
      let proxima: Date | null = null;
      for (const dia of dias) {
        const delta = ((dia - getDay(referencia) + 7) % 7) || 7;
        const candidata = addDays(referencia, delta);
        if (!proxima || candidata < proxima) proxima = candidata;
      }
      return addWeeks(proxima as Date, numero - 1);
    }
    default:
      return addMonths(referencia, numero);
  }
}
