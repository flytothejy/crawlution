// 도감 페이지 빌드: npx vite build --config vite.codex.config.ts → dist-codex/codex.html (한 파일)
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020', assetsInlineLimit: 100000000, outDir: 'dist-codex', rollupOptions: { input: 'codex.html' } },
});
