import { defineConfig } from 'vite';

export default defineConfig({
  // Absolute asset paths. With a relative base ('./') the asset URLs are
  // resolved against whatever path the page was served from, so any sub-path
  // served by the SPA rewrite (e.g. /play/) would ask for
  // /play/assets/index-*.js, get index.html back, and fail to boot with a
  // blank screen. An absolute base is immune to the path the visitor used.
  base: '/',
  build: {
    target: 'es2019',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: true,
    port: 5173,
  },
});
