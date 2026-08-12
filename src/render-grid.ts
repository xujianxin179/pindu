// 网格渲染的共享逻辑：预览（PatternCanvas）与图纸导出（renderSheetToCanvas）共用，
// 保证两处格子渲染不漂移。

import type { ColorId, ColorPalette, Pattern, RGB } from './domain/types'

export const CELL_SIZE = 12
/** 粗辅助线颜色：MARD F4 珠红（深色钉板与白纸图纸上都醒目）。 */
const GUIDE_LINE_COLOR = '#fb2a40'

/** 按格子底色亮度取对比文字色（亮底黑字、暗底白字），替代白字黑描边，任意底色上都清晰。 */
function contrastTextColor(rgb: RGB): string {
  // Rec.601 亮度，阈值 150：珠黄等亮色用黑字，深色钉板色用白字
  const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
  return lum > 150 ? '#000000' : '#ffffff'
}

/**
 * 在 ctx 上绘制网格：每格填色 + 细网格线 + 每 5 格一条粗辅助线。
 * gridX/gridY 为网格区左上角偏移；canvas 尺寸由调用方负责。
 * cellSize 为格子边长（预览 12px，导出 16px 便于标注色号）。
 * 非高亮时每格标色号；highlightId 非空时：该色号的格子保持全亮并按行优先标序号（1,2,3…），
 * 其余格子变暗（拼豆定位辅助）。
 * emptyColor 为空格（null）格子的填充色：导出图纸用白纸，预览用浅灰"孔"。
 * showColorLabels 控制非高亮模式下是否每格标色号（高亮时始终标序号）。
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  palette: ColorPalette,
  gridX: number,
  gridY: number,
  highlightId: ColorId | null = null,
  emptyColor = '#ffffff',
  cellSize = CELL_SIZE,
  showColorLabels = true,
) {
  const colorMap = new Map(palette.map((e) => [e.id, e.rgb]))
  // 色号/序号标注：字号随格子缩放，字色按格子底色取反色（亮底黑字/暗底白字）
  const labelFont = `bold ${Math.round(cellSize * 0.45)}px ui-monospace, "SF Mono", Consolas, monospace`
  ctx.font = labelFont
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 高亮模式的序号：该色格子按行优先编号 1,2,3…
  let highlightSeq = 0
  for (let i = 0; i < pattern.cells.length; i++) {
    const x = (i % pattern.width) * cellSize + gridX
    const y = Math.floor(i / pattern.width) * cellSize + gridY
    const id = pattern.cells[i]
    const rgb = id ? colorMap.get(id) : null
    ctx.fillStyle = rgb ? `rgb(${rgb.r},${rgb.g},${rgb.b})` : emptyColor
    ctx.fillRect(x, y, cellSize, cellSize)
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, cellSize, cellSize)

    if (highlightId !== null) {
      // 高亮模式：非目标格变暗（空格保持原色，导出留白/预览孔不被涂暗）；
      // 目标格标序号（白字黑描边，亮色上可读）
      if (id !== null && id !== highlightId) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.fillRect(x, y, cellSize, cellSize)
      } else if (id !== null) {
        highlightSeq++
        const label = String(highlightSeq)
        // 目标格保持全亮原色，序号用底色反色字（不描边）
        ctx.fillStyle = rgb ? contrastTextColor(rgb) : '#ffffff'
        ctx.fillText(label, x + cellSize / 2, y + cellSize / 2)
      }
    } else if (id !== null && showColorLabels && rgb) {
      // 普通模式：每格标色号，字色取底色反色（亮底黑字/暗底白字，不描边）
      ctx.fillStyle = contrastTextColor(rgb)
      ctx.fillText(id, x + cellSize / 2, y + cellSize / 2)
    }
  }

  // 粗辅助线（每 5 格一条，红色）：边框实线，中间辅助线实线/虚线交替
  // （第 5 格实线、第 10 格虚线、第 15 格实线…），便于区分 5 与 10 的区块
  const gridW = pattern.width * cellSize
  const gridH = pattern.height * cellSize
  ctx.strokeStyle = GUIDE_LINE_COLOR
  ctx.lineWidth = 1
  // 边框始终实线
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.rect(gridX, gridY, gridW, gridH)
  ctx.stroke()
  // 中间竖直辅助线：奇数条（5,15,25…）实线，偶数条（10,20…）虚线
  for (let n = 1; n * cellSize * 5 < gridW; n++) {
    ctx.setLineDash(n % 2 === 0 ? [4, 4] : [])
    ctx.beginPath()
    ctx.moveTo(gridX + n * cellSize * 5, gridY)
    ctx.lineTo(gridX + n * cellSize * 5, gridY + gridH)
    ctx.stroke()
  }
  // 中间水平辅助线：同上交替
  for (let n = 1; n * cellSize * 5 < gridH; n++) {
    ctx.setLineDash(n % 2 === 0 ? [4, 4] : [])
    ctx.beginPath()
    ctx.moveTo(gridX, gridY + n * cellSize * 5)
    ctx.lineTo(gridX + gridW, gridY + n * cellSize * 5)
    ctx.stroke()
  }
  ctx.setLineDash([])
}
