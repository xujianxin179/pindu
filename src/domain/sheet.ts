/**
 * 图纸 (Build Sheet) 布局：计算网格偏移、行列标号与图纸尺寸。
 * 纯函数、确定性，供 Canvas 渲染使用。
 * 辅助线（每 5 格一条、实虚交替）是渲染关切，由 drawGrid 自算，layout 不管。
 */

export interface SheetOptions {
  cellSize: number
  /** 是否显示行列标号。 */
  showLabels?: boolean
  /** 标号边距（px），仅 showLabels 时生效。 */
  labelGutter?: number
}

export interface SheetLayout {
  /** 网格区左上角偏移（带标号时 > 0）。 */
  gridX: number
  gridY: number
  /** 网格区尺寸（px）。 */
  gridWidth: number
  gridHeight: number
  /** 图纸总尺寸（px）。 */
  sheetWidth: number
  sheetHeight: number
  /** 列标号，长度 = width；不带标号时为 []。 */
  colLabels: string[]
  /** 行标号，长度 = height；不带标号时为 []。 */
  rowLabels: string[]
}

/** 计算图纸布局（可选行列标号）。 */
export function buildSheetLayout(
  width: number,
  height: number,
  options: SheetOptions,
): SheetLayout {
  const { cellSize, showLabels = false, labelGutter = 16 } = options
  const gridWidth = width * cellSize
  const gridHeight = height * cellSize
  const gridX = showLabels ? labelGutter : 0
  const gridY = showLabels ? labelGutter : 0

  // 行列标号均为数字：列 1..width、行 1..height
  const colLabels = showLabels ? Array.from({ length: width }, (_, i) => String(i + 1)) : []
  const rowLabels = showLabels ? Array.from({ length: height }, (_, i) => String(i + 1)) : []

  return {
    gridX,
    gridY,
    gridWidth,
    gridHeight,
    sheetWidth: gridWidth + gridX,
    sheetHeight: gridHeight + gridY,
    colLabels,
    rowLabels,
  }
}
