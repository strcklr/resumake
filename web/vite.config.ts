import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  // Relative asset paths, so the build works from any URL path (GitHub Pages, a subfolder, a file server).
  base: './',
  // The sample resume is imported straight from ../resumes so the site and the CLI share one copy.
  server: { fs: { allow: ['..'] } },
  // CodeMirror + Ajv in one bundle is ~230 kB gzipped; fine for now.
  build: { chunkSizeWarningLimit: 800 },
});
