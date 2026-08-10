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
})
