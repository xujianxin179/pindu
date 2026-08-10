// 网格渲染的共享逻辑：预览（PatternCanvas）与图纸导出（renderSheetToCanvas）共用，
// 保证两处格子渲染不漂移。

import type { ColorId, ColorPalette, Pattern } from './domain/types'

export const CELL_SIZE = 12
/** 粗辅助线颜色：MARD F4 珠红（深色钉板与白纸图纸上都醒目）。 */
const GUIDE_LINE_COLOR = '#fb2a40'

/**
 * 在 ctx 上绘制网格：每格填色 + 细网格线 + 每 5 格一条粗辅助线。
 * gridX/gridY 为网格区左上角偏移；canvas 尺寸由调用方负责。
 * highlightId 非空时：该色号的格子保持全亮并按行优先标序号（1,2,3…），
 * 其余格子变暗（拼豆定位辅助）。
 * emptyColor 为空格（null）格子的填充色：导出图纸用白纸，预览用浅灰"孔"。
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  palette: ColorPalette,
  gridX: number,
  gridY: number,
  highlightId: ColorId | null = null,
  emptyColor = '#ffffff',
) {
  const colorMap = new Map(palette.map((e) => [e.id, e.rgb]))
  // 高亮模式的序号：该色格子按行优先编号 1,2,3…
  let highlightSeq = 0
  if (highlightId !== null) {
    ctx.font = 'bold 8px ui-monospace, "SF Mono", Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
  }
  for (let i = 0; i < pattern.cells.length; i++) {
    const x = (i % pattern.width) * CELL_SIZE + gridX
    const y = Math.floor(i / pattern.width) * CELL_SIZE + gridY
    const id = pattern.cells[i]
    const rgb = id ? colorMap.get(id) : null
    ctx.fillStyle = rgb ? `rgb(${rgb.r},${rgb.g},${rgb.b})` : emptyColor
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE)

    // 高亮模式：非目标格变暗（空格保持原色，导出留白/预览孔不被涂暗）；
    // 目标格标序号（白字黑描边，亮色上可读）
    if (highlightId !== null && id !== null && id !== highlightId) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    } else if (highlightId !== null && id !== null) {
      highlightSeq++
      const label = String(highlightSeq)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.lineWidth = 3
      ctx.strokeText(label, x + CELL_SIZE / 2, y + CELL_SIZE / 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, x + CELL_SIZE / 2, y + CELL_SIZE / 2)
    }
  }

  // 粗辅助线（每 5 格一条 + 边框，红色）
  ctx.strokeStyle = GUIDE_LINE_COLOR
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
