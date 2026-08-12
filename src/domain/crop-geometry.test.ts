// 裁剪几何的 worked-example 测试：手柄命中、clamp 边界、5 种拖拽模式。

import { describe, expect, it } from 'vitest'
import { applyDrag, clampCrop, hitHandle, type CropRect } from './crop-geometry'

const BOUNDS = { width: 100, height: 80 }
const R: CropRect = { x: 10, y: 10, width: 40, height: 30 }

describe('hitHandle', () => {
  it('四角手柄命中（容差内）', () => {
    expect(hitHandle({ x: 10, y: 10 }, R, 5)).toBe('nw')
    expect(hitHandle({ x: 50, y: 10 }, R, 5)).toBe('ne')
    expect(hitHandle({ x: 10, y: 40 }, R, 5)).toBe('sw')
    expect(hitHandle({ x: 50, y: 40 }, R, 5)).toBe('se')
  })

  it('中心附近不命中手柄', () => {
    expect(hitHandle({ x: 30, y: 25 }, R, 5)).toBeNull()
  })

  it('框外不命中', () => {
    expect(hitHandle({ x: 4, y: 4 }, R, 5)).toBeNull()
  })
})

describe('clampCrop', () => {
  it('坐标负值钳到 0', () => {
    expect(clampCrop({ x: -5, y: -3, width: 40, height: 30 }, BOUNDS, 5)).toEqual({ x: 0, y: 0, width: 40, height: 30 })
  })

  it('坐标超出边界钳到边界（尺寸随之收窄）', () => {
    expect(clampCrop({ x: 90, y: 70, width: 40, height: 30 }, BOUNDS, 5)).toEqual({ x: 90, y: 70, width: 10, height: 10 })
  })

  it('尺寸不小于最小边长', () => {
    expect(clampCrop({ x: 10, y: 10, width: 2, height: 2 }, BOUNDS, 5)).toEqual({ x: 10, y: 10, width: 5, height: 5 })
  })

  it('超大尺寸收窄到边界内', () => {
    expect(clampCrop({ x: 0, y: 0, width: 200, height: 200 }, BOUNDS, 5)).toEqual({ x: 0, y: 0, width: 100, height: 80 })
  })
})

describe('applyDrag', () => {
  const drag = { startX: 20, startY: 15, crop: R }

  it('move：随位移平移', () => {
    const r = applyDrag('move', drag, { x: 30, y: 25 }, BOUNDS, 5)
    expect(r).toEqual({ x: 20, y: 20, width: 40, height: 30 })
  })

  it('se：右下角缩放，左上角不动', () => {
    const r = applyDrag('se', drag, { x: 30, y: 25 }, BOUNDS, 5)
    expect(r).toEqual({ x: 10, y: 10, width: 50, height: 40 })
  })

  it('nw：左上角缩放（dx/dy 反向），右下角不动', () => {
    const r = applyDrag('nw', drag, { x: 30, y: 25 }, BOUNDS, 5)
    expect(r).toEqual({ x: 20, y: 20, width: 30, height: 20 })
  })

  it('ne：右上角缩放，左下角不动', () => {
    const r = applyDrag('ne', drag, { x: 30, y: 25 }, BOUNDS, 5)
    expect(r).toEqual({ x: 10, y: 20, width: 50, height: 20 })
  })

  it('sw：左下角缩放，右上角不动', () => {
    const r = applyDrag('sw', drag, { x: 30, y: 25 }, BOUNDS, 5)
    expect(r).toEqual({ x: 20, y: 10, width: 30, height: 40 })
  })

  it('拖拽结果经过 clamp（越界坐标钳到边界-min，尺寸收窄）', () => {
    const r = applyDrag('move', drag, { x: 120, y: 25 }, BOUNDS, 5)
    expect(r.x).toBe(95)
    expect(r.width).toBe(5)
  })
})
