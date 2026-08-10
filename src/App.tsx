import { useState, useRef, useEffect } from 'react'
import { convertImageToPattern } from './domain/convert'
import { PLACEHOLDER_PALETTE } from './domain/palette'
import type { ColorPalette, Pattern, RGB, SourceImage } from './domain/types'

const GRID_LONG_SIDE = 40
const CELL_SIZE = 12

/** 把用户选择的图片文件读成 SourceImage（用 Canvas 读像素 RGB）。 */
async function fileToSourceImage(file: File): Promise<SourceImage> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 4) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  return { width: bitmap.width, height: bitmap.height, pixels }
}

/** 固定参数：长边 GRID_LONG_SIDE，短边按图片宽高比算。 */
function computeGridSize(image: SourceImage) {
  if (image.width >= image.height) {
    const width = GRID_LONG_SIDE
    const height = Math.max(1, Math.round((image.height / image.width) * GRID_LONG_SIDE))
    return { width, height }
  }
  const height = GRID_LONG_SIDE
  const width = Math.max(1, Math.round((image.width / image.height) * GRID_LONG_SIDE))
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
  const [pattern, setPattern] = useState<Pattern | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const image = await fileToSourceImage(file)
    const size = computeGridSize(image)
    const result = convertImageToPattern(image, size, PLACEHOLDER_PALETTE)
    setPattern(result.pattern)
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>pinDu 拼豆</h1>
      <input type="file" accept="image/*" onChange={onFile} />
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
