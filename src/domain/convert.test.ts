import { describe, it, expect } from 'vitest'
import { convertImageToPattern } from './convert'
import type { ColorPalette, SourceImage } from './types'

// 用一个独立的小色板做 worked example，expected 值来自手工推理，
// 不依赖实现逻辑（避免 tautological 测试）。
const palette: ColorPalette = [
  { id: 'R', name: '红', rgb: { r: 255, g: 0, b: 0 } },
  { id: 'G', name: '绿', rgb: { r: 0, g: 255, b: 0 } },
  { id: 'B', name: '蓝', rgb: { r: 0, g: 0, b: 255 } },
  { id: 'W', name: '白', rgb: { r: 255, g: 255, b: 255 } },
]

describe('convertImageToPattern', () => {
  it('把 2x2 图片的每个像素映射到最近的色板色号（无缩放）', () => {
    const image: SourceImage = {
      width: 2,
      height: 2,
      pixels: [
        { r: 255, g: 0, b: 0 }, // 红
        { r: 0, g: 255, b: 0 }, // 绿
        { r: 0, g: 0, b: 255 }, // 蓝
        { r: 255, g: 255, b: 255 }, // 白
      ],
    }
    const result = convertImageToPattern(image, { width: 2, height: 2 }, palette)
    expect(result.pattern.width).toBe(2)
    expect(result.pattern.height).toBe(2)
    expect(result.pattern.cells).toEqual(['R', 'G', 'B', 'W'])
  })

  it('把偏色像素映射到最近的色板色号（最近邻）', () => {
    const image: SourceImage = {
      width: 1,
      height: 1,
      pixels: [{ r: 200, g: 10, b: 10 }], // 接近红
    }
    const result = convertImageToPattern(image, { width: 1, height: 1 }, palette)
    expect(result.pattern.cells).toEqual(['R'])
  })

  it('把大图缩到小网格时，每格取源区域的平均色再映射', () => {
    // 4x4 全红 -> 2x2，每格是 2x2 红色区域，平均仍为红
    const red = { r: 255, g: 0, b: 0 }
    const image: SourceImage = {
      width: 4,
      height: 4,
      pixels: Array.from({ length: 16 }, () => ({ ...red })),
    }
    const result = convertImageToPattern(image, { width: 2, height: 2 }, palette)
    expect(result.pattern.cells).toEqual(['R', 'R', 'R', 'R'])
  })

  it('activePalette 只含实际用到的色号，按色板顺序', () => {
    const image: SourceImage = {
      width: 2,
      height: 1,
      pixels: [
        { r: 255, g: 0, b: 0 }, // 红
        { r: 0, g: 0, b: 255 }, // 蓝
      ],
    }
    const result = convertImageToPattern(image, { width: 2, height: 1 }, palette)
    expect(result.activePalette).toEqual(['R', 'B'])
  })

  it('colorCounts 统计每个色号的出现次数', () => {
    const image: SourceImage = {
      width: 3,
      height: 1,
      pixels: [
        { r: 255, g: 0, b: 0 }, // 红
        { r: 0, g: 0, b: 255 }, // 蓝
        { r: 255, g: 0, b: 0 }, // 红
      ],
    }
    const result = convertImageToPattern(image, { width: 3, height: 1 }, palette)
    expect(result.colorCounts.get('R')).toBe(2)
    expect(result.colorCounts.get('B')).toBe(1)
    expect(result.colorCounts.get('G')).toBeUndefined()
  })

  it('maxColors 限制时保留覆盖最多的色号（平局取色板顺序靠前）', () => {
    // 红 2 格、绿 1 格、蓝 1 格，限制 2 色：保留红+绿（绿比蓝靠前）。
    // 蓝像素在 {R,G} 子集内到两者距离相等（各差一个通道 255），平局取顺序靠前的 R。
    const image: SourceImage = {
      width: 4,
      height: 1,
      pixels: [
        { r: 255, g: 0, b: 0 }, // 红
        { r: 0, g: 255, b: 0 }, // 绿
        { r: 0, g: 0, b: 255 }, // 蓝
        { r: 255, g: 0, b: 0 }, // 红
      ],
    }
    const result = convertImageToPattern(image, { width: 4, height: 1, maxColors: 2 }, palette)
    expect(result.pattern.cells).toEqual(['R', 'G', 'R', 'R'])
    expect(result.activePalette).toEqual(['R', 'G'])
  })

  it('maxColors 大于等于实际用色数时不缩减', () => {
    const image: SourceImage = {
      width: 2,
      height: 1,
      pixels: [
        { r: 255, g: 0, b: 0 }, // 红
        { r: 0, g: 0, b: 255 }, // 蓝
      ],
    }
    const result = convertImageToPattern(image, { width: 2, height: 1, maxColors: 3 }, palette)
    expect(result.pattern.cells).toEqual(['R', 'B'])
    expect(result.activePalette).toEqual(['R', 'B'])
  })

  it('dithering 关闭时每格独立最近邻，误差不扩散', () => {
    // 四格都独立量化到红（最近的色板色号）
    const image: SourceImage = {
      width: 2,
      height: 2,
      pixels: [
        { r: 255, g: 0, b: 120 }, // -> R（到红 14400 < 到蓝 83250）
        { r: 150, g: 0, b: 110 }, // -> R（到红 23125 < 到蓝 43525）
        { r: 150, g: 0, b: 110 }, // -> R
        { r: 150, g: 0, b: 110 }, // -> R
      ],
    }
    const result = convertImageToPattern(image, { width: 2, height: 2, dithering: false }, palette)
    expect(result.pattern.cells).toEqual(['R', 'R', 'R', 'R'])
  })

  it('dithering 开启时误差扩散可改变边界格子的选色', () => {
    const image: SourceImage = {
      width: 2,
      height: 2,
      pixels: [
        { r: 255, g: 0, b: 120 },
        { r: 150, g: 0, b: 110 },
        { r: 150, g: 0, b: 110 },
        { r: 150, g: 0, b: 110 },
      ],
    }
    const result = convertImageToPattern(image, { width: 2, height: 2, dithering: true }, palette)
    expect(result.pattern.cells).toEqual(['R', 'B', 'R', 'R'])
    expect(result.activePalette).toEqual(['R', 'B'])
  })

  it('dithering 与 maxColors 组合时，输出限定在选出的子集内', () => {
    // 4 个明显不同的颜色，限 2 色：断言不变量（结果全在子集内、子集不超上限），
    // 不锁精确格子（组合推演过于临界、脆）。
    const image: SourceImage = {
      width: 2,
      height: 2,
      pixels: [
        { r: 255, g: 0, b: 0 }, // 红
        { r: 0, g: 255, b: 0 }, // 绿
        { r: 0, g: 0, b: 255 }, // 蓝
        { r: 255, g: 255, b: 255 }, // 白
      ],
    }
    const result = convertImageToPattern(
      image,
      { width: 2, height: 2, maxColors: 2, dithering: true },
      palette,
    )
    expect(result.activePalette.length).toBeLessThanOrEqual(2)
    for (const cell of result.pattern.cells) {
      expect(result.activePalette).toContain(cell)
    }
  })
})
