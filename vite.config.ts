import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Host de acesso na intranet. Se o IP da máquina mudar (DHCP), ajuste aqui
// (ou defina a env APP_HOST).
const HOST = process.env.APP_HOST || '192.168.1.8';

// Versão exibida no rodapé do app. Vem do package.json em tempo de BUILD — é
// o mesmo arquivo que o servidor lê pra dizer qual versão está instalada
// (server/routes/atualizacao.cjs) e o mesmo que a release empacota, então
// front e back nunca divergem. Assim o rodapé não precisa de requisição.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    host: HOST,
    port: 5173,
    strictPort: true,
  },
});
