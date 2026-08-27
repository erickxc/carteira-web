import { useState } from 'react';
import type { OffsetLembrete, RegraRecorrencia } from '../../types';

export type RecorrMode = 'unica' | 'semanal' | 'mensalVezes' | 'diasMes';

/**
 * Estado da recorrência do formulário de evento — v2 (regra aberta).
 *
 * Antes o usuário configurava "N vezes por mês × durante X meses" e o form
 * gerava TODOS os eventos (até 744) de uma vez, num laço sequencial de
 * requisições sem barra de progresso nem desfazer. Agora o formulário só monta
 * a REGRA (sem duração): o servidor materializa o mês corrente ao salvar e os
 * meses seguintes conforme eles chegam (ver `server/agendaSeries.cjs`).
 *
 * A matemática de datas mora só no servidor (`server/regraRecorrencia.cjs`) —
 * este hook NUNCA calcula datas, só monta o objeto `regra` e delega a prévia
 * a `previewAgendaSerie` (API).
 */
export function useRecorrencia() {
  const [recorrMode, setRecorrMode] = useState<RecorrMode>('unica');
  const [diaSemana, setDiaSemana] = useState(1); // 0=dom..6=sáb
  const [vezesPorMes, setVezesPorMes] = useState(1);
  const [diasDoMes, setDiasDoMes] = useState<number[]>([]);
  const [lembretesOffsets, setLembretesOffsets] = useState<OffsetLembrete[]>([]);
  const recorrente = recorrMode !== 'unica';

  function toggleDiaDoMes(dia: number) {
    setDiasDoMes((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia].sort((a, b) => a - b)));
  }

  function toggleLembrete(offset: OffsetLembrete) {
    setLembretesOffsets((prev) => (prev.includes(offset) ? prev.filter((o) => o !== offset) : [...prev, offset]));
  }

  /** Monta a regra a partir do modo escolhido + a data-base do evento (define
   *  o dia-do-mês em `mensalVezes`, e é o próprio "início" da série). */
  function montarRegra(baseData: Date): RegraRecorrencia | null {
    if (recorrMode === 'semanal') return { modo: 'semanal', diaSemana };
    if (recorrMode === 'mensalVezes') return { modo: 'mensalVezes', vezesPorMes: Math.max(1, Math.min(31, vezesPorMes)), diaBase: baseData.getDate() };
    if (recorrMode === 'diasMes') return { modo: 'diasMes', diasDoMes: diasDoMes.length > 0 ? diasDoMes : [baseData.getDate()] };
    return null;
  }

  return {
    recorrMode, setRecorrMode, recorrente,
    diaSemana, setDiaSemana,
    vezesPorMes, setVezesPorMes,
    diasDoMes, toggleDiaDoMes,
    lembretesOffsets, toggleLembrete,
    montarRegra,
  };
}
