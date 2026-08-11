import { describe, it, expect } from 'vitest'
import { upsampleMask, binarizeToBackgroundMask, fillBackgroundHoles } from './mask'

describe('upsampleMask（双线性上采样，角点对齐）', () => {
  it('尺寸相同时原样返回', () => {
    const src = new Float32Array([0.1, 0.5, 0.9, 0.2])
    expect([...upsampleMask(src, 2, 2, 2, 2)]).toEqual([...src])
  })

  it('2x2 -> 4x4 双线性插值，期望值手工推演', () => {
    // 源（行优先）：v00=0 v01=1 / v10=0.5 v11=1
    // 角点对齐 sx = x/3, sy = y/3，f = v00(1-sx)(1-sy)+v01·sx(1-sy)+v10(1-sx)sy+v11·sx·sy
    const src = new Float32Array([0, 1, 0.5, 1])
    const out = upsampleMask(src, 2, 2, 4, 4)
    const expected = [
      0, 1 / 3, 2 / 3, 1,
      1 / 6, 4 / 9, 13 / 18, 1,
      1 / 3, 5 / 9, 7 / 9, 1,
      0.5, 2 / 3, 5 / 6, 1,
    ]
    for (let i = 0; i < expected.length; i++) {
      expect(out[i]).toBeCloseTo(expected[i], 4)
    }
  })

  it('一维退化（1x2 -> 1x4）线性插值', () => {
    const src = new Float32Array([0, 1])
    const out = upsampleMask(src, 1, 2, 1, 4)
    for (let i = 0; i < 4; i++) {
      expect(out[i]).toBeCloseTo([0, 1 / 3, 2 / 3, 1][i], 6)
    }
  })

  it('非整数倍上采样输出尺寸正确', () => {
    const src = new Float32Array([0.2, 0.8])
    expect(upsampleMask(src, 1, 2, 1, 5)).toHaveLength(5)
  })

  it('目标侧 1 像素高（2x2 -> 4x1）退化为取首行，不产生 NaN', () => {
    // dstH=1：sy 恒 0，等价于 2x2 -> 4x2 的第一行
    const src = new Float32Array([0, 1, 0.5, 1])
    const out = upsampleMask(src, 2, 2, 4, 1)
    expect(out.length).toBe(4)
    for (let i = 0; i < 4; i++) {
      expect(Number.isNaN(out[i])).toBe(false)
      expect(out[i]).toBeCloseTo([0, 1 / 3, 2 / 3, 1][i], 4)
    }
  })

  it('目标侧 1 像素宽（2x2 -> 1x4）退化为取首列，不产生 NaN', () => {
    // dstW=1：sx 恒 0，等价于 2x2 -> 4x4 的第一列
    const src = new Float32Array([0, 1, 0.5, 1])
    const out = upsampleMask(src, 2, 2, 1, 4)
    expect(out.length).toBe(4)
    for (let i = 0; i < 4; i++) {
      expect(Number.isNaN(out[i])).toBe(false)
      expect(out[i]).toBeCloseTo([0, 1 / 6, 1 / 3, 0.5][i], 4)
    }
  })

  it('目标侧 1x1（2x2 -> 1x1）取源左上角值', () => {
    const src = new Float32Array([0, 1, 0.5, 1])
    expect(upsampleMask(src, 2, 2, 1, 1)[0]).toBe(0)
  })

  it('非方图（2x3 -> 3x2）输出尺寸正确且无 NaN', () => {
    const src = new Float32Array(6).fill(0.4)
    const out = upsampleMask(src, 2, 3, 3, 2)
    expect(out).toHaveLength(6)
    for (const v of out) {
      expect(Number.isNaN(v)).toBe(false)
      expect(v).toBeCloseTo(0.4, 6)
    }
  })
})

describe('binarizeToBackgroundMask（前景概率 -> 背景 mask）', () => {
  it('prob >= 阈值为前景（0），否则背景（1），与 convert 管线 bgMask 语义一致', () => {
    const prob = new Float32Array([0.1, 0.6, 0.5, 0.9])
    expect([...binarizeToBackgroundMask(prob, 0.5)]).toEqual([1, 0, 0, 0])
  })

  it('阈值取 0 时全部前景（概率恒 >= 0）', () => {
    const prob = new Float32Array([0.0, 0.001])
    expect([...binarizeToBackgroundMask(prob, 0)]).toEqual([0, 0])
  })
})

describe('fillBackgroundHoles（主体内部背景空洞填充）', () => {
  // mask 语义 1=背景 0=前景；只填"不与图像边缘连通的背景区域"，边缘连通背景保留
  const M = (rows: number[][]): number[] => rows.flat()

  it('环中心被前景包围的背景洞被填充为前景', () => {
    // 4x4：边缘一圈前景（主体环），中心 2x2 背景（镂空洞，不连通边缘）
    const mask = new Uint8Array(
      M([
        [0, 0, 0, 0],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
      ]),
    )
    expect([...fillBackgroundHoles(mask, 4, 4)]).toEqual([
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ])
  })

  it('与边缘连通的背景保留，仅内部孤立洞被填', () => {
    // 5x5：左侧 2 列背景（连通边缘）保留；(3,1) 处背景被前景包围 → 填
    const mask = new Uint8Array(
      M([
        [1, 1, 0, 0, 0],
        [1, 1, 0, 1, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
      ]),
    )
    expect([...fillBackgroundHoles(mask, 5, 5)]).toEqual(
      M([
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
      ]),
    )
  })

  it('贴边主体内部的洞同样被填（洞不接触边缘）', () => {
    // 5x3：主体贴满第一行，(2,1)(3,1) 背景洞被前景包围 → 填
    const mask = new Uint8Array(
      M([
        [0, 0, 0, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 0, 0, 0],
      ]),
    )
    expect([...fillBackgroundHoles(mask, 5, 3)]).toEqual([
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ])
  })

  it('全背景 mask 不变（全部连通边缘）', () => {
    const mask = new Uint8Array(
      M([
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]),
    )
    expect([...fillBackgroundHoles(mask, 3, 3)]).toEqual([...mask])
  })

  it('全前景 mask 不变', () => {
    const mask = new Uint8Array(
      M([
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ]),
    )
    expect([...fillBackgroundHoles(mask, 3, 3)]).toEqual([...mask])
  })

  it('单行图（所有像素都是边缘）背景全部保留', () => {
    const mask = new Uint8Array(M([[1, 0, 1, 0, 1]]))
    expect([...fillBackgroundHoles(mask, 5, 1)]).toEqual([1, 0, 1, 0, 1])
  })

  it('minArea：面积 >= 阈值的洞填为前景，小洞标记为细节（2）', () => {
    // 5x5：4px 洞（(1,1)-(2,2)）+ 1px 洞（(3,3)，邻居全前景 0、不接触边缘，孤立内部），minArea=3
    const mask = new Uint8Array(
      M([
        [0, 0, 0, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0],
      ]),
    )
    // 4px 洞被填（0）、1px 洞标记为细节（2）
    expect([...fillBackgroundHoles(mask, 5, 5, 3)]).toEqual(
      M([
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 2, 0],
        [0, 0, 0, 0, 0],
      ]),
    )
    // 阈值 5：4px 洞也 < 5，标记为细节（2）
    expect([...fillBackgroundHoles(mask, 5, 5, 5)]).toEqual(
      M([
        [0, 0, 0, 0, 0],
        [0, 2, 2, 0, 0],
        [0, 2, 2, 0, 0],
        [0, 0, 0, 2, 0],
        [0, 0, 0, 0, 0],
      ]),
    )
  })

  it('minArea 默认 0：所有洞都填为前景（与旧行为一致）', () => {
    const mask = new Uint8Array(
      M([
        [0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ]),
    )
    // 1px 洞默认也填
    expect([...fillBackgroundHoles(mask, 5, 5)]).toEqual([
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ])
  })

  it('空 mask 返回空', () => {
    expect([...fillBackgroundHoles(new Uint8Array(0), 0, 0)]).toEqual([])
  })
})
