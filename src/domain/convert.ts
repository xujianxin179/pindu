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
 * dithering：默认关，开启时在（受限的）子集上用 Floyd-Steinberg 误差扩散；
 * removeBackground：默认开，检测边缘主色为背景色，与之接近的格子变空格（null）。
 */
export function convertImageToPattern(
  image: SourceImage,
  params: ConvertParams,
  palette: ColorPalette,
): ConvertResult {
  const { width, height, maxColors, dithering = false, removeBackground = true } = params
  const sampled = resample(image, width, height)
  const bg = removeBackground ? dominantEdgeColor(image) : null

  // 先去背景：与背景接近的格子在选色/量化前就置空，不占用用色数预算
  let backgroundMask: boolean[] | null
  if (bg) {
    backgroundMask = sampled.map((rgb) => colorDist(rgb, bg) <= BG_TOLERANCE_SQ)
  } else {
    backgroundMask = null
  }

  let retained: Set<ColorId | null>
  let cells: (ColorId | null)[]
  if (maxColors !== undefined) {
    // 用色数选择只统计非背景格
    const initial = sampled
      .map((rgb, i) => (backgroundMask?.[i] ? null : nearestColorId(rgb, palette)))
      .filter((id): id is ColorId => id !== null)
    retained = selectRetained(initial, maxColors, palette)
    const subsetPalette = palette.filter((e) => retained.has(e.id))
    if (dithering) {
      cells = ditherAndQuantize(sampled, width, height, subsetPalette).map((id, i) =>
        backgroundMask?.[i] ? null : id,
      )
    } else {
      cells = sampled.map((rgb, i) =>
        backgroundMask?.[i] ? null : nearestColorId(rgb, subsetPalette),
      )
    }
  } else {
    if (dithering) {
      cells = ditherAndQuantize(sampled, width, height, palette).map((id, i) =>
        backgroundMask?.[i] ? null : id,
      )
    } else {
      cells = sampled.map((rgb, i) => (backgroundMask?.[i] ? null : nearestColorId(rgb, palette)))
    }
    retained = new Set(cells)
  }

  const pattern: Pattern = { width, height, cells }
  const activePalette: ColorId[] = palette
    .filter((entry) => retained.has(entry.id))
    .map((entry) => entry.id)

  return { pattern, activePalette }
}

/** 背景判定容差（RGB 欧氏距离平方）：与背景色差 <= 30 视作背景。 */
const BG_TOLERANCE_SQ = 30 * 30

function colorDist(a: RGB, b: RGB): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}
