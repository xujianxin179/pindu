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
 * - build：closeBundle 复制进 dist/ort-wasm/v2/
 * URL 统一为 /ort-wasm/v2/<file>，与 ai-mask.ts 的 ort.env.wasm.wasmPaths 对应。
 * v2 子目录用于绕过旧 PWA ai-assets 缓存（CacheFirst 缓存过旧 URL 的 gzip 数据）。
 */
function ortWasmPlugin(): Plugin {
  const srcDir = resolve(__dirname, 'src/ort-wasm')
  return {
    name: 'ort-wasm',
    configureServer(server) {
      server.middlewares.use('/ort-wasm', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '')
        // 兼容 /ort-wasm/v2/<file> 与旧 /ort-wasm/<file>（旧缓存设备仍可能请求旧路径）
        const file = resolve(srcDir, rel.replace(/^v2\//, ''))
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
      cpSync(srcDir, resolve(__dirname, 'dist/ort-wasm/v2'), { recursive: true })
    },
  }
}

export default defineConfig({
  // 部署根路径：GitHub Pages 用 /pindu/（Actions 里设 BASE_PATH），Cloudflare Pages 用 /（默认）
  base: process.env.BASE_PATH ?? '/',
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
        // AI 抠图模型与 onnxruntime wasm/mjs 不预缓存（体积大），首次使用后缓存；
        // StaleWhileRevalidate：命中缓存立即用（离线/秒开），后台拉新版本替换，
        // 避免 CacheFirst 下旧文件（如 gzip 版 wasm）被永久缓存
        runtimeCaching: [
          {
            urlPattern: /\.(onnx|wasm|mjs)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ai-assets',
              expiration: { maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60 },
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
