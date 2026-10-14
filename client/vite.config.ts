import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env.API_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../server/src/shared', import.meta.url)),
    },
  },
  server: {
    // Listen on the LAN so phones on the same Wi-Fi can join during development.
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/socket.io': { target: apiTarget, ws: true, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
