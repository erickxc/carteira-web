const { addDays, addMonths, addWeeks, getDay } = require('date-fns');

/**
 * Calcula a próxima data de geração de relatório a partir de uma data de
 * referência (o relatório passado mais recente do cliente, ou hoje se nunca
 * houve um). Espelhada em `src/utils/cadenciaRelatorio.ts` — o frontend é
 * TS/ESM buildado pelo Vite e o backend roda direto com `node server.cjs`
 * (CommonJS, sem build step), não há módulo compartilhado entre os dois; ao
 * mudar a regra aqui, mude lá também.
 */
function calcularProximaDataRelatorio(cadencia, referencia) {
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
      let proxima = null;
      for (const dia of dias) {
        const delta = ((dia - getDay(referencia) + 7) % 7) || 7;
        const candidata = addDays(referencia, delta);
        if (!proxima || candidata < proxima) proxima = candidata;
      }
      return addWeeks(proxima, numero - 1);
    }
    default:
      return addMonths(referencia, numero);
  }
}

module.exports = { calcularProximaDataRelatorio };
