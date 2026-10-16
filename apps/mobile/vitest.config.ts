import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Igual que los `paths` del tsconfig: los widget usan imports con '@/'
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  esbuild: {
    // Los .tsx (widgets) usan JSX runtime automático, como Metro
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
