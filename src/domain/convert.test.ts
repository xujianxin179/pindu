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

  it('maxColors 超出时，把覆盖格子最少的色号合并到最近的剩余色号', () => {
    // 3 色各 1 格，限制 2 色：红(255,0,0) 到绿/蓝距离相等，平局取色板顺序靠前的绿
    const image: SourceImage = {
      width: 3,
      height: 1,
      pixels: [
        { r: 255, g: 0, b: 0 }, // 红
        { r: 0, g: 255, b: 0 }, // 绿
        { r: 0, g: 0, b: 255 }, // 蓝
      ],
    }
    const result = convertImageToPattern(image, { width: 3, height: 1, maxColors: 2 }, palette)
    expect(result.pattern.cells).toEqual(['G', 'G', 'B'])
    expect(result.activePalette).toEqual(['G', 'B'])
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
    // 手工推演 Floyd-Steinberg（2x2 行优先；权重：右 7/16、下 5/16、左下 3/16、右下 1/16）：
    // p0=(255,0,120) -> R（14400<83250），误差 (0,0,120)：7/16→p1、5/16→p2、1/16→p3
    // p1=(150,0,110)+(0,0,52.5)=(150,0,162.5)：到红 37431 > 到蓝 31056 -> B
    //    p1 误差 (150,0,-92.5)：3/16→p2、5/16→p3
    // p2=(150,0,110)+(0,0,37.5)+(28.1,0,-17.3)=(178.1,0,130.2)：到红 22864 < 到蓝 47295 -> R
    //    p2 误差 (-76.9,0,130.2)：7/16→p3
    // p3=(150,0,110)+(0,0,7.5)+(46.9,0,-28.9)+(-33.6,0,57)=(163.3,0,145.6)：到红 29609 < 到蓝 38638 -> R
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
})
