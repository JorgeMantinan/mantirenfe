import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const raizMonorepo = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Build de SSR del prerender (`scripts/prerender.tsx`), separado del build de
 * la web para no arrastrar el plugin PWA: el service worker se genera en
 * `vite build` con el precache de `dist/`, y aquí solo interesa el bundle de
 * Node que pinta las páginas en el paso siguiente.
 *
 * Mismos `alias` y mismo `envDir` que `vite.config.ts`, para que las páginas
 * vean el mismo `import.meta.env.VITE_*` (Supabase, AdSense…) que en cliente.
 */
export default defineConfig({
  envDir: raizMonorepo,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    ssr: 'scripts/prerender.tsx',
    outDir: '.prerender',
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'prerender.js' },
    },
  },
  logLevel: 'warn',
});
