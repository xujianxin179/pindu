// prepareConvert 的 worked-example 测试：gate 分支、AI 等待/失败回退、mask 透传。

import { describe, expect, it } from 'vitest'
import { prepareConvert } from './convert-orchestrate'
import type { ConvertSnapshot } from './convert-orchestrate'
import type { MaskResult } from './mask-cache'

const MASK = new Uint8Array([0, 1, 2])

function maskResult(status: MaskResult['status']): MaskResult {
  return status === 'ok' ? { status: 'ok', mask: MASK } : { status: 'failed', error: '测试失败' }
}

function snap(over: Partial<ConvertSnapshot> = {}): ConvertSnapshot {
  return {
    image: {
      width: 2,
      height: 2,
      pixels: Array.from({ length: 4 }, () => ({ r: 10, g: 20, b: 30 })),
    },
    cropMode: false,
    gridWidth: 10,
    gridHeight: 8,
    maxColors: 12,
    bgMode: 'ai',
    bgMask: maskResult('ok'),
    ...over,
  }
}

describe('prepareConvert', () => {
  it('gate：无图返回 null', () => {
    expect(prepareConvert(snap({ image: null }))).toBeNull()
  })

  it('gate：裁剪中返回 null', () => {
    expect(prepareConvert(snap({ cropMode: true }))).toBeNull()
  })

  it('gate：宽/高/色数未填（空字符串）返回 null', () => {
    expect(prepareConvert(snap({ gridWidth: '' }))).toBeNull()
    expect(prepareConvert(snap({ gridHeight: '' }))).toBeNull()
    expect(prepareConvert(snap({ maxColors: '' }))).toBeNull()
  })

  it('AI 等待中（mask 未生成 null）：返回 null，等后台预计算完成后重跑', () => {
    expect(prepareConvert(snap({ bgMask: null }))).toBeNull()
  })

  it('AI 模式 + mask 成功：removeBackground true 且传外部 mask', () => {
    const r = prepareConvert(snap())!
    expect(r.params.removeBackground).toBe(true)
    expect(r.params.backgroundMask).toBe(MASK)
  })

  it('AI 模式 + failed：removeBackground true 但不传 mask（convert 内部回退 flood fill）', () => {
    const r = prepareConvert(snap({ bgMask: maskResult('failed') }))!
    expect(r.params.removeBackground).toBe(true)
    expect(r.params.backgroundMask).toBeUndefined()
  })

  it('off 模式：removeBackground false 且不传 mask，即使 mask 已生成', () => {
    const r = prepareConvert(snap({ bgMode: 'off' }))!
    expect(r.params.removeBackground).toBe(false)
    expect(r.params.backgroundMask).toBeUndefined()
  })

  it('mask 长度是否匹配不在此判断（convert 内部防御回退），成功态原样透传', () => {
    const short = { status: 'ok' as const, mask: new Uint8Array([0]) }
    const r = prepareConvert(snap({ bgMask: short }))!
    expect(r.params.backgroundMask).toBe(short.mask)
  })

  it('gate 通过后 image 与网格参数透传', () => {
    const s = snap()
    const r = prepareConvert(s)!
    expect(r.image).toBe(s.image)
    expect(r.params.width).toBe(10)
    expect(r.params.height).toBe(8)
    expect(r.params.maxColors).toBe(12)
  })
})
