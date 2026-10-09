import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { verifyMathModel } from './scripts/verify-math-model';
export default defineConfig(() => {
  verifyMathModel(fileURLToPath(new URL('.', import.meta.url)));
  return {
    base: './',
    build: { assetsInlineLimit: 30_000_000, target: 'es2022' },
  };
});
