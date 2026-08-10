---
triage: ready-for-agent
---

# Spec: 图片转拼豆图案（pinDu MVP）

## Problem Statement

拼豆创作者想把一张图片做成拼豆作品时，面临两个手工难题：一是不知道这张图该用哪些色号、每色多少颗（靠肉眼估、容易错）；二是没有一份能"照着拼"的图纸，拼装时容易数错行列、找错颜色。现有工具要么不针对 MARD 221 色号体系，要么不能在 iPad 上顺手用。创作者需要一个自用的、能在 iPad 上随时打开的工具：丢一张图进去，自动算出用哪些色号、各多少颗，并生成带辅助线的图纸照着拼。

## Solution

一个自用的 PWA（Web 应用），在 iPad Safari 中"添加到主屏幕"使用。核心是一条流水线：导入图片 -> 自动转成 Pattern（拼豆图案）-> 实时 Color Counting（算色）-> 生成 Build Sheet（图纸）-> 分享。图案基于内置的 MARD 221 色 ColorPalette 量化，用户可控制网格尺寸、用色数上限、抖动开关；转换后可轻量编辑修正，作品存入本地作品库。

## User Stories

### 图片导入
1. As a 拼豆创作者, I want to 从相册选择一张图片导入, so that 把它转成拼豆图案
2. As a 拼豆创作者, I want to 从文件 app 选择图片导入, so that 能用任意来源的图片
3. As a 拼豆创作者, I want to 拍照导入, so that 直接拍实物或参考图
4. As a 拼豆创作者, I want to 从剪贴板粘贴图片, so that 快速导入复制的图

### 转换参数
5. As a 拼豆创作者, I want to 设定图案网格尺寸（宽×高，或长边珠数按图片比例算）, so that 控制图案大小
6. As a 拼豆创作者, I want to 设定用色数上限, so that 控制图案用多少种颜色
7. As a 拼豆创作者, I want to 开关抖动, so that 在干净色块和照片感之间切换

### 转换与预览
8. As a 拼豆创作者, I want to 一键把图片转成 Pattern, so that 得到拼豆图案
9. As a 拼豆创作者, I want to 转换后看到图案预览, so that 检查效果

### 算色
10. As a 拼豆创作者, I want to 实时看到 Active Palette 里每种色号需要多少颗珠子, so that 照着采购/找货

### 编辑
11. As a 拼豆创作者, I want to 替换单格颜色, so that 修正量化不准的格子
12. As a 拼豆创作者, I want to 用橡皮擦清空格子, so that 去掉多余的珠子
13. As a 拼豆创作者, I want to 区域填充, so that 批量改一块
14. As a 拼豆创作者, I want to 用吸管取已有格子的颜色, so that 复用图案里的色
15. As a 拼豆创作者, I want to 撤销/重做, so that 放心试错
16. As a 拼豆创作者, I want to 用 Active Palette 之外的颜色编辑, so that 引入量化没选中的色号
17. As a 拼豆创作者, I want to 编辑后 Active Palette 与 Color Counting 自动更新, so that 算色和图纸跟着变

### 图纸
18. As a 拼豆创作者, I want to 生成带辅助线的图案预览（每 5 格粗线 + 每格细网格）, so that 照着拼不数错
19. As a 拼豆创作者, I want to 在图纸上叠加行列标号, so that 精确定位格子
20. As a 拼豆创作者, I want to 图纸含用色清单（色号 + 颜色样块 + 数量）, so that 照着备货
21. As a 拼豆创作者, I want to 导出图纸为 PNG, so that 存图或分享
22. As a 拼豆创作者, I want to 导出图纸为 PDF, so that 打印

### 分享
23. As a 拼豆创作者, I want to 通过系统分享表分享图纸, so that 发到微信/存相册/AirDrop

### 作品库
24. As a 拼豆创作者, I want to 把图案保存为 Work, so that 以后还能用
25. As a 拼豆创作者, I want to 在作品库看到所有作品, so that 管理多个作品
26. As a 拼豆创作者, I want to 重新打开作品继续编辑, so that 续作
27. As a 拼豆创作者, I want to 重命名/删除作品, so that 整理作品库
28. As a 拼豆创作者, I want to 作品保存原图缩略图, so that 回顾

### PWA
29. As a 拼豆创作者, I want to 把 app 添加到 iPad 主屏幕, so that 像原生 app 一样打开
30. As a 拼豆创作者, I want to 离线可用（数据存本地）, so that 没网也能用

### 色板
31. As a 拼豆创作者, I want to app 内置 MARD 221 色 ColorPalette, so that 量化和算色基于真实色号

## Implementation Decisions

- **技术栈**：React + TypeScript + Vite + vite-plugin-pwa。依据 ADR-0001（PWA 而非原生）。目标浏览器 iPad Safari。
- **核心转换管线（纯函数）**：`convertImageToPattern(image, params, palette) -> { pattern, activePalette, colorCounts }`。
  - `params`: `{ width, height, maxColors, dithering }`（width/height 由用户输入或长边珠数按图片宽高比算出）
  - `palette`: MARD 221 色 `{ id, name, rgb }[]`
  - 量化分两步：① 在 `maxColors` 上限内从 221 色里选出最能还原本图的子集（具体选色算法 k-means / median cut / popularity 留给实现，spec 只约束"上限内最能还原"）；② 每格映射到子集中最近色，抖动开关控制是否做误差扩散（Floyd-Steinberg），默认关。
- **领域数据模型**：
  - `ColorPalette`：221 个 `{ id, name, rgb }`，静态内置数据。
  - `Pattern`：`{ width, height, cells: (ColorId | null)[] }`，尺寸自由可调，不绑定钉板。
  - `Active Palette`：`ColorId[]`，量化时初始化，编辑引入色板内任意色号时随之扩展。
  - `Color Counting`：`Map<ColorId, number>`，由 Pattern + Active Palette 派生。
  - `Work`：`{ id, name, pattern, activePalette, createdAt, updatedAt, sourceThumbnail }`。
- **存储**：IndexedDB 存作品库；ColorPalette 作为静态资源内置。
- **图纸渲染**：Canvas 渲染图案预览（每 5 格粗辅助线 + 每格细网格 + 可选行列标号）+ 用色清单；导出 PNG 用 `canvas.toBlob`，导出 PDF 用 jsPDF。
- **分享**：`navigator.share`（Web Share API），不支持时降级为下载文件；与导出共用同一份渲染产物。
- **图片导入**：`<input type="file" accept="image/*">`（相册/文件/拍照）+ 剪贴板 `paste` 事件。
- **UI 结构**：作品库视图（列表）、编辑器视图（图案预览 + 参数面板 + 工具栏 + 算色清单）、图纸预览/导出。编辑 Pattern 后重算 Color Counting 并刷新预览。
- **色板数据前置依赖**：MARD 221 色的 `{ id, name, rgb }` 对照表需在实现前获取/标定，作为静态数据内置。若官方未公开完整 RGB，需对实物做色值标定。

## Testing Decisions

- **主 seam**：核心转换管线 `convertImageToPattern`，作为纯函数测试。
- **好测试的定义**：只测 external behavior--给定固定的 image + params + palette，断言输出的 `{ pattern, activePalette, colorCounts }`。量化是确定性的，用快照测试（snapshot）锁定输出，不测内部算法步骤。
- **算色测试**：给定一个 Pattern 和 Active Palette，断言 colorCounts 正确（纯派生函数，易写枚举用例）。
- **不测**：UI 组件实现细节、Canvas 像素级渲染（图纸渲染留待后续可选快照）。
- **prior art**：项目为空，无现有测试。采用 Vitest（Vite 默认测试器）+ 快照。

## Out of Scope

- 多品牌色板切换（自用，单一 MARD 221）。
- 从零手绘图案（主轴是图片转图案，编辑仅限微调）。
- 云同步 / 账号系统 / 社区分享。
- App Store 发布。
- 标准钉板尺寸约束与"需要几块板"换算（图案为自由网格，不绑定钉板）。
- 网图 URL 导入 / 云盘导入。
- 分步拼装指引（按区域分步）。
- Android / 桌面浏览器适配保证（目标仅 iPad Safari）。

## Further Notes

- 色板数据（MARD 221 色 RGB 对照表）是实现的硬前置依赖，需先解决数据来源；其准确性直接决定量化与算色的可用性。
- 量化的"用色选择算法"与"抖动算法"的具体实现选型不在 spec 约束内，只要满足"上限内最能还原 + 抖动可开关且默认关"。
- 所有领域术语定义见 `CONTEXT.md`；技术栈决策见 `docs/adr/0001-pwa-over-native.md`。
