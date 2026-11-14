import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production builds are served by GitHub Pages from https://elif-tasdelen.github.io/aerosans/,
// so assets need the "/aerosans/" base (also for `vite preview`, which serves that build).
// The dev server and Vitest keep "/".
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/aerosans/' : '/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
}));
