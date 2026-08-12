// 转换编排：把"是否转换 + 抠图回退决策"从 App 的 effect 编排中抽出的纯决策。
// 单一 caller（App），gate 与回退规则的先后依赖藏在 implementation 内；
// 返回 null = 本次不转换（gate 不过 / AI 等待中，等后台预计算完成后重跑）。

import type { ConvertParams, SourceImage } from './types'
import type { MaskResult } from './mask-cache'

export interface ConvertSnapshot {
  image: SourceImage | null
  cropMode: boolean
  gridWidth: number | ''
  gridHeight: number | ''
  maxColors: number | ''
  bgMode: 'ai' | 'off'
  bgMask: MaskResult | null
}

export function prepareConvert(
  snapshot: ConvertSnapshot,
): { image: SourceImage; params: ConvertParams } | null {
  const { image, cropMode, gridWidth, gridHeight, maxColors, bgMode, bgMask } = snapshot
  if (!image || cropMode || gridWidth === '' || gridHeight === '' || maxColors === '') return null
  // AI 模式：外部 mask 未生成（后台预计算中）时等待，完成后重跑本函数
  if (bgMode === 'ai' && bgMask === null) return null
  const params: ConvertParams = {
    width: gridWidth,
    height: gridHeight,
    maxColors,
  }
  if (bgMode !== 'off') {
    params.removeBackground = true
    // failed 不传（convert 内部回退 flood fill）；ok 透传 mask——长度不匹配是 convert 内部防御，外部不重复判断
    if (bgMask?.status === 'ok') params.backgroundMask = bgMask.mask
  } else {
    params.removeBackground = false
  }
  return { image, params }
}
