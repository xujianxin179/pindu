/**
 * 图纸 (Build Sheet) 布局：计算辅助线位置、行列标号与图纸尺寸。
 * 纯函数、确定性，供 Canvas 渲染使用。
 */

/** Excel 式列标号：0->A, 25->Z, 26->AA, 51->AZ, 52->BA。 */
export function columnLabel(index: number): string {
  let n = index + 1
  let label = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    label = String.fromCharCode(65 + rem) + label
    n = Math.floor((n - 1) / 26)
  }
  return label
}

export interface SheetOptions {
  cellSize: number
  /** 每几格一条粗辅助线（ticket 06 默认 5）。 */
  guideInterval?: number
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
  /** 竖直粗辅助线 x 坐标（含 0 和 gridWidth）。 */
  vLines: number[]
  /** 水平粗辅助线 y 坐标（含 0 和 gridHeight）。 */
  hLines: number[]
  /** 列标号，长度 = width；不带标号时为 []。 */
  colLabels: string[]
  /** 行标号，长度 = height；不带标号时为 []。 */
  rowLabels: string[]
}

/** 计算图纸布局：辅助线每 guideInterval 格一条（含边框），可选行列标号。 */
export function buildSheetLayout(
  width: number,
  height: number,
  options: SheetOptions,
): SheetLayout {
  const { cellSize, guideInterval = 5, showLabels = false, labelGutter = 16 } = options
  const gridWidth = width * cellSize
  const gridHeight = height * cellSize
  const gridX = showLabels ? labelGutter : 0
  const gridY = showLabels ? labelGutter : 0

  const vLines: number[] = []
  for (let x = 0; x <= gridWidth; x += cellSize * guideInterval) vLines.push(x)
  if (vLines[vLines.length - 1] !== gridWidth) vLines.push(gridWidth)

  const hLines: number[] = []
  for (let y = 0; y <= gridHeight; y += cellSize * guideInterval) hLines.push(y)
  if (hLines[hLines.length - 1] !== gridHeight) hLines.push(gridHeight)

  const colLabels = showLabels ? Array.from({ length: width }, (_, i) => columnLabel(i)) : []
  const rowLabels = showLabels ? Array.from({ length: height }, (_, i) => String(i + 1)) : []

  return {
    gridX,
    gridY,
    gridWidth,
    gridHeight,
    sheetWidth: gridWidth + gridX,
    sheetHeight: gridHeight + gridY,
    vLines,
    hLines,
    colLabels,
    rowLabels,
  }
}
