import { describe, it, expect } from 'vitest'
import { MARD_PALETTE } from './palette'

describe('MARD 221 色色板', () => {
  it('共 221 色，id 唯一且格式为系列+编号', () => {
    expect(MARD_PALETTE.length).toBe(221)
    const ids = MARD_PALETTE.map((e) => e.id)
    expect(new Set(ids).size).toBe(221)
    for (const id of ids) {
      expect(id).toMatch(/^[A-Z]\d+$/)
    }
  })

  it('每色 RGB 在 0-255', () => {
    for (const e of MARD_PALETTE) {
      expect(e.rgb.r).toBeGreaterThanOrEqual(0)
      expect(e.rgb.r).toBeLessThanOrEqual(255)
      expect(e.rgb.g).toBeGreaterThanOrEqual(0)
      expect(e.rgb.g).toBeLessThanOrEqual(255)
      expect(e.rgb.b).toBeGreaterThanOrEqual(0)
      expect(e.rgb.b).toBeLessThanOrEqual(255)
    }
  })

  it('各系列色数与清单一致：A26 B32 C29 D26 E24 F25 G21 H23 M15', () => {
    const bySeries = new Map<string, number>()
    for (const e of MARD_PALETTE) {
      const s = e.id[0]
      bySeries.set(s, (bySeries.get(s) ?? 0) + 1)
    }
    expect(Object.fromEntries(bySeries)).toEqual({
      A: 26,
      B: 32,
      C: 29,
      D: 26,
      E: 24,
      F: 25,
      G: 21,
      H: 23,
      M: 15,
    })
  })
})
