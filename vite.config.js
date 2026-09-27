import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  // Pages uses a repository subpath; keep existing local preview URLs unchanged.
  base: process.env.PAGES_BASE_PATH || './',
  plugins: [react()],
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
});
