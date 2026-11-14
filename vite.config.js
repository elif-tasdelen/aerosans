import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` emits relative asset paths, so the same build works on
// GitHub Pages (served from /<repo>/) and on Vercel (served from /).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
