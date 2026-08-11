/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vitest" />
import { createReadStream, existsSync, cpSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * onnxruntime-web 的 wasm 运行时文件（src/ort-wasm/，与 node_modules 包版本同步复制）：
 * - dev：中间件直接 serve，绕开 vite 对 public 目录动态 import 的拒绝
 * - build：closeBundle 复制进 dist/ort-wasm/
 * URL 统一为 /ort-wasm/<file>，与 ai-mask.ts 的 ort.env.wasm.wasmPaths 对应。
 */
function ortWasmPlugin(): Plugin {
  const srcDir = resolve(__dirname, 'src/ort-wasm')
  return {
    name: 'ort-wasm',
    configureServer(server) {
      server.middlewares.use('/ort-wasm', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '')
        const file = resolve(srcDir, rel)
        if (!file.startsWith(srcDir) || !existsSync(file) || !statSync(file).isFile()) {
          return next()
        }
        res.setHeader(
          'Content-Type',
          rel.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        )
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      cpSync(srcDir, resolve(__dirname, 'dist/ort-wasm'), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    ortWasmPlugin(),
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
        // AI 抠图模型与 onnxruntime wasm/mjs 不预缓存（体积大），首次使用后缓存，离线可复用
        runtimeCaching: [
          {
            urlPattern: /\.(onnx|wasm|mjs)$/,
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
