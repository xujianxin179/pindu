// 图纸 (Build Sheet) 的 Canvas 渲染与导出。浏览器环境（依赖 document），不在 node seam 内。

import { jsPDF } from 'jspdf'
import { buildSheetLayout } from './domain/sheet'
import { computeColorCounts } from './domain/convert'
import { drawGrid, GRID_SHEET, SHEET_CELL_SIZE } from './render-grid'
import type { ColorId, ColorPalette, ConvertResult } from './domain/types'

const LIST_ROW_HEIGHT = 20
const LIST_MARGIN = 10
/** 用色清单横向排列的列宽：色块 14 + 间距 + "色号 × 数量" 文本。 */
const LIST_COL_WIDTH = 90

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
    showLabels: true,
    labelGutter: 20,
  })
  const ctx = canvas.getContext('2d')!
  // 用色清单横向排列：按图纸宽度算每行列数，listHeight 按实际行数
  const listCols = Math.max(1, Math.floor((layout.sheetWidth - LIST_MARGIN - 10) / LIST_COL_WIDTH))
  const listRows = activePalette.length > 0 ? Math.ceil(activePalette.length / listCols) : 0
  const listHeight = listRows > 0 ? LIST_MARGIN + listRows * LIST_ROW_HEIGHT + LIST_MARGIN : 0
  // 用 devicePixelRatio 缩放保证清晰
  const dpr = window.devicePixelRatio || 1
  canvas.width = layout.sheetWidth * dpr
  canvas.height = (layout.sheetHeight + listHeight) * dpr
  canvas.style.width = `${layout.sheetWidth}px`
  canvas.style.height = `${layout.sheetHeight + listHeight}px`
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, layout.sheetWidth, layout.sheetHeight + listHeight)

  drawGrid(ctx, pattern, palette, {
    offset: { x: layout.gridX, y: layout.gridY },
    ...GRID_SHEET,
    highlightId,
  })

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

  // 用色清单（色号 + 样块 + 数量）：横向排列，排满换行
  ctx.textAlign = 'left'
  ctx.font = '11px sans-serif'
  let listX = 10
  let listY = layout.sheetHeight + LIST_MARGIN
  for (const id of activePalette) {
    const entry = palette.find((e) => e.id === id)!
    ctx.fillStyle = `rgb(${entry.rgb.r},${entry.rgb.g},${entry.rgb.b})`
    ctx.fillRect(listX, listY, 14, 14)
    ctx.strokeStyle = '#cccccc'
    ctx.lineWidth = 0.5
    ctx.strokeRect(listX, listY, 14, 14)
    ctx.fillStyle = '#333333'
    ctx.fillText(`${id} × ${counts.get(id) ?? 0}`, listX + 20, listY + 8)
    listX += LIST_COL_WIDTH
    if (listX + LIST_COL_WIDTH > layout.sheetWidth - 10) {
      listX = 10
      listY += LIST_ROW_HEIGHT
    }
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

/** 导出图纸为 PNG：渲染到离屏 canvas 后下载。 */
export function exportSheetPng(
  result: ConvertResult,
  palette: ColorPalette,
  filename: string,
  highlightId: ColorId | null = null,
) {
  const canvas = document.createElement('canvas')
  renderSheetToCanvas(canvas, result, palette, highlightId)
  // 用 Blob URL（非 data URL）：安卓 Chrome 对 a[download] + data URL 报
  // "下载链接不正确"。Blob URL 兼容所有设备。
  canvas.toBlob((blob) => {
    if (!blob) return
    downloadBlob(blob, filename)
  }, 'image/png')
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

/** 导出图纸为 PDF：生成 PDF 并下载。 */
export function exportSheetPdf(
  result: ConvertResult,
  palette: ColorPalette,
  filename: string,
  highlightId: ColorId | null = null,
) {
  // 用 Blob URL（非 data URL）：安卓 Chrome 对 a[download] + data URL 报
  // "下载链接不正确"。PDF Blob 可能较大（几 MB），data URL 会撑爆内存。
  const pdf = buildSheetPdf(result, palette, highlightId)
  downloadBlob(pdf.output('blob'), filename)
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
