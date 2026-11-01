import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps the build portable (static hosting at any path).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
