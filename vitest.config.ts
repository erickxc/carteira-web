import { defineConfig } from 'vitest/config';

// Config própria, separada de vite.config.ts: aquele fixa host/porta pra LAN
// (dev server), o que não tem sentido pros testes e poderia até tentar
// bindar a porta 5173 sem necessidade.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'launcher/**/*.test.ts'],
  },
});
