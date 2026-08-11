import type {
  ColorId,
  ColorPalette,
  ConvertParams,
  ConvertResult,
  Pattern,
  RGB,
  SourceImage,
} from './types'

/**
 * 算色 (Color Counting)：统计图案里每种色号各需要多少颗珠子。
 * 结果覆盖 Active Palette 全量（含计数为 0 的色号，保证"用色集里每种色号"都有条目），
 * 并跳过 null 空格。与 colorCounts 的一致性由枚举测试锁定。
 */
export function computeColorCounts(
  pattern: Pattern,
  activePalette: ColorId[],
): Map<ColorId, number> {
  const counts = new Map<ColorId, number>()
  for (const id of activePalette) counts.set(id, 0)
  for (const id of pattern.cells) {
    if (id === null) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** 找到 palette 中与 target RGB 欧氏距离最近的色号（最近邻量化）。 */
function nearestColorId(target: RGB, palette: ColorPalette): ColorId {
  let bestId = palette[0].id
  let bestDist = Number.POSITIVE_INFINITY
  for (const entry of palette) {
    const dr = target.r - entry.rgb.r
    const dg = target.g - entry.rgb.g
    const db = target.b - entry.rgb.b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      bestId = entry.id
    }
  }
  return bestId
}

/**
 * 重采样到 width×height 网格，同时按像素级判定背景，输出每格平均色与背景 mask。
 * bg 非空时：源像素与 bg 距离 <= toleranceSq 视作背景；一格内背景像素数 >= 非背景像素数
 * （含平局）则该格判为背景（mask=true）；否则该格 RGB 只取非背景像素的平均，
 * 避免背景稀释交界格颜色（旧实现先整体平均再判背景，会在主体边缘残留背景色）。
 * bg 为空时：mask 全 false，每格取覆盖区域全像素平均（box filter）。
 */
function resampleWithMask(
  image: SourceImage,
  width: number,
  height: number,
  bg: RGB | null,
  toleranceSq: number,
): { sampled: RGB[]; mask: boolean[] } {
  const { width: sw, height: sh, pixels } = image
  const sampled: RGB[] = []
  const mask: boolean[] = []
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const xStart = Math.floor((gx * sw) / width)
      const xEnd = Math.max(xStart + 1, Math.floor(((gx + 1) * sw) / width))
      const yStart = Math.floor((gy * sh) / height)
      const yEnd = Math.max(yStart + 1, Math.floor(((gy + 1) * sh) / height))
      let bgCount = 0
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const p = pixels[y * sw + x]
          if (bg && colorDist(p, bg) <= toleranceSq) {
            bgCount++
          } else {
            r += p.r
            g += p.g
            b += p.b
            count++
          }
        }
      }
      if (bg && bgCount >= count) {
        // 背景像素占多数（含平局 / 全背景）-> 判背景；占位色用 bg，该格后续置 null
        mask.push(true)
        sampled.push(bg)
      } else {
        mask.push(false)
        sampled.push({
          r: Math.round(r / count),
          g: Math.round(g / count),
          b: Math.round(b / count),
        })
      }
    }
  }
  return { sampled, mask }
}

/**
 * 用色数限制：按覆盖数降序选出最多 maxColors 个色号（tie 按色板顺序）。
 * 这是"最能还原本图"的 popularity 近似：保留覆盖最多、被实际用到的色号。
 */
function selectRetained(
  cells: ColorId[],
  maxColors: number,
  palette: ColorPalette,
): Set<ColorId> {
  const counts = new Map<ColorId, number>()
  for (const id of cells) counts.set(id, (counts.get(id) ?? 0) + 1)
  const order = new Map(palette.map((e, i) => [e.id, i]))
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!,
  )
  return new Set(sorted.slice(0, maxColors).map(([id]) => id))
}

/**
 * 检测背景色：取图片边缘一圈像素中"第一个出现次数最多"的颜色（背景通常在边缘，主体居中）。
 * 极小图（<2 像素宽或高）退化为一整圈采样，仍返回一个色。
 */
export function dominantEdgeColor(image: SourceImage): RGB {
  const { width: w, height: h, pixels } = image
  const counts = new Map<string, { rgb: RGB; n: number }>()
  const key = (rgb: RGB) => `${rgb.r},${rgb.g},${rgb.b}`
  const visit = (i: number) => {
    const rgb = pixels[i]
    const k = key(rgb)
    const e = counts.get(k)
    if (e) e.n++
    else counts.set(k, { rgb, n: 1 })
  }
  // 顶/底整行 + 左/右中间列（不重复角点）
  for (let x = 0; x < w; x++) {
    visit(x)
    visit((h - 1) * w + x)
  }
  for (let y = 1; y < h - 1; y++) {
    visit(y * w)
    visit(y * w + w - 1)
  }
  let best: { rgb: RGB; n: number } | null = null
  for (const e of counts.values()) {
    if (!best || e.n > best.n) best = e
  }
  return best!.rgb
}

/**
 * 图片转图案（核心转换管线）。
 * maxColors：先按"覆盖最多"选出用色子集（Active Palette），再在子集上量化；
 * removeBackground：默认开，检测边缘主色为背景色，与之接近的格子变空格（null）。
 */
export function convertImageToPattern(
  image: SourceImage,
  params: ConvertParams,
  palette: ColorPalette,
): ConvertResult {
  const { width, height, maxColors, removeBackground = true } = params
  const bg = removeBackground ? dominantEdgeColor(image) : null
  // 重采样同时按像素级判背景：交界格只取非背景像素平均，背景占多数则置空
  const { sampled, mask } = resampleWithMask(image, width, height, bg, BG_TOLERANCE_SQ)

  let retained: Set<ColorId | null>
  let cells: (ColorId | null)[]
  if (maxColors !== undefined) {
    // 用色数选择只统计非背景格
    const initial = sampled
      .map((rgb, i) => (mask[i] ? null : nearestColorId(rgb, palette)))
      .filter((id): id is ColorId => id !== null)
    retained = selectRetained(initial, maxColors, palette)
    const subsetPalette = palette.filter((e) => retained.has(e.id))
    cells = sampled.map((rgb, i) => (mask[i] ? null : nearestColorId(rgb, subsetPalette)))
  } else {
    cells = sampled.map((rgb, i) => (mask[i] ? null : nearestColorId(rgb, palette)))
    retained = new Set(cells)
  }

  const pattern: Pattern = { width, height, cells }
  const activePalette: ColorId[] = palette
    .filter((entry) => retained.has(entry.id))
    .map((entry) => entry.id)

  return { pattern, activePalette }
}

/** 背景判定容差（RGB 欧氏距离平方）：源像素与背景色差 <= 30 视作背景像素。 */
const BG_TOLERANCE_SQ = 30 * 30

function colorDist(a: RGB, b: RGB): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

/**
 * 手动裁剪：从 image 截取 rect（源图像素坐标）矩形区域生成新图。
 * 越界部分 clamp 到图片范围内；空区域返回 0 尺寸图。
 * 用于"导入图片后先手动裁剪，再去背景/转换"的流程。
 */
export function cropImageToSourceImage(
  image: SourceImage,
  rect: { x: number; y: number; width: number; height: number },
): SourceImage {
  const x = Math.max(0, Math.min(Math.floor(rect.x), image.width - 1))
  const y = Math.max(0, Math.min(Math.floor(rect.y), image.height - 1))
  const width = Math.max(0, Math.min(Math.round(rect.width), image.width - x))
  const height = Math.max(0, Math.min(Math.round(rect.height), image.height - y))
  const pixels: RGB[] = []
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      pixels.push(image.pixels[row * image.width + col])
    }
  }
  return { width, height, pixels }
}
