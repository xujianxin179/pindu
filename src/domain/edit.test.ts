import { describe, it, expect } from 'vitest'
import {
  setCell,
  eraseCell,
  colorAt,
  fillRect,
  createHistory,
  applyEdit,
  undo,
  redo,
  extendActivePalette,
} from './edit'
import type { ColorPalette, Pattern } from './types'

const palette: ColorPalette = [
  { id: 'R', name: '红', rgb: { r: 255, g: 0, b: 0 } },
  { id: 'G', name: '绿', rgb: { r: 0, g: 255, b: 0 } },
  { id: 'B', name: '蓝', rgb: { r: 0, g: 0, b: 255 } },
  { id: 'W', name: '白', rgb: { r: 255, g: 255, b: 255 } },
]

/** 构造 width×height 的空网格。 */
function grid(width: number, height: number, fill: Pattern['cells'][number] = null): Pattern {
  return { width, height, cells: Array.from({ length: width * height }, () => fill) }
}

describe('setCell / eraseCell / colorAt', () => {
  it('setCell 把 (x,y) 格替换为新色号', () => {
    const p = setCell(grid(2, 2), 1, 0, 'R')
    expect(p.cells).toEqual([null, 'R', null, null])
  })

  it('setCell 不可变：原 pattern 的 cells 不被修改', () => {
    const original = grid(2, 2)
    setCell(original, 0, 0, 'R')
    expect(original.cells).toEqual([null, null, null, null])
  })

  it('eraseCell 清空格子为 null', () => {
    const p = eraseCell(grid(2, 1, 'R'), 0, 0)
    expect(p.cells).toEqual([null, 'R'])
  })

  it('colorAt 返回格子色号，空格返回 null', () => {
    const p = setCell(grid(2, 2), 0, 0, 'R')
    expect(colorAt(p, 0, 0)).toBe('R')
    expect(colorAt(p, 1, 1)).toBeNull()
  })
})

describe('fillRect', () => {
  it('把矩形区域（含边界）批量换成某色号', () => {
    const p = fillRect(grid(3, 2), { x0: 1, y0: 0, x1: 2, y1: 1 }, 'G')
    expect(p.cells).toEqual([null, 'G', 'G', null, 'G', 'G'])
  })

  it('单格矩形等价于 setCell', () => {
    const p = fillRect(grid(2, 2), { x0: 0, y0: 1, x1: 0, y1: 1 }, 'W')
    expect(p.cells).toEqual([null, null, 'W', null])
  })
})

describe('撤销 / 重做', () => {
  it('applyEdit 推进历史，undo 逐级回退', () => {
    const h0 = createHistory(grid(2, 1))
    const h1 = applyEdit(h0, setCell(h0.present, 0, 0, 'R'))
    const h2 = applyEdit(h1, setCell(h1.present, 1, 0, 'B'))
    expect(h2.present.cells).toEqual(['R', 'B'])
    expect(undo(h2)!.present.cells).toEqual(['R', null])
    expect(undo(undo(h2)!)!.present.cells).toEqual([null, null])
  })

  it('undo 到顶返回 null', () => {
    const h = createHistory(grid(2, 1))
    expect(undo(h)).toBeNull()
  })

  it('redo 重做已撤销的操作', () => {
    const h0 = createHistory(grid(2, 1))
    const h1 = applyEdit(h0, setCell(h0.present, 0, 0, 'R'))
    const h2 = applyEdit(h1, setCell(h1.present, 1, 0, 'B'))
    const u = undo(h2)!
    expect(redo(u)!.present.cells).toEqual(['R', 'B'])
    expect(redo(redo(u)!)).toBeNull()
  })

  it('redo 到顶返回 null', () => {
    const h = createHistory(grid(2, 1))
    expect(redo(h)).toBeNull()
  })

  it('applyEdit 清空 future（新分支后不能再 redo）', () => {
    const h0 = createHistory(grid(2, 1))
    const h1 = applyEdit(h0, setCell(h0.present, 0, 0, 'R'))
    const h2 = applyEdit(h1, setCell(h1.present, 1, 0, 'B'))
    const u = undo(h2)!
    const branched = applyEdit(u, setCell(u.present, 0, 0, 'W'))
    expect(redo(branched)).toBeNull()
    expect(branched.present.cells).toEqual(['W', null])
  })
})

describe('extendActivePalette', () => {
  it('已包含的色号原样返回', () => {
    expect(extendActivePalette(['R', 'B'], 'R', palette)).toEqual(['R', 'B'])
  })

  it('新色号按色板顺序插入', () => {
    expect(extendActivePalette(['R', 'B'], 'G', palette)).toEqual(['R', 'G', 'B'])
    expect(extendActivePalette(['R'], 'W', palette)).toEqual(['R', 'W'])
    expect(extendActivePalette([], 'W', palette)).toEqual(['W'])
  })
})
