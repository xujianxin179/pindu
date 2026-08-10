# 01 - 项目骨架 + 图片转 Pattern 端到端（占位色板）

**What to build:** 从相册/文件导入一张图片，用内置占位色板（约 16 色）和固定参数，一键转成 Pattern 并在 Canvas 显示网格预览。打通"导入 -> 转换 -> 显示"最窄链路，作为后续所有功能的骨架。含 Vite + React + TypeScript + 基础 PWA manifest，以及核心转换管线的快照测试。

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] Vite + React + TypeScript 项目可运行，含基础 PWA manifest（能添加到 iPad 主屏幕）
- [ ] 可通过 file input 从相册/文件选择一张图片导入
- [ ] 内置一个占位 ColorPalette（约 16 色 `{id,name,rgb}`）
- [ ] 核心转换管线 `convertImageToPattern` 用固定参数把图片转成 Pattern（每格映射到占位色板最近色）
- [ ] Canvas 上显示 Pattern 网格预览（每格按色号着色）
- [ ] `convertImageToPattern` 有快照测试（固定输入 -> 固定输出）
- [ ] 在 iPad Safari 上能打开并跑通"导入 -> 转换 -> 显示"这条链路
