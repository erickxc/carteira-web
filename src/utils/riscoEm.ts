import type { AnaliseIA } from '../types';

/**
 * Nível de risco de cada cliente vigente em `data`: a análise mais recente com
 * `geradoEm <= data`, entre a atual e as arquivadas. Cliente sem análise até
 * lá fica fora do mapa (conta como "sem análise").
 */
export function riscoEm(atuais: AnaliseIA[], historico: AnaliseIA[], data: Date): Map<string, AnaliseIA['nivelRisco']> {
  const limite = data.getTime();
  const melhor = new Map<string, AnaliseIA>();
  for (const a of [...atuais, ...historico]) {
    const t = new Date(a.geradoEm).getTime();
    if (isNaN(t) || t > limite) continue;
    const atual = melhor.get(a.clientId);
    if (!atual || t > new Date(atual.geradoEm).getTime()) melhor.set(a.clientId, a);
  }
  return new Map([...melhor].map(([id, a]) => [id, a.nivelRisco]));
}
