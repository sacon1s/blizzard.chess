import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Сайт собирается в docs/ — GitHub Pages берёт его из ветки main, папки /docs.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'docs', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
