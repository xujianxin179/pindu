// 图纸 (Build Sheet) 的 Canvas 渲染与导出。浏览器环境（依赖 document），不在 node seam 内。

import { jsPDF } from 'jspdf'
import { buildSheetLayout } from './domain/sheet'
import { computeColorCounts } from './domain/convert'
import { drawGrid } from './render-grid'
import type { ColorId, ColorPalette, ConvertResult } from './domain/types'

const GUIDE_INTERVAL = 5
/** 导出图纸格子边长：16px 便于每格标注色号。 */
const SHEET_CELL_SIZE = 16
/** 图纸下方用色清单的行高。 */
const LIST_ROW_HEIGHT = 20
const LIST_MARGIN = 10

/** 把图纸渲染到指定 Canvas（含辅助线、行列标号、每格色号标注与用色清单）。返回该 canvas。 */
export function renderSheetToCanvas(
  canvas: HTMLCanvasElement,
  result: ConvertResult,
  palette: ColorPalette,
  highlightId: ColorId | null = null,
): HTMLCanvasElement {
  const { pattern, activePalette } = result
  const counts = computeColorCounts(pattern, activePalette)
  const layout = buildSheetLayout(pattern.width, pattern.height, {
    cellSize: SHEET_CELL_SIZE,
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

  drawGrid(ctx, pattern, palette, layout.gridX, layout.gridY, highlightId, '#ffffff', SHEET_CELL_SIZE)

  // 行列标号：列标在顶部留白区、行标在左侧留白区（各垂直/水平居中），不压格子
  if (layout.colLabels.length) {
    ctx.fillStyle = '#333333'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let x = 0; x < pattern.width; x++) {
      ctx.fillText(layout.colLabels[x], layout.gridX + x * SHEET_CELL_SIZE + SHEET_CELL_SIZE / 2, layout.gridY / 2)
    }
    ctx.textAlign = 'right'
    for (let y = 0; y < pattern.height; y++) {
      ctx.fillText(layout.rowLabels[y], layout.gridX / 2, layout.gridY + y * SHEET_CELL_SIZE + SHEET_CELL_SIZE / 2)
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

/** 下载 Blob 为文件（导出 PNG 与分享降级共用）。 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟 revoke：立即 revoke 会破坏移动端浏览器的下载（blob URL 读取在点击后异步进行）
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** 导出图纸为 PNG：渲染到离屏 canvas 后下载。用同步 toDataURL 保证在用户点击的手势栈内触发下载（移动端 Safari/Chrome 拦截异步下载）。 */
export function exportSheetPng(
  result: ConvertResult,
  palette: ColorPalette,
  filename: string,
  highlightId: ColorId | null = null,
) {
  const canvas = document.createElement('canvas')
  renderSheetToCanvas(canvas, result, palette, highlightId)
  // 同步触发下载：toBlob 回调是异步的，移动端会因失去用户手势拦截
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 生成图纸 PDF（等比缩放适配一页），导出与分享共用。 */
function buildSheetPdf(
  result: ConvertResult,
  palette: ColorPalette,
  highlightId: ColorId | null,
): jsPDF {
  const canvas = document.createElement('canvas')
  renderSheetToCanvas(canvas, result, palette, highlightId)
  const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10
  // 等比缩放：宽高都适配在页面内（含边距），保证清单不被截断
  const scale = Math.min((pageW - margin * 2) / canvas.width, (pageH - margin * 2) / canvas.height)
  const w = canvas.width * scale
  const h = canvas.height * scale
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h)
  return pdf
}

/** 导出图纸为 PDF：生成 PDF 并下载。用同步 output('datauristring') 在用户手势内触发（移动端拦截异步下载）。 */
export function exportSheetPdf(
  result: ConvertResult,
  palette: ColorPalette,
  filename: string,
  highlightId: ColorId | null = null,
) {
  const pdf = buildSheetPdf(result, palette, highlightId)
  const url = pdf.output('datauristring')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** 分享图纸（PNG/PDF）：优先 Web Share API，不支持时降级为下载。与导出共用 renderSheetToCanvas。 */
export async function shareSheet(
  result: ConvertResult,
  palette: ColorPalette,
  filename: string,
  format: 'png' | 'pdf' = 'png',
  highlightId: ColorId | null = null,
): Promise<void> {
  let blob: Blob
  if (format === 'pdf') {
    blob = buildSheetPdf(result, palette, highlightId).output('blob')
  } else {
    const canvas = document.createElement('canvas')
    renderSheetToCanvas(canvas, result, palette, highlightId)
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob) return
    blob = pngBlob
  }
  const file = new File([blob], filename, { type: format === 'pdf' ? 'application/pdf' : 'image/png' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
    } catch {
      // 用户取消分享（AbortError）等，忽略
    }
  } else {
    // 降级：下载文件
    downloadBlob(blob, filename)
  }
}
