// Сборка отдельной страницы разбора для сайта движка: npm run build:review → dist-review/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: 'public-review',
  build: { outDir: 'dist-review', emptyOutDir: true, chunkSizeWarningLimit: 1500, rollupOptions: { input: 'review.html' } },
});
