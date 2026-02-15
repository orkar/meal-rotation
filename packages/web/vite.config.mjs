import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Avoid writing cache into a potentially root-owned node_modules (if created by a container).
  cacheDir: '.vite-cache',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        // Dev default matches docker-compose.dev.yml which exposes API as :3305 on the host.
        // When running inside docker-compose, VITE_DEV_API_PROXY_TARGET is set to http://api:3001.
        target: process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://localhost:3305',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
