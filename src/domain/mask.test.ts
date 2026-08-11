import { describe, it, expect } from 'vitest'
import { upsampleMask, binarizeToBackgroundMask } from './mask'

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
