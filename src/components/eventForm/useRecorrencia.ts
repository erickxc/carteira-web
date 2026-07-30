import { useState } from 'react';
import { addDays, addMonths, addWeeks, format, getDay, parse } from 'date-fns';

export type RecorrMode = 'unica' | 'cadencia' | 'semana' | 'avulso';

/**
 * Estado + cálculo de datas da recorrência do formulário de evento. Cadência
 * = "N vezes por mês, durante X meses" (não "a cada unidade, total de
 * ocorrências" — mudou a pedido do usuário: a quantidade é por mês, não o total).
 */
export function useRecorrencia() {
  const [recorrMode, setRecorrMode] = useState<RecorrMode>('unica');
  const [vezesPorMes, setVezesPorMes] = useState(1);
  const [duracaoMeses, setDuracaoMeses] = useState(3);
  const [ocorrencias, setOcorrencias] = useState(4);
  const [diaSemana, setDiaSemana] = useState(1); // 0=dom..6=sáb
  const [datasAvulsas, setDatasAvulsas] = useState<string[]>([]);
  const [novaDataAvulsa, setNovaDataAvulsa] = useState('');
  const recorrente = recorrMode !== 'unica';

  // baseISO = data principal (meia-noite local; a hora fica no campo `time`
  // separado, como o resto do app). Cada modo devolve a lista de datas dos eventos.
  function gerarDatas(baseISO: Date): Date[] {
    const q = Math.max(1, Math.min(52, ocorrencias));
    if (recorrMode === 'cadencia') {
      // N vezes por mês, durante X meses. 1ª ocorrência de cada mês = mesmo
      // dia-do-mês da data escolhida (clampado pelo addMonths do date-fns); as
      // demais dentro do mês ficam espaçadas por (28 / vezesPorMes) dias — ex.:
      // 2x/mês ≈ quinzenal, 4x/mês ≈ semanal.
      const vezes = Math.max(1, Math.min(31, vezesPorMes));
      const meses = Math.max(1, Math.min(24, duracaoMeses));
      const step = Math.max(1, Math.floor(28 / vezes));
      const datas: Date[] = [];
      for (let m = 0; m < meses; m++) {
        const baseDoMes = addMonths(baseISO, m);
        for (let i = 0; i < vezes; i++) datas.push(addDays(baseDoMes, i * step));
      }
      return datas;
    }
    if (recorrMode === 'semana') {
      const delta = (diaSemana - getDay(baseISO) + 7) % 7; // 1ª ocorrência = próximo diaSemana (>= base)
      const primeiro = addDays(baseISO, delta);
      return Array.from({ length: q }, (_, i) => addWeeks(primeiro, i));
    }
    if (recorrMode === 'avulso') {
      const todas = [baseISO, ...datasAvulsas.map((s) => parse(s, 'yyyy-MM-dd', new Date()))];
      const vistos = new Set<string>();
      return todas
        .filter((d) => { const k = format(d, 'yyyy-MM-dd'); if (vistos.has(k)) return false; vistos.add(k); return true; })
        .sort((a, b) => a.getTime() - b.getTime());
    }
    return [baseISO];
  }

  function addDataAvulsa() {
    if (!novaDataAvulsa) return;
    setDatasAvulsas((prev) => (prev.includes(novaDataAvulsa) ? prev : [...prev, novaDataAvulsa].sort()));
    setNovaDataAvulsa('');
  }
  const removeDataAvulsa = (d: string) => setDatasAvulsas((prev) => prev.filter((x) => x !== d));

  const qtdeEventos = recorrMode === 'unica'
    ? 1
    : recorrMode === 'avulso'
    ? datasAvulsas.length + 1
    : recorrMode === 'cadencia'
    ? Math.max(1, Math.min(31, vezesPorMes)) * Math.max(1, Math.min(24, duracaoMeses))
    : Math.max(1, ocorrencias);

  return {
    recorrMode, setRecorrMode, vezesPorMes, setVezesPorMes, duracaoMeses, setDuracaoMeses,
    ocorrencias, setOcorrencias, diaSemana, setDiaSemana, datasAvulsas, novaDataAvulsa, setNovaDataAvulsa,
    recorrente, gerarDatas, addDataAvulsa, removeDataAvulsa, qtdeEventos,
  };
}
