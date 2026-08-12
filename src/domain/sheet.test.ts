import { describe, it, expect } from 'vitest'
import { buildSheetLayout } from './sheet'

describe('buildSheetLayout', () => {
  it('无标号时网格贴左上角，尺寸 = 网格尺寸', () => {
    const l = buildSheetLayout(10, 5, { cellSize: 10, showLabels: false })
    expect(l.gridX).toBe(0)
    expect(l.gridY).toBe(0)
    expect(l.sheetWidth).toBe(100)
    expect(l.sheetHeight).toBe(50)
  })

  it('带标号时网格右移/下移，留出标号边距', () => {
    const l = buildSheetLayout(10, 5, { cellSize: 10, showLabels: true })
    expect(l.gridX).toBeGreaterThan(0)
    expect(l.gridY).toBeGreaterThan(0)
    expect(l.sheetWidth).toBe(100 + l.gridX)
    expect(l.sheetHeight).toBe(50 + l.gridY)
  })

  it('标号数组长度与网格一致，列标行标均为数字', () => {
    const l = buildSheetLayout(3, 2, { cellSize: 10, showLabels: true })
    expect(l.colLabels).toEqual(['1', '2', '3'])
    expect(l.rowLabels).toEqual(['1', '2'])
  })

  it('不带标号时不生成标号数组', () => {
    const l = buildSheetLayout(3, 2, { cellSize: 10, showLabels: false })
    expect(l.colLabels).toEqual([])
    expect(l.rowLabels).toEqual([])
  })
})
