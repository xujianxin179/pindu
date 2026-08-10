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

/** 抖动 + 量化：Floyd-Steinberg 误差扩散。 */
function ditherAndQuantize(sampled: RGB[], width: number, height: number, palette: ColorPalette): ColorId[] {
  const total = width * height
  const err = new Array<RGB>(total)
  for (let i = 0; i < total; i++) err[i] = { r: 0, g: 0, b: 0 }
  const cells: ColorId[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const base = sampled[idx]
      const candidate = {
        r: base.r + Math.round(err[idx].r),
        g: base.g + Math.round(err[idx].g),
        b: base.b + Math.round(err[idx].b),
      }
      const id = nearestColorId(candidate, palette)
      cells.push(id)
      const chosen = palette.find((e) => e.id === id)!.rgb
      const diff = {
        r: candidate.r - chosen.r,
        g: candidate.g - chosen.g,
        b: candidate.b - chosen.b,
      }
      const right = idx + 1
      const down = idx + width
      const downLeft = idx + width - 1
      const downRight = idx + width + 1
      const add = (target: number, f: number) => {
        if (target >= 0 && target < total) {
          err[target].r += (diff.r * f) / 16
          err[target].g += (diff.g * f) / 16
          err[target].b += (diff.b * f) / 16
        }
      }
      if (x + 1 < width) add(right, 7)
      if (y + 1 < height) {
        if (x > 0) add(downLeft, 3)
        add(down, 5)
        if (x + 1 < width) add(downRight, 1)
      }
    }
  }
  return cells
}

/**
 * 图片转图案（核心转换管线）。
 * maxColors：先按"覆盖最多"选出用色子集（Active Palette），再在子集上量化；
 * dithering：默认关，开启时在（受限的）子集上用 Floyd-Steinberg 误差扩散。
 */
export function convertImageToPattern(
  image: SourceImage,
  params: ConvertParams,
  palette: ColorPalette,
): ConvertResult {
  const { width, height, maxColors, dithering = false } = params
  const sampled = resample(image, width, height)

  let retained: Set<ColorId>
  let cells: ColorId[]
  if (maxColors !== undefined) {
    const initial = sampled.map((rgb) => nearestColorId(rgb, palette))
    retained = selectRetained(initial, maxColors, palette)
    const subsetPalette = palette.filter((e) => retained.has(e.id))
    cells = dithering
      ? ditherAndQuantize(sampled, width, height, subsetPalette)
      : sampled.map((rgb) => nearestColorId(rgb, subsetPalette))
  } else {
    cells = dithering
      ? ditherAndQuantize(sampled, width, height, palette)
      : sampled.map((rgb) => nearestColorId(rgb, palette))
    retained = new Set(cells)
  }

  const pattern: Pattern = { width, height, cells }
  const activePalette: ColorId[] = palette
    .filter((entry) => retained.has(entry.id))
    .map((entry) => entry.id)

  const colorCounts = new Map<ColorId, number>()
  for (const id of cells) {
    colorCounts.set(id, (colorCounts.get(id) ?? 0) + 1)
  }

  return { pattern, activePalette, colorCounts }
}
