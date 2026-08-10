// 图纸 (Build Sheet) 的 Canvas 渲染与导出。浏览器环境（依赖 document），不在 node seam 内。

import { jsPDF } from 'jspdf'
import { buildSheetLayout } from './domain/sheet'
import { computeColorCounts } from './domain/convert'
import type { History } from './domain/edit'
import type { ColorPalette } from './domain/types'

const CELL_SIZE = 12
const GUIDE_INTERVAL = 5
/** 图纸下方用色清单的行高。 */
const LIST_ROW_HEIGHT = 20
const LIST_MARGIN = 10

/** 把图纸渲染到指定 Canvas。返回该 canvas。 */
export function renderSheetToCanvas(
  canvas: HTMLCanvasElement,
  history: History,
  palette: ColorPalette,
): HTMLCanvasElement {
  const { pattern, activePalette } = history.present
  const counts = computeColorCounts(pattern, activePalette)
  const layout = buildSheetLayout(pattern.width, pattern.height, {
    cellSize: CELL_SIZE,
    guideInterval: GUIDE_INTERVAL,
    showLabels: true,
    labelGutter: 20,
  })
  const ctx = canvas.getContext('2d')!
  const listHeight = activePalette.length > 0 ? LIST_MARGIN + activePalette.length * LIST_ROW_HEIGHT + LIST_MARGIN : 0
  // 用 devicePixelRatio 缩放保证清晰
  const dpr = window.devicePixelRatio || 1
  canvas.width = layout.sheetWidth * dpr
  canvas.height = (layout.sheetHeight + listHeight) * dpr
  canvas.style.width = `${layout.sheetWidth}px`
  canvas.style.height = `${layout.sheetHeight + listHeight}px`
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, layout.sheetWidth, layout.sheetHeight + listHeight)

  const colorMap = new Map(palette.map((e) => [e.id, e.rgb]))

  // 格子
  for (let i = 0; i < pattern.cells.length; i++) {
    const x = (i % pattern.width) * CELL_SIZE + layout.gridX
    const y = Math.floor(i / pattern.width) * CELL_SIZE + layout.gridY
    const id = pattern.cells[i]
    const rgb = id ? colorMap.get(id) : null
    ctx.fillStyle = rgb ? `rgb(${rgb.r},${rgb.g},${rgb.b})` : '#ffffff'
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    // 细网格线
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE)
  }

  // 粗辅助线（每 5 格一条 + 边框）
  ctx.strokeStyle = '#333333'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const vx of layout.vLines) {
    ctx.moveTo(layout.gridX + vx, layout.gridY)
    ctx.lineTo(layout.gridX + vx, layout.gridY + layout.gridHeight)
  }
  for (const hy of layout.hLines) {
    ctx.moveTo(layout.gridX, layout.gridY + hy)
    ctx.lineTo(layout.gridX + layout.gridWidth, layout.gridY + hy)
  }
  ctx.stroke()

  // 行列标号
  if (layout.colLabels.length) {
    ctx.fillStyle = '#333333'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let x = 0; x < pattern.width; x++) {
      ctx.fillText(layout.colLabels[x], layout.gridX + x * CELL_SIZE + CELL_SIZE / 2, 10)
    }
    ctx.textAlign = 'right'
    for (let y = 0; y < pattern.height; y++) {
      ctx.fillText(layout.rowLabels[y], layout.gridX - 5, layout.gridY + y * CELL_SIZE + CELL_SIZE / 2)
    }
  }

  // 用色清单（色号 + 样块 + 数量）
  ctx.textAlign = 'left'
  ctx.font = '11px sans-serif'
  let listY = layout.sheetHeight + LIST_MARGIN
  for (const id of activePalette) {
    const entry = palette.find((e) => e.id === id)!
    ctx.fillStyle = `rgb(${entry.rgb.r},${entry.rgb.g},${entry.rgb.b})`
    ctx.fillRect(10, listY, 14, 14)
    ctx.strokeStyle = '#cccccc'
    ctx.lineWidth = 0.5
    ctx.strokeRect(10, listY, 14, 14)
    ctx.fillStyle = '#333333'
    ctx.fillText(`${id} × ${counts.get(id) ?? 0}`, 30, listY + 8)
    listY += LIST_ROW_HEIGHT
  }

  return canvas
}

/** 导出图纸为 PNG：渲染到离屏 canvas 后下载。 */
export function exportSheetPng(history: History, palette: ColorPalette, filename: string) {
  const canvas = document.createElement('canvas')
  renderSheetToCanvas(canvas, history, palette)
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

/** 导出图纸为 PDF：渲染到离屏 canvas，再以图片嵌入 PDF 下载。 */
export function exportSheetPdf(history: History, palette: ColorPalette, filename: string) {
  const canvas = document.createElement('canvas')
  renderSheetToCanvas(canvas, history, palette)
  const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait' })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, pdf.internal.pageSize.getWidth() - 20, 0)
  pdf.save(filename)
}
