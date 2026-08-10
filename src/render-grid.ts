// 网格渲染的共享逻辑：预览（PatternCanvas）与图纸导出（renderSheetToCanvas）共用，
// 保证两处格子渲染不漂移。

import type { ColorId, ColorPalette, Pattern } from './domain/types'

export const CELL_SIZE = 12

/**
 * 在 ctx 上绘制网格：每格填色 + 细网格线 + 每 5 格一条粗辅助线。
 * gridX/gridY 为网格区左上角偏移；canvas 尺寸由调用方负责。
 * highlightId 非空时：该色号的格子保持全亮，其余格子变暗（拼豆定位辅助）。
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  palette: ColorPalette,
  gridX: number,
  gridY: number,
  highlightId: ColorId | null = null,
) {
  const colorMap = new Map(palette.map((e) => [e.id, e.rgb]))
  for (let i = 0; i < pattern.cells.length; i++) {
    const x = (i % pattern.width) * CELL_SIZE + gridX
    const y = Math.floor(i / pattern.width) * CELL_SIZE + gridY
    const id = pattern.cells[i]
    const rgb = id ? colorMap.get(id) : null
    ctx.fillStyle = rgb ? `rgb(${rgb.r},${rgb.g},${rgb.b})` : '#ffffff'
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE)

    // 高亮模式：非目标格变暗
    if (highlightId !== null && id !== highlightId) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    }
  }

  // 粗辅助线（每 5 格一条 + 边框）
  ctx.strokeStyle = '#333333'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let gx = 0; gx <= pattern.width * CELL_SIZE; gx += CELL_SIZE * 5) {
    ctx.moveTo(gridX + gx, gridY)
    ctx.lineTo(gridX + gx, gridY + pattern.height * CELL_SIZE)
  }
  for (let gy = 0; gy <= pattern.height * CELL_SIZE; gy += CELL_SIZE * 5) {
    ctx.moveTo(gridX, gridY + gy)
    ctx.lineTo(gridX + pattern.width * CELL_SIZE, gridY + gy)
  }
  ctx.stroke()
}
