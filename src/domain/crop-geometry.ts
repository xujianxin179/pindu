// 裁剪几何：裁剪框的手柄命中、边界 clamp、5 种拖拽模式。
// 纯函数、node 可测；CropView 只负责 pointer → 坐标 → 本 module → setState。

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropBounds {
  width: number
  height: number
}

export type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

/** 命中四角手柄（容差 radius 内）返回手柄名，否则 null。 */
export function hitHandle(
  pos: { x: number; y: number },
  c: CropRect,
  radius: number,
): 'nw' | 'ne' | 'sw' | 'se' | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= radius
  if (near(pos.x, c.x) && near(pos.y, c.y)) return 'nw'
  if (near(pos.x, c.x + c.width) && near(pos.y, c.y)) return 'ne'
  if (near(pos.x, c.x) && near(pos.y, c.y + c.height)) return 'sw'
  if (near(pos.x, c.x + c.width) && near(pos.y, c.y + c.height)) return 'se'
  return null
}

/** 限制裁剪框在 bounds 内且不小于最小边长 min（坐标钳到 bounds-min，尺寸收窄）。 */
export function clampCrop(next: CropRect, bounds: CropBounds, min: number): CropRect {
  const x = Math.max(0, Math.min(next.x, bounds.width - min))
  const y = Math.max(0, Math.min(next.y, bounds.height - min))
  const width = Math.max(min, Math.min(next.width, bounds.width - x))
  const height = Math.max(min, Math.min(next.height, bounds.height - y))
  return { x, y, width, height }
}

/** 拖拽起点 drag（含起始 crop）与当前指针 pos 合成新 crop，经 clamp。 */
export function applyDrag(
  mode: DragMode,
  drag: { startX: number; startY: number; crop: CropRect },
  pos: { x: number; y: number },
  bounds: CropBounds,
  min: number,
): CropRect {
  const dx = pos.x - drag.startX
  const dy = pos.y - drag.startY
  const c = drag.crop
  switch (mode) {
    case 'move':
      return clampCrop({ x: c.x + dx, y: c.y + dy, width: c.width, height: c.height }, bounds, min)
    case 'se':
      return clampCrop({ ...c, width: c.width + dx, height: c.height + dy }, bounds, min)
    case 'nw':
      return clampCrop({ x: c.x + dx, y: c.y + dy, width: c.width - dx, height: c.height - dy }, bounds, min)
    case 'ne':
      return clampCrop({ x: c.x, y: c.y + dy, width: c.width + dx, height: c.height - dy }, bounds, min)
    case 'sw':
      return clampCrop({ x: c.x + dx, y: c.y, width: c.width - dx, height: c.height + dy }, bounds, min)
  }
}
