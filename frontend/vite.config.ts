import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use the existing manifest rather than generating a new one
      manifest: {
        name: 'Merrimack Valley Putting League',
        short_name: 'MVPL',
        description: 'Track scores and standings for the Merrimack Valley Putting League',
        start_url: '/',
        display: 'standalone',
        background_color: '#15803d',
        theme_color: '#15803d',
        orientation: 'portrait-primary',
        icons: [
          { src: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
          { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cache the app shell and static assets; skip large media files
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Cache API responses briefly so the UI loads fast on slow connections
            urlPattern: /^https:\/\/mvpl\.golf\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    host: true,  // listen on 0.0.0.0 so phones on the same WiFi can connect
    proxy: {
      // Proxy all /api calls to the backend during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      // WebSocket proxy
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
