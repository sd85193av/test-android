import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'app-icon.svg',
        'icon-192.png',
        'icon-512.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: '東山鴨頭庫存管理',
        short_name: '庫存管理',
        description: '東山鴨頭與炸物的庫存、銷售、成本及報表管理工具',
        lang: 'zh-TW',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f8f4ef',
        theme_color: '#8c2f17',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
