// MaskCache 的 worked-example 测试：命中/未命中、LRU 驱逐、失败值缓存。

import { describe, expect, it } from 'vitest'
import { MaskCache, imageKey } from './mask-cache'
import type { SourceImage } from './types'

function img(pixels: number[][]): SourceImage {
  return {
    width: 2,
    height: 2,
    pixels: pixels.map(([r, g, b]) => ({ r, g, b })),
  }
}

const IMG_A = img([
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 255],
])
const IMG_B = img([
  [0, 0, 0],
  [10, 10, 10],
  [20, 20, 20],
  [30, 30, 30],
])

describe('MaskCache', () => {
  const okResult = { status: 'ok' as const, mask: new Uint8Array([0]) }
  const failResult = { status: 'failed' as const, error: 'x' }

  it('未命中返回 undefined，命中返回缓存值', () => {
    const c = new MaskCache()
    expect(c.get(imageKey(IMG_A))).toBeUndefined()
    c.set(imageKey(IMG_A), okResult)
    expect(c.get(imageKey(IMG_A))).toBe(okResult)
  })

  it('不同图（不同像素）key 不同', () => {
    const c = new MaskCache()
    c.set(imageKey(IMG_A), okResult)
    expect(c.get(imageKey(IMG_B))).toBeUndefined()
  })

  it('同一图重复 set 覆盖旧值', () => {
    const c = new MaskCache()
    const k = imageKey(IMG_A)
    c.set(k, failResult)
    c.set(k, okResult)
    expect(c.get(k)).toBe(okResult)
  })

  it('LRU：maxEntries 满时淘汰最久未使用的 key', () => {
    const c = new MaskCache({ maxEntries: 2 })
    const ka = imageKey(IMG_A)
    const kb = imageKey(IMG_B)
    c.set(ka, okResult)
    c.set(kb, okResult)
    c.get(ka) // 最近使用 ka
    const kc = imageKey(img([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]))
    c.set(kc, okResult) // 满，驱逐最久未用的 kb
    expect(c.get(kb)).toBeUndefined()
    expect(c.get(ka)).toBe(okResult)
    expect(c.get(kc)).toBe(okResult)
  })
})

describe('imageKey', () => {
  it('同尺寸同像素 → 同 key（幂等）', () => {
    expect(imageKey(IMG_A)).toBe(imageKey(IMG_A))
  })

  it('尺寸不同 → 不同 key', () => {
    const wide = img([
      [1, 2, 3],
      [4, 5, 6],
    ])
    wide.width = 1
    wide.height = 2
    expect(imageKey(IMG_A)).not.toBe(imageKey(wide))
  })

  it('像素顺序不同 → 不同 key', () => {
    const a = img([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ])
    const b = img([
      [4, 5, 6],
      [1, 2, 3],
      [7, 8, 9],
      [10, 11, 12],
    ])
    expect(imageKey(a)).not.toBe(imageKey(b))
  })
})
