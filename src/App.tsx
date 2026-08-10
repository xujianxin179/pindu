import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { convertImageToPattern } from './domain/convert'
import { PLACEHOLDER_PALETTE } from './domain/palette'
import type { ColorPalette, Pattern, RGB, SourceImage } from './domain/types'

const CELL_SIZE = 12
/** 读入图片前先缩到长边不超过此值（px），限制内存峰值。 */
const MAX_IMAGE_SIDE = 256
const DEFAULT_LONG_SIDE = 40
const DEFAULT_MAX_COLORS = 8
/** 用色数上限不超过色板大小（ticket 03 换 MARD 221 色后自动变大）。 */
const MAX_PALETTE_SIZE = PLACEHOLDER_PALETTE.length

/**
 * 把用户选择的图片文件读成 SourceImage（用 Canvas 读像素 RGB）。
 * 先缩到长边 MAX_IMAGE_SIDE 再读，避免 12MP 大图在 iPad Safari 上内存峰值过高。
 */
async function fileToSourceImage(file: File): Promise<SourceImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 4) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  return { width, height, pixels }
}

/** 网格尺寸：长边 longSide 格，短边按图片宽高比算。 */
function computeGridSize(image: SourceImage, longSide: number) {
  if (image.width >= image.height) {
    const width = longSide
    const height = Math.max(1, Math.round((image.height / image.width) * longSide))
    return { width, height }
  }
  const height = longSide
  const width = Math.max(1, Math.round((image.width / image.height) * longSide))
  return { width, height }
}

function PatternCanvas({ pattern, palette }: { pattern: Pattern; palette: ColorPalette }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = pattern.width * CELL_SIZE
    canvas.height = pattern.height * CELL_SIZE
    const colorMap = new Map(palette.map((e) => [e.id, e.rgb]))
    for (let i = 0; i < pattern.cells.length; i++) {
      const x = (i % pattern.width) * CELL_SIZE
      const y = Math.floor(i / pattern.width) * CELL_SIZE
      const id = pattern.cells[i]
      const rgb = id ? colorMap.get(id) : null
      ctx.fillStyle = rgb ? `rgb(${rgb.r},${rgb.g},${rgb.b})` : '#ffffff'
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      ctx.strokeStyle = '#ddd'
      ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE)
    }
  }, [pattern, palette])
  return <canvas ref={ref} />
}

function App() {
  const [image, setImage] = useState<SourceImage | null>(null)
  const [longSide, setLongSide] = useState(DEFAULT_LONG_SIDE)
  const [maxColors, setMaxColors] = useState(DEFAULT_MAX_COLORS)
  const [dithering, setDithering] = useState(false)
  const [pattern, setPattern] = useState<Pattern | null>(null)

  useEffect(() => {
    if (!image) return
    const size = computeGridSize(image, longSide)
    const result = convertImageToPattern(
      image,
      { ...size, maxColors, dithering },
      PLACEHOLDER_PALETTE,
    )
    setPattern(result.pattern)
  }, [image, longSide, maxColors, dithering])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const img = await fileToSourceImage(file)
    setImage(img)
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>pinDu 拼豆</h1>
      <input type="file" accept="image/*" onChange={onFile} />
      {image && (
        <div style={{ marginTop: 12 }}>
          <label>
            长边珠数{' '}
            <input
              type="number"
              min={1}
              max={200}
              value={longSide}
              onChange={(e) => setLongSide(Number(e.target.value))}
            />
          </label>{' '}
          <label>
            用色数{' '}
            <input
              type="number"
              min={1}
              max={MAX_PALETTE_SIZE}
              value={maxColors}
              onChange={(e) => setMaxColors(Number(e.target.value))}
            />
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={dithering}
              onChange={(e) => setDithering(e.target.checked)}
            />{' '}
            抖动
          </label>
        </div>
      )}
      {pattern && (
        <div style={{ marginTop: 16 }}>
          <PatternCanvas pattern={pattern} palette={PLACEHOLDER_PALETTE} />
          <p style={{ color: '#666' }}>
            {pattern.width} × {pattern.height} 格
          </p>
        </div>
      )}
    </div>
  )
}

export default App
