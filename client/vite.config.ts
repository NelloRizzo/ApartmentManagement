import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'Gestione Condomini',
        // Sotto l'icona sulla home i sistemi mobili troncano il nome: meglio
        // una versione corta che venga letta per intero.
        short_name: 'Condomini',
        description: 'Gestione condominiale: quote millesimali, assemblee, verbali, versamenti e contratti',
        lang: 'it',
        theme_color: '#1b4965',
        background_color: '#f5f7fa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/allegati/],
        // Gli allegati non si mettono in cache: il link è firmato e vale 24 ore,
        // quindi una copia in cache continuerebbe a essere servita oltre la
        // scadenza, vanificando la firma.
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      // Gli allegati in sviluppo sono serviti dall'API come in produzione: in
      // questo modo non si developpa su un percorso che poi in deploy dà 404.
      '/allegati': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
});
