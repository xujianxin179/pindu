/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png'],
      manifest: {
        name: 'pinDu 拼豆',
        short_name: 'pinDu',
        description: '导入图片自动生成拼豆图案',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#333333',
        icons: [
          {
            src: '/icon-180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // 运行时缓存 Google Fonts 等跨域资源不必；这里是纯本地应用，预缓存构建产物即可
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
})
