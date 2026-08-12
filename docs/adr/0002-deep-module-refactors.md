# 深模块重构：架构评审深化成果

## 背景

一次架构评审（improve-codebase-architecture）识别出多处 friction：App effect 编排零 seam、drawGrid 参数爆炸、guide line 决策分裂、mask 三态语义散落 4 文件、'failed' sentinel 透传、canvas 装配分叉、裁剪几何埋在 UI。随后完成 7 个 deepening。本文记录最终形态与理由，供未来架构评审不再重提。

## 决策

1. **转换编排收进 domain（prepareConvert）**：gate（无图/裁剪中/宽高色数空/AI 等待中）与抠图回退规则合成纯函数 `prepareConvert(snapshot): {image, params} | null`，App effect 退化为薄壳；返回 null = 本次不转换。
2. **mask 三态建模为常量 + 命名类型**：`MASK_FOREGROUND=0 / MASK_BACKGROUND=1 / MASK_DETAIL=2` 与 `BackgroundMask` 类型集中定义在 mask.ts，全部管道签名使用。不加 brand。
3. **drawGrid 参数收窄为 options + preset**：9 个 positional 参数 → `GridOptions` 对象 + `GRID_PREVIEW`/`GRID_SHEET` 命名 preset；`SHEET_CELL_SIZE` 单一事实源在 render-grid.ts。
4. **guide line 决策单一事实源（留在 drawGrid）**：删除 `SheetLayout.vLines/hLines` 死输出（无 caller）与锁死它们的 4 个测试；辅助线（每 5 格、实虚交替）由 drawGrid 自算，sheet.ts 回归纯几何。
5. **MaskResult 值对象 + LRU 缓存 module**：`'failed'` 字符串 sentinel → `MaskResult = {status:'ok', mask} | {status:'failed', error}`；`imageKey` 改 FNV-1a 滚动哈希；`MaskCache` 独立 module（LRU 驱逐、可注入）。ai-mask 只负责推理。
6. **canvas 装配统一（sizeCanvas）**：dpr 缩放 + style 尺寸 + 底色填充集中一处，预览与导出共用；预览高分屏清晰（原会糊）。
7. **裁剪几何抽成纯函数**：`hitHandle/clampCrop/applyDrag` 进 domain/crop-geometry（node 可测），CropView 退化薄壳。

## 理由（未来 explorer 不重提的原因）

- **1、5**：决策与状态流转已集中在 domain 纯函数，有 test seam；不要移回 App/effect。
- **2**：三态语义唯一事实源在 mask.ts；不要为"两条路径（flood fill 二态 / AI 三态）可区分"引入 brand——消费端只认 `=== MASK_BACKGROUND`，不 care 态集合，那是伪精确。
- **3**：不要恢复 positional 参数；新渲染差异（如辅助线密度）加 preset 字段。
- **4**：guide line 是渲染关切，留在 drawGrid；不要塞回 layout（layout 是纯几何，可被非渲染用途复用）。
- **6**：装配统一后不要在两处重复手写 dpr/style；新增画布场景一律用 sizeCanvas。
- **7**：裁剪几何不要回到 component 内；交互改动只动薄壳。

## Consequences

- domain 层增至 9 个 module（+convert-orchestrate / mask-cache / crop-geometry），全部 node 可测；测试 88 → 105。
- 架构语言：module/interface/depth/seam/adapter/leverage/locality（见 codebase-design skill），不混用 component/service/boundary。
- 仍待深化（低 leverage，暂不动）：PNG-blob 装配重复（exportSheetPng vs shareSheet）、BG_TOLERANCE 硬编码散落测试。
