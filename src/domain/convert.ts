import type {
  ColorId,
  ColorPalette,
  ConvertParams,
  ConvertResult,
  Pattern,
  RGB,
  SourceImage,
} from './types'

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

/** 把源图片重采样到 width×height 网格，每格取覆盖区域的平均 RGB（box filter）。 */
function resample(image: SourceImage, width: number, height: number): RGB[] {
  const { width: sw, height: sh, pixels } = image
  const out: RGB[] = []
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const xStart = Math.floor((gx * sw) / width)
      const xEnd = Math.max(xStart + 1, Math.floor(((gx + 1) * sw) / width))
      const yStart = Math.floor((gy * sh) / height)
      const yEnd = Math.max(yStart + 1, Math.floor(((gy + 1) * sh) / height))
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const p = pixels[y * sw + x]
          r += p.r
          g += p.g
          b += p.b
          count++
        }
      }
      out.push({
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
      })
    }
  }
  return out
}

/**
 * 图片转图案（核心转换管线）。
 * ticket 01：固定参数，最近邻量化，不做用色数限制和抖动。
 * maxColors / dithering 留给 ticket 02 实现。
 */
export function convertImageToPattern(
  image: SourceImage,
  params: ConvertParams,
  palette: ColorPalette,
): ConvertResult {
  const { width, height } = params
  const sampled = resample(image, width, height)
  const cells = sampled.map((rgb) => nearestColorId(rgb, palette))

  const pattern: Pattern = { width, height, cells }

  const usedSet = new Set(cells)
  const activePalette: ColorId[] = palette
    .filter((entry) => usedSet.has(entry.id))
    .map((entry) => entry.id)

  const colorCounts = new Map<ColorId, number>()
  for (const id of cells) {
    colorCounts.set(id, (colorCounts.get(id) ?? 0) + 1)
  }

  return { pattern, activePalette, colorCounts }
}
