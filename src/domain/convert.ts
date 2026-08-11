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
 * 重采样到 width×height 网格，同时按源图像素级背景 mask 判定背景，输出每格平均色与背景 mask。
 * bgMask 非空（1=背景像素）时：一格内背景像素数 >= 非背景像素数（含平局）则该格判为背景
 * （mask=true）；否则该格 RGB 只取非背景像素的平均，避免背景稀释交界格颜色
 * （旧实现先整体平均再判背景，会在主体边缘残留背景色）。
 * bgMask 为空时：mask 全 false，每格取覆盖区域全像素平均（box filter）。
 */
function resampleWithMask(
  image: SourceImage,
  width: number,
  height: number,
  bgMask: Uint8Array | null,
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
          if (bgMask && bgMask[y * sw + x] === 1) {
            bgCount++
          } else {
            r += p.r
            g += p.g
            b += p.b
            count++
          }
        }
      }
      if (bgMask && bgCount >= count) {
        // 背景像素占多数（含平局 / 全背景）-> 判背景；占位色用背景近似，该格后续置 null
        mask.push(true)
        sampled.push({ r: 0, g: 0, b: 0 })
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
function dominantEdgeColor(image: SourceImage): RGB {
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
 * 连通域背景检测（flood fill）：种子 = 边缘中与"边缘众数色"相近的像素（贴边主体与基准色
 * 差大，不会被吞），从种子沿"与相邻像素色差 <= 容差"的区域向内生长，标记与边缘连通的
 * 背景区域为 1。与纯颜色判定相比：主体内部被包围的同色区域不连通到边缘，不会被误抠；
 * 渐变背景可沿相邻色差逐级生长。返回源图像素级 mask，与 image.pixels 行优先一一对应。
 */
export function floodFillBackgroundMask(image: SourceImage, toleranceSq: number): Uint8Array {
  const { width: w, height: h, pixels } = image
  const base = dominantEdgeColor(image)
  const mask = new Uint8Array(pixels.length)
  // 队列上界：每像素最多被 4 个邻居各推一次 + 边缘种子
  const queue = new Uint32Array(pixels.length * 4 + 2 * (w + h))
  let head = 0
  let tail = 0
  const push = (i: number) => {
    queue[tail++] = i
  }
  // 种子：四条边中与基准色相近的像素
  for (let x = 0; x < w; x++) {
    if (colorDist(pixels[x], base) <= toleranceSq) push(x)
    if (colorDist(pixels[(h - 1) * w + x], base) <= toleranceSq) push((h - 1) * w + x)
  }
  for (let y = 1; y < h - 1; y++) {
    if (colorDist(pixels[y * w], base) <= toleranceSq) push(y * w)
    if (colorDist(pixels[y * w + w - 1], base) <= toleranceSq) push(y * w + w - 1)
  }
  while (head < tail) {
    const idx = queue[head++]
    if (mask[idx]) continue
    mask[idx] = 1
    const x = idx % w
    const y = (idx - x) / w
    const from = pixels[idx]
    const tryPush = (to: number) => {
      if (!mask[to] && colorDist(pixels[to], from) <= toleranceSq) push(to)
    }
    if (x > 0) tryPush(idx - 1)
    if (x < w - 1) tryPush(idx + 1)
    if (y > 0) tryPush(idx - w)
    if (y < h - 1) tryPush(idx + w)
  }
  return mask
}

/**
 * 图片转图案（核心转换管线）。
 * maxColors：先按"覆盖最多"选出用色子集（Active Palette），再在子集上量化；
 * removeBackground：默认开，用连通域背景检测（flood fill）把与边缘连通的背景区域变空格（null）。
 */
export function convertImageToPattern(
  image: SourceImage,
  params: ConvertParams,
  palette: ColorPalette,
): ConvertResult {
  const { width, height, maxColors, removeBackground = true, backgroundMask } = params
  // 背景 mask：外部提供（如 AI 抠图）优先，否则内部连通域检测（flood fill）；
  // 重采样时按 mask 判背景：交界格只取非背景像素平均，背景占多数则置空
  const bgMask = removeBackground
    ? backgroundMask ?? floodFillBackgroundMask(image, BG_TOLERANCE_SQ)
    : null
  const { sampled, mask } = resampleWithMask(image, width, height, bgMask)

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

/** 背景连通判定容差（RGB 欧氏距离平方）：相邻像素色差 <= 30 视为同一背景区域。 */
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
