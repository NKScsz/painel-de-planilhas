import { defineConfig } from 'vitest/config';

export default defineConfig({
  // caminhos relativos: o mesmo build serve na raiz (Firebase) e em subpasta (GitHub Pages)
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: 'hidden',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{js,ts}'],
  },
});
