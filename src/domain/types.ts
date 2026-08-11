// 领域类型，对齐 CONTEXT.md 中的 glossary。

/** 色号：色板中某一种颜色的唯一标识（如 MARD 色号）。 */
export type ColorId = string

/** RGB 颜色值，0-255。 */
export interface RGB {
  r: number
  g: number
  b: number
}

/** 色板中的一项：色号 + 名称 + RGB。 */
export interface ColorEntry {
  id: ColorId
  name: string
  rgb: RGB
}

/** 色板 (ColorPalette)：一组带色号的珠子颜色，量化和算色的基准。 */
export type ColorPalette = ColorEntry[]

/** 图案中的一格：一个色号，或空格（null）。 */
export type Cell = ColorId | null

/** 图案 (Pattern)：像素网格，每格对应一颗珠子的颜色。 */
export interface Pattern {
  width: number
  height: number
  cells: Cell[] // row-major，长度 = width * height
}

/** 图片转图案的参数。 */
export interface ConvertParams {
  width: number
  height: number
  maxColors?: number
  /** 自动去掉背景色（默认检测与边缘连通的背景区域，接近的格子变空格）。 */
  removeBackground?: boolean
  /**
   * 外部提供的背景 mask（源图像素级，1=背景，长度 = image.width * image.height）。
   * 提供时优先于内部背景检测（如 AI 抠图的结果）。
   */
  backgroundMask?: Uint8Array
}

/** 待转换的源图片：宽高 + 像素 RGB 数组（row-major）。 */
export interface SourceImage {
  width: number
  height: number
  pixels: RGB[] // 长度 = width * height
}

/** 图片转图案的结果。colorCounts 可由 computeColorCounts(pattern, activePalette) 派生，不随结果存储。 */
export interface ConvertResult {
  pattern: Pattern
  /** 用色集 (Active Palette)：实际用到的色号子集，按色板顺序。 */
  activePalette: ColorId[]
}
