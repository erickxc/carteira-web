import type { Transition } from 'motion/react';

// Espelhados em --motion-* no :root do index.css — mudar um exige mudar o outro.
export const duracao = {
  rapido: 0.15,
  medio: 0.25,
  destaque: 0.4,
} as const;

export const curva = {
  saida: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

export const mola: Transition = { type: 'spring', bounce: 0, duration: duracao.medio };
