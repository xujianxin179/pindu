import { describe, it, expect } from 'vitest'
import {
  convertImageToPattern,
  computeColorCounts,
  cropImageToSourceImage,
  dominantEdgeColor,
} from './convert'
import type { ColorPalette, Pattern, SourceImage } from './types'

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
    const result = convertImageToPattern(image, { width: 2, height: 2, removeBackground: false }, palette)
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
    const result = convertImageToPattern(image, { width: 1, height: 1, removeBackground: false }, palette)
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
    const result = convertImageToPattern(image, { width: 2, height: 2, removeBackground: false }, palette)
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
    const result = convertImageToPattern(image, { width: 2, height: 1, removeBackground: false }, palette)
    expect(result.activePalette).toEqual(['R', 'B'])
  })

  it('转换结果不含 colorCounts（由 computeColorCounts 派生）', () => {
    const image: SourceImage = {
      width: 3,
      height: 1,
      pixels: [
        { r: 255, g: 0, b: 0 }, // 红
        { r: 0, g: 0, b: 255 }, // 蓝
        { r: 255, g: 0, b: 0 }, // 红
      ],
    }
    const result = convertImageToPattern(image, { width: 3, height: 1, removeBackground: false }, palette)
    expect(result).not.toHaveProperty('colorCounts')
    // 算色由 computeColorCounts 派生，计数正确
    expect(computeColorCounts(result.pattern, result.activePalette).get('R')).toBe(2)
    expect(computeColorCounts(result.pattern, result.activePalette).get('B')).toBe(1)
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
    const result = convertImageToPattern(image, { width: 4, height: 1, maxColors: 2, removeBackground: false }, palette)
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
    const result = convertImageToPattern(image, { width: 2, height: 1, maxColors: 3, removeBackground: false }, palette)
    expect(result.pattern.cells).toEqual(['R', 'B'])
    expect(result.activePalette).toEqual(['R', 'B'])
  })

  it('maxColors 组合时，输出限定在选出的子集内', () => {
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
      { width: 2, height: 2, maxColors: 2, removeBackground: false },
      palette,
    )
    expect(result.activePalette.length).toBeLessThanOrEqual(2)
    for (const cell of result.pattern.cells) {
      expect(result.activePalette).toContain(cell)
    }
  })
})

describe('computeColorCounts', () => {
  it('空图案返回空统计', () => {
    const pattern: Pattern = { width: 0, height: 0, cells: [] }
    expect(computeColorCounts(pattern, [])).toEqual(new Map())
  })

  it('单色图案返回该色计数', () => {
    const pattern: Pattern = { width: 2, height: 2, cells: ['R', 'R', 'R', 'R'] }
    expect(computeColorCounts(pattern, ['R'])).toEqual(new Map([['R', 4]]))
  })

  it('多色图案按色号统计，跳过 null 空格', () => {
    const pattern: Pattern = {
      width: 3,
      height: 2,
      cells: ['R', null, 'B', 'R', 'R', 'G'],
    }
    expect(computeColorCounts(pattern, ['R', 'B', 'G'])).toEqual(
      new Map([
        ['R', 3],
        ['B', 1],
        ['G', 1],
      ]),
    )
  })

  it('结果覆盖 Active Palette 全量，含计数为 0 的色号', () => {
    const pattern: Pattern = { width: 1, height: 1, cells: ['R'] }
    expect(computeColorCounts(pattern, ['R', 'G', 'B'])).toEqual(
      new Map([
        ['R', 1],
        ['G', 0],
        ['B', 0],
      ]),
    )
  })
})

describe('dominantEdgeColor（边缘主色检测）', () => {
  it('返回边缘像素的众数色', () => {
    // 4x4：边缘 12 格白色、中心 4 格红色
    const pixels = Array.from({ length: 16 }, () => ({ r: 255, g: 255, b: 255 }))
    pixels[5] = { r: 255, g: 0, b: 0 }
    pixels[6] = { r: 255, g: 0, b: 0 }
    pixels[9] = { r: 255, g: 0, b: 0 }
    pixels[10] = { r: 255, g: 0, b: 0 }
    const image: SourceImage = { width: 4, height: 4, pixels }
    expect(dominantEdgeColor(image)).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('纯色图返回该色', () => {
    const image: SourceImage = {
      width: 2,
      height: 2,
      pixels: [
        { r: 0, g: 0, b: 0 },
        { r: 0, g: 0, b: 0 },
        { r: 0, g: 0, b: 0 },
        { r: 0, g: 0, b: 0 },
      ],
    }
    expect(dominantEdgeColor(image)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('极小图（1x1）不抛错', () => {
    const image: SourceImage = { width: 1, height: 1, pixels: [{ r: 1, g: 2, b: 3 }] }
    expect(dominantEdgeColor(image)).toEqual({ r: 1, g: 2, b: 3 })
  })
})

describe('convertImageToPattern 去背景', () => {
  const bgPalette: ColorPalette = [
    { id: 'W', name: '白', rgb: { r: 255, g: 255, b: 255 } },
    { id: 'R', name: '红', rgb: { r: 255, g: 0, b: 0 } },
  ]

  it('removeBackground 开启时，与边缘主色接近的格子变 null', () => {
    // 3x3：边缘白、中心红；去背景后边缘 null、中心 R
    const image: SourceImage = {
      width: 3,
      height: 3,
      pixels: [
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
      ],
    }
    const result = convertImageToPattern(
      image,
      { width: 3, height: 3, removeBackground: true },
      bgPalette,
    )
    expect(result.pattern.cells).toEqual([
      null, null, null,
      null, 'R', null,
      null, null, null,
    ])
    expect(result.activePalette).toEqual(['R'])
  })

  it('removeBackground 关闭时，背景色也量化成珠子（行为不变）', () => {
    const image: SourceImage = {
      width: 1,
      height: 1,
      pixels: [{ r: 255, g: 255, b: 255 }],
    }
    const result = convertImageToPattern(
      image,
      { width: 1, height: 1, removeBackground: false },
      bgPalette,
    )
    expect(result.pattern.cells).toEqual(['W'])
  })

  it('全背景图 + maxColors：activePalette 为空、所有格为 null', () => {
    const image: SourceImage = {
      width: 2,
      height: 2,
      pixels: [
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 255, b: 255 },
      ],
    }
    const result = convertImageToPattern(
      image,
      { width: 2, height: 2, maxColors: 1, removeBackground: true },
      bgPalette,
    )
    expect(result.pattern.cells).toEqual([null, null, null, null])
    expect(result.activePalette).toEqual([])
  })

  it('去背景先用色数：背景色不占用 maxColors 预算', () => {
    // 2x2：白背景 + 1 红 + 1 绿内容；maxColors=1 时红/绿平局取色板顺序靠前的红，
    // 绿格在 {R} 子集内也量化为 R（背景不占名额）
    const p: ColorPalette = [
      { id: 'W', name: '白', rgb: { r: 255, g: 255, b: 255 } },
      { id: 'R', name: '红', rgb: { r: 255, g: 0, b: 0 } },
      { id: 'G', name: '绿', rgb: { r: 0, g: 255, b: 0 } },
    ]
    const image: SourceImage = {
      width: 2,
      height: 2,
      pixels: [
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
        { r: 0, g: 255, b: 0 },
      ],
    }
    const result = convertImageToPattern(
      image,
      { width: 2, height: 2, maxColors: 1, removeBackground: true },
      p,
    )
    expect(result.pattern.cells).toEqual([null, 'R', null, 'R'])
    expect(result.activePalette).toEqual(['R'])
  })

  it('交界格背景像素占多数时判为空格，不残留背景色', () => {
    // 2x1 -> 1x1：单格覆盖 1 白(背景) + 1 红(主体)，背景占半 -> 判空格。
    // 旧实现先求平均 (255,128,128) 会量化成白珠，在交界处残留背景色。
    const image: SourceImage = {
      width: 2,
      height: 1,
      pixels: [
        { r: 255, g: 255, b: 255 }, // 白背景
        { r: 255, g: 0, b: 0 }, // 红主体
      ],
    }
    const result = convertImageToPattern(
      image,
      { width: 1, height: 1, removeBackground: true },
      bgPalette,
    )
    expect(result.pattern.cells).toEqual([null])
    expect(result.activePalette).toEqual([])
  })

  it('交界格主体像素占多数时，只取主体像素平均，量化为纯主体色（不被背景稀释）', () => {
    // 4x4 -> 2x2：右下格覆盖 1 白(背景) + 3 红(主体)。
    // 旧实现求平均 (255,64,64) 会量化成粉色（白红之间的稀释色，像残留背景）；
    // 新实现只取 3 个红像素的平均 (255,0,0) -> 纯红。
    const p: ColorPalette = [
      { id: 'W', name: '白', rgb: { r: 255, g: 255, b: 255 } },
      { id: 'P', name: '粉', rgb: { r: 255, g: 100, b: 100 } },
      { id: 'R', name: '红', rgb: { r: 255, g: 0, b: 0 } },
    ]
    const W = { r: 255, g: 255, b: 255 }
    const R = { r: 255, g: 0, b: 0 }
    const image: SourceImage = {
      width: 4,
      height: 4,
      pixels: [
        W, W, W, W,
        W, W, W, W,
        W, W, W, R,
        W, W, R, R,
      ],
    }
    const result = convertImageToPattern(
      image,
      { width: 2, height: 2, removeBackground: true },
      p,
    )
    // 前 3 格全白 -> null；右下格 1白3红 -> 主体占多数，取红像素平均 -> R
    expect(result.pattern.cells).toEqual([null, null, null, 'R'])
    expect(result.activePalette).toEqual(['R'])
  })

  it('maxColors + 交界格：主体占多数的交界格纯主体色参与选色并保留', () => {
    // 4x4 -> 2x2，右下格 1白3红（主体占多数 -> 纯红平均 (255,0,0)）。
    // maxColors=1：initial=[R]，selectRetained 选 R；右下格在 {R} 子集量化为 R。
    // 旧实现平均 (255,64,64) 进 initial 会量化成粉 P，maxColors=1 选 P -> 丢失红。
    const p: ColorPalette = [
      { id: 'W', name: '白', rgb: { r: 255, g: 255, b: 255 } },
      { id: 'P', name: '粉', rgb: { r: 255, g: 100, b: 100 } },
      { id: 'R', name: '红', rgb: { r: 255, g: 0, b: 0 } },
    ]
    const W = { r: 255, g: 255, b: 255 }
    const R = { r: 255, g: 0, b: 0 }
    const image: SourceImage = {
      width: 4,
      height: 4,
      pixels: [
        W, W, W, W,
        W, W, W, W,
        W, W, W, R,
        W, W, R, R,
      ],
    }
    const result = convertImageToPattern(
      image,
      { width: 2, height: 2, maxColors: 1, removeBackground: true },
      p,
    )
    expect(result.pattern.cells).toEqual([null, null, null, 'R'])
    expect(result.activePalette).toEqual(['R'])
  })
})

describe('cropImageToSourceImage（手动裁剪）', () => {
  const image: SourceImage = {
    width: 3,
    height: 2,
    pixels: [
      { r: 255, g: 0, b: 0 }, // 红
      { r: 0, g: 255, b: 0 }, // 绿
      { r: 0, g: 0, b: 255 }, // 蓝
      { r: 255, g: 255, b: 255 }, // 白
      { r: 255, g: 255, b: 0 }, // 黄
      { r: 0, g: 255, b: 255 }, // 青
    ],
  }

  it('按行优先截取指定矩形区域', () => {
    // 3x2 图裁 x:1..2, y:0..1 -> 右 2 列：绿/蓝 + 黄/青
    const out = cropImageToSourceImage(image, { x: 1, y: 0, width: 2, height: 2 })
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(out.pixels).toEqual([
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 255 },
    ])
  })

  it('越界区域被裁剪到图片范围内', () => {
    // x:2 起、宽 3 高 2 越界：clamp 后只剩 (row1, col2) 一个像素
    const out = cropImageToSourceImage(image, { x: 2, y: 1, width: 3, height: 2 })
    expect(out).toEqual({ width: 1, height: 1, pixels: [{ r: 0, g: 255, b: 255 }] })
  })

  it('裁全图返回同尺寸副本', () => {
    const out = cropImageToSourceImage(image, { x: 0, y: 0, width: 3, height: 2 })
    expect(out).toEqual(image)
  })
})
