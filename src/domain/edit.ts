import type { ColorId, ColorPalette, Pattern } from './types'

/**
 * 轻量编辑模块：对 Pattern 的不可变编辑操作 + 撤销/重做历史栈。
 * 所有编辑函数返回新 Pattern，不修改入参（不可变，便于历史栈复用）。
 */

/** 把 (x, y) 格替换为新色号（不可变）。 */
export function setCell(pattern: Pattern, x: number, y: number, id: ColorId): Pattern {
  return modifyCell(pattern, x, y, id)
}

/** 把 (x, y) 格清空为 null（橡皮擦，不可变）。 */
export function eraseCell(pattern: Pattern, x: number, y: number): Pattern {
  return modifyCell(pattern, x, y, null)
}

function modifyCell(pattern: Pattern, x: number, y: number, value: Pattern['cells'][number]): Pattern {
  const idx = y * pattern.width + x
  const cells = pattern.cells.slice()
  cells[idx] = value
  return { ...pattern, cells }
}

/** 返回 (x, y) 格的色号；空格返回 null。 */
export function colorAt(pattern: Pattern, x: number, y: number): ColorId | null {
  return pattern.cells[y * pattern.width + x]
}

/** 把矩形区域（含边界）批量换成某色号（不可变）。 */
export function fillRect(
  pattern: Pattern,
  rect: { x0: number; y0: number; x1: number; y1: number },
  id: ColorId,
): Pattern {
  const cells = pattern.cells.slice()
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      cells[y * pattern.width + x] = id
    }
  }
  return { ...pattern, cells }
}

/** 历史快照：图案 + 当时的用色集（撤销/重做时一起恢复）。 */
export interface Snapshot {
  pattern: Pattern
  activePalette: ColorId[]
}

/** 历史栈：present 为当前快照，past/future 为可回退/重做的快照。 */
export interface History {
  present: Snapshot
  past: Snapshot[]
  future: Snapshot[]
}

export function createHistory(initial: Snapshot): History {
  return { present: initial, past: [], future: [] }
}

/** 应用一个编辑（传入已变换后的快照），推进历史并清空 future。 */
export function applyEdit(history: History, next: Snapshot): History {
  return { present: next, past: [...history.past, history.present], future: [] }
}

/** 撤销一步；无可撤销时返回 null。 */
export function undo(history: History): History | null {
  if (history.past.length === 0) return null
  const prev = history.past[history.past.length - 1]
  return {
    present: prev,
    past: history.past.slice(0, -1),
    future: [history.present, ...history.future],
  }
}

/** 重做一步；无可重做时返回 null。 */
export function redo(history: History): History | null {
  if (history.future.length === 0) return null
  const next = history.future[0]
  return {
    present: next,
    future: history.future.slice(1),
    past: [...history.past, history.present],
  }
}

/** 把色号按色板顺序加入用色集（若已包含则原样返回）。 */
export function extendActivePalette(
  activePalette: ColorId[],
  id: ColorId,
  palette: ColorPalette,
): ColorId[] {
  if (activePalette.includes(id)) return activePalette
  const order = new Map(palette.map((e, i) => [e.id, i]))
  return [...activePalette, id].sort((a, b) => order.get(a)! - order.get(b)!)
}
