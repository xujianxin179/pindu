// 抠图 mask 缓存：key 推导（廉价哈希）+ LRU 驱逐藏在这里。
// ai-mask 只负责推理，缓存策略由本 module 承担（node 可测）。

import type { BackgroundMask } from './mask'
import type { SourceImage } from './types'

/** AI 抠图结果：ok 携带 mask，failed 携带错误信息（替换 'failed' 字符串 sentinel）。 */
export type MaskResult =
  | { status: 'ok'; mask: BackgroundMask }
  | { status: 'failed'; error: string }

/** FNV-1a 32 位滚动哈希：尺寸 + 逐像素 RGB，O(n) 但廉价、固定长度 key（替代全像素字符串拼接）。 */
export function imageKey(image: SourceImage): number {
  let h = 0x811c9dc5
  const step = (v: number) => {
    h ^= v
    h = Math.imul(h, 0x01000193)
  }
  step(image.width)
  step(image.height)
  for (const p of image.pixels) {
    step(p.r)
    step(p.g)
    step(p.b)
  }
  return h >>> 0
}

/**
 * 抠图结果缓存（LRU）：value 是 MaskResult（ok 带 mask / failed 带 error），
 * 命中 ok/failed 都跳过重复推理；maxEntries 满时淘汰最久未使用的 key。
 */
export class MaskCache {
  private readonly maxEntries: number
  private map = new Map<number, MaskResult>()

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 100
  }

  get(key: number): MaskResult | undefined {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    // 命中提升为最近使用（删除后重插，Map 迭代顺序即 LRU 序）
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }

  set(key: number, value: MaskResult): void {
    this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }
}
