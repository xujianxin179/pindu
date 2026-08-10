# pinDu 拼豆

把图片自动转成拼豆图纸的 PWA 工具，iPad Safari"添加到主屏幕"即用。基于 **MARD 221 色号体系**，自用开源。

![pwa](https://img.shields.io/badge/PWA-ready-blue)

## 功能

- **图片转图案**：导入图片，自动量化到 MARD 221 色号（可设网格大小、用色数上限）
- **自动去背景**：检测边缘主色，背景变空格不浪费珠子（可关）
- **算色清单**：每个色号 + 需要多少颗，点击色号**高亮该色在图案中的位置**并标序号 1..N
- **图纸导出**：每格标色号 + 红色辅助线 + 数字行列标号 + 用色清单，导出 PNG / PDF / 系统分享
- **作品库**：保存、重命名、删除、续编，IndexedDB 本地存储
- **离线可用**：PWA service worker 预缓存，断网也能用

## 使用方法

```bash
npm install
npm run dev       # 开发
npm run build     # 生产构建（含 SW 预缓存）
npm run preview   # 预览 dist
```

部署 `dist/` 到任意静态托管（需要 HTTPS 才能注册 service worker）。

iPad 使用：Safari 打开部署地址 → 分享 → 添加到主屏幕。

## 技术栈

React 18 + TypeScript + Vite + vite-plugin-pwa，jsPDF 导出图纸，IndexedDB 作品库。

## 项目结构

- `CONTEXT.md` — 领域术语表（色板/用色集/图案/作品/算色/图纸）
- `docs/` — 架构决策（ADR）、需求 spec、PWA 验证清单
- `src/domain/` — 纯函数领域层（转换/图纸布局/作品库，全部 TDD）
- `scripts/` — 色板生成与视觉验证工具

## 数据说明

- MARD 221 色板数据来自 [HansBug/pindou-color-data](https://github.com/HansBug/pindou-color-data)（社区核对版）
- HEX 为屏幕参考近似值，严谨对色以实体色卡为准
- 色板由 `scripts/generate-mard-palette.mjs` 从 `MARD拼豆221色色号清单.md` 生成
