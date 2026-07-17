import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Host de acesso na intranet. Se o IP da máquina mudar (DHCP), ajuste aqui
// (ou defina a env APP_HOST).
const HOST = process.env.APP_HOST || '192.168.1.18';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: HOST,
    port: 5173,
    strictPort: true,
  },
});
