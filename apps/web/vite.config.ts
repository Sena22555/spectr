import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Демо-версия без сервера: npm run build:demo (данные — из src/demo/snapshot.json)
const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: demo ? './' : '/',
  define: { __DEMO__: JSON.stringify(demo) },
  build: demo ? { outDir: 'dist-demo' } : undefined,
  server: {
    host: true,
    // Для теста в Telegram/VK через туннель (cloudflared/ngrok) — разрешаем внешние хосты
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
