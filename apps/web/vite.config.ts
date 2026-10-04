import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const dir = fileURLToPath(new URL('.', import.meta.url));
const raizMonorepo = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, raizMonorepo, '');
  const apiTarget = env.VITE_API_URL || 'http://127.0.0.1:3000';

  return {
    envDir: raizMonorepo,
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: null,
        manifest: {
          name: 'MantiRenfe — Alertas de trenes',
          short_name: 'MantiRenfe',
          description:
            'Recibe avisos de disponibilidad, horarios y tiempo real de la red ferroviaria española',
          theme_color: '#75258c',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          lang: 'es',
          orientation: 'portrait-primary',
          icons: [
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icon-maskable.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,ico,png,webmanifest}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      // Sourcemaps solo en desarrollo: en producción pesan más que el propio JS
      sourcemap: mode !== 'production',
    },
  };
});
