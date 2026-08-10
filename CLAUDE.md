# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

pinDu：自用拼豆（perler beads）设计 PWA，目标 iPad Safari。核心流水线：**导入图片 → 转 Pattern（量化到 MARD 221 色）→ 算色清单 → 导出图纸（PNG/PDF）→ 分享 → 作品库（IndexedDB）**。用户明确移除了编辑功能（画笔/橡皮/填充/吸管/撤销重做）和抖动，是纯转换工具。

设计语言：**钉板工作台**——深色 UI（MARD H6 `#2c2c2c`），UI 色板全部锚定真实 MARD 色号（A5 珠黄 `#f0d83a` 主动作、D3 珠蓝、F4 珠红 `#fb2a40` 辅助线、H1 白纸），珠子用圆角+内高光模拟体积，色号/数量用等宽字体。视觉验证用 Playwright 截图 + vision 检查。

## 常用命令

```bash
npm run dev          # 开发服务器
npm run build        # tsc -b && vite build（含 vite-plugin-pwa SW 预缓存）
npm run preview      # 预览 dist
npm test             # vitest run（全部测试）
npm run test:watch   # vitest watch
npm run typecheck    # tsc --noEmit
npx vitest run src/domain/convert.test.ts          # 单个测试文件
npx vitest run -t "detectBackgroundColor"          # 按名称过滤测试
```

## 架构

```
src/
├── domain/          # 领域层：纯函数，node 可测（所有测试 seam 都在这里）
│   ├── types.ts     # 领域类型（ColorPalette/Pattern/ConvertResult 等）
│   ├── convert.ts   # 核心转换管线 convertImageToPattern + computeColorCounts
│   ├── sheet.ts     # 图纸布局 buildSheetLayout（辅助线/行列标号）
│   ├── work.ts      # 作品库 WorkStore 契约 + MemoryWorkStore
│   ├── palette.ts   # MARD 221 色（由脚本生成，勿手改）
│   └── *.test.ts    # 全部测试（vitest）
├── render-grid.ts   # drawGrid 共享渲染（预览与导出共用，防漂移）
├── sheet-export.ts  # 图纸 Canvas 渲染 + PNG/PDF 导出 + Web Share（浏览器环境）
├── idb-work-store.ts# WorkStore 的 IndexedDB 适配层（薄壳，fake-indexeddb 测试）
└── App.tsx          # UI（参数/预览/算色清单/导出/作品库）
```

### 核心数据流

- `convertImageToPattern(image, {width, height, maxColors, removeBackground}, palette) → {pattern, activePalette}`：重采样（box filter）→ 去背景（边缘主色 `dominantEdgeColor`，容差 30）→ maxColors 选子集（覆盖最多，平局按色板顺序）→ 子集内最近邻量化。**`colorCounts` 不随结果存储**，由 `computeColorCounts(pattern, activePalette)` 派生。
- `Pattern.cells` 是 `(ColorId | null)[]`：null = 去背景留下的空格（不参与算色）。
- 图纸渲染：`drawGrid` 是唯一格子绘制逻辑（预览 12px 格 + 浅灰空格，导出 16px 格 + 白纸，导出每格标色号）；导出加行列数字标号与用色清单。高亮色号时其余格变暗 55%、目标格标序号 1..N（行优先）。

### 领域约定

- 术语定义见 `CONTEXT.md`（色板/用色集/图案/作品/算色/图纸），代码与文档用词一致。
- 技术栈决策见 `docs/adr/0001-pwa-over-native.md`（PWA 而非原生，Windows 环境无 Mac）。
- 需求来源见 `docs/spec/0001-image-to-pattern-pipeline.md` 与 `.scratch/pindu-mvp/issues/`（tracer-bullet tickets）。

## 工作约定

- **TDD**：在 domain 纯函数上 red→green（worked example 断言，禁 tautological）；UI/浏览器层（canvas 渲染、IndexedDB、SW）无 node seam，直接实现 + Playwright 截图验证。
- 改 `palette.ts` 必须用 `node scripts/generate-mard-palette.mjs`（从 `MARD拼豆221色色号清单.md` 解析生成），勿手改。
- 视觉改动后跑 `node scripts/screenshot.mjs` 生成截图（产物已 gitignore），用识图检查效果。
- 完成一个 ticket 后走 code-review（双轴：Standards + Spec），修复另提交。
