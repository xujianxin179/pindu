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

  it('辅助线每 guideInterval 格一条，含左右/上下边框', () => {
    const l = buildSheetLayout(10, 10, { cellSize: 10, guideInterval: 5, showLabels: false })
    expect(l.vLines).toEqual([0, 50, 100])
    expect(l.hLines).toEqual([0, 50, 100])
  })

  it('网格尺寸不能被间隔整除时，边框仍在内', () => {
    const l = buildSheetLayout(9, 9, { cellSize: 10, guideInterval: 5, showLabels: false })
    expect(l.vLines).toEqual([0, 50, 90])
    expect(l.hLines).toEqual([0, 50, 90])
  })

  it('单格图纸只有边框线', () => {
    const l = buildSheetLayout(1, 1, { cellSize: 10, guideInterval: 5, showLabels: false })
    expect(l.vLines).toEqual([0, 10])
    expect(l.hLines).toEqual([0, 10])
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
