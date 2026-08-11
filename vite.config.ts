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
      devOptions: { enabled: true },
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
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // AI 抠图模型与 onnxruntime wasm 不预缓存（体积大），首次使用后缓存，离线可复用
        runtimeCaching: [
          {
            urlPattern: /\.(onnx|wasm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ai-assets',
              expiration: { maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
})
