import { useState, useRef, useEffect, useCallback, type ChangeEvent, type MouseEvent } from 'react'
import { convertImageToPattern, computeColorCounts } from './domain/convert'
import { MARD_PALETTE } from './domain/palette'
import {
  setCell,
  eraseCell,
  fillRect,
  colorAt,
  createHistory,
  applyEdit,
  undo,
  redo,
  extendActivePalette,
  type History,
} from './domain/edit'
import type { ColorId, ColorPalette, ConvertResult, Pattern, RGB, SourceImage } from './domain/types'

const CELL_SIZE = 12
/** 读入图片前先缩到长边不超过此值（px），限制内存峰值。 */
const MAX_IMAGE_SIDE = 256
const DEFAULT_LONG_SIDE = 40
const DEFAULT_MAX_COLORS = 30
/** 用色数上限不超过色板大小（MARD 221 色）。 */
const MAX_PALETTE_SIZE = MARD_PALETTE.length

type Tool = 'pen' | 'eraser' | 'fill' | 'picker'

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

function PatternCanvas({
  pattern,
  palette,
  tool,
  onCellPaint,
  onFillRect,
  onPick,
}: {
  pattern: Pattern
  palette: ColorPalette
  tool: Tool
  onCellPaint: (x: number, y: number) => void
  onFillRect: (x0: number, y0: number, x1: number, y1: number) => void
  onPick: (x: number, y: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)

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

  /** 事件坐标 -> 网格坐标；越界返回 null。 */
  const cellAt = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      const canvas = ref.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * pattern.width)
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * pattern.height)
      if (x < 0 || x >= pattern.width || y < 0 || y >= pattern.height) return null
      return { x, y }
    },
    [pattern.width, pattern.height],
  )

  function onMouseDown(e: MouseEvent<HTMLCanvasElement>) {
    const cell = cellAt(e)
    if (!cell) return
    if (tool === 'picker') {
      onPick(cell.x, cell.y)
      return
    }
    if (tool === 'fill') {
      onFillRect(cell.x, cell.y, cell.x, cell.y)
      return
    }
    onCellPaint(cell.x, cell.y)
    setDragStart(cell)
  }

  function onMouseEnter(e: MouseEvent<HTMLCanvasElement>) {
    if (!dragStart) return
    const cell = cellAt(e)
    if (!cell) return
    onCellPaint(cell.x, cell.y)
  }

  function onMouseUp() {
    if (!dragStart) return
    setDragStart(null)
  }

  return (
    <canvas
      ref={ref}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseUp={onMouseUp}
      style={{ touchAction: 'none' }}
    />
  )
}

/** 用色集色板：可选色号 + 当前选中高亮。 */
function ActivePaletteBar({
  activePalette,
  palette,
  selectedColor,
  onSelect,
}: {
  activePalette: ColorId[]
  palette: ColorPalette
  selectedColor: ColorId
  onSelect: (id: ColorId) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
      {activePalette.map((id) => {
        const entry = palette.find((e) => e.id === id)!
        const isSelected = id === selectedColor
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            title={id}
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: isSelected ? '2px solid #333' : '1px solid #ccc',
              background: `rgb(${entry.rgb.r},${entry.rgb.g},${entry.rgb.b})`,
              padding: 0,
              cursor: 'pointer',
            }}
          />
        )
      })}
    </div>
  )
}

/** 算色清单：按 Active Palette 顺序列出每个色号 + 颜色样块 + 数量。 */
function ColorCountsList({
  result,
  palette,
}: {
  result: ConvertResult
  palette: ColorPalette
}) {
  return (
    <div>
      {result.activePalette.map((id) => {
        const entry = palette.find((e) => e.id === id)!
        const count = result.colorCounts.get(id) ?? 0
        return (
          <span
            key={id}
            style={{ display: 'inline-flex', alignItems: 'center', margin: '2px 10px 2px 0' }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                border: '1px solid #ccc',
                background: `rgb(${entry.rgb.r},${entry.rgb.g},${entry.rgb.b})`,
                marginRight: 4,
                display: 'inline-block',
              }}
            />
            {id} × {count}
          </span>
        )
      })}
    </div>
  )
}

function App() {
  const [image, setImage] = useState<SourceImage | null>(null)
  const [longSide, setLongSide] = useState(DEFAULT_LONG_SIDE)
  const [maxColors, setMaxColors] = useState(DEFAULT_MAX_COLORS)
  const [dithering, setDithering] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [activePalette, setActivePalette] = useState<ColorId[]>([])
  const [tool, setTool] = useState<Tool>('pen')
  const [selectedColor, setSelectedColor] = useState<ColorId>(MARD_PALETTE[0].id)
  const fillStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!image) return
    const size = computeGridSize(image, longSide)
    const r = convertImageToPattern(image, { ...size, maxColors, dithering }, MARD_PALETTE)
    setResult(r)
    setHistory(createHistory(r.pattern))
    setActivePalette(r.activePalette)
    setSelectedColor(r.activePalette[0] ?? MARD_PALETTE[0].id)
  }, [image, longSide, maxColors, dithering])

  /** 把编辑后的新 Pattern 应用到历史栈，并重算派生数据。 */
  function commitEdit(next: Pattern, extended: ColorId[]) {
    if (!history) return
    const h = applyEdit(history, next)
    setHistory(h)
    setActivePalette(extended)
    const counts = computeColorCounts(h.present, extended)
    setResult({ pattern: h.present, activePalette: extended, colorCounts: counts })
  }

  function onCellPaint(x: number, y: number) {
    if (!history) return
    const next = setCell(history.present, x, y, selectedColor)
    const extended = extendActivePalette(activePalette, selectedColor, MARD_PALETTE)
    commitEdit(next, extended)
  }

  function onEraser(x: number, y: number) {
    if (!history) return
    commitEdit(eraseCell(history.present, x, y), activePalette)
  }

  function onFill(x0: number, y0: number, x1: number, y1: number) {
    if (!history) return
    commitEdit(fillRect(history.present, { x0, y0, x1, y1 }, selectedColor), activePalette)
  }

  function onPick(x: number, y: number) {
    if (!history) return
    const id = colorAt(history.present, x, y)
    if (id) setSelectedColor(id)
  }

  function onUndo() {
    if (!history) return
    const h = undo(history)
    if (h) {
      setHistory(h)
      setResult({ pattern: h.present, activePalette, colorCounts: computeColorCounts(h.present, activePalette) })
    }
  }

  function onRedo() {
    if (!history) return
    const h = redo(history)
    if (h) {
      setHistory(h)
      setResult({ pattern: h.present, activePalette, colorCounts: computeColorCounts(h.present, activePalette) })
    }
  }

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
              onChange={(e) => setLongSide(Math.max(1, Number(e.target.value)))}
            />
          </label>{' '}
          <label>
            用色数{' '}
            <input
              type="number"
              min={1}
              max={MAX_PALETTE_SIZE}
              value={maxColors}
              onChange={(e) => setMaxColors(Math.max(1, Number(e.target.value)))}
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
      {history && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setTool('pen')} disabled={tool === 'pen'}>
            画笔
          </button>{' '}
          <button onClick={() => setTool('eraser')} disabled={tool === 'eraser'}>
            橡皮
          </button>{' '}
          <button onClick={() => setTool('fill')} disabled={tool === 'fill'}>
            填充
          </button>{' '}
          <button onClick={() => setTool('picker')} disabled={tool === 'picker'}>
            吸管
          </button>{' '}
          <button onClick={onUndo} disabled={!undo(history)}>
            撤销
          </button>{' '}
          <button onClick={onRedo} disabled={!redo(history)}>
            重做
          </button>
        </div>
      )}
      {history && (
        <ActivePaletteBar
          activePalette={activePalette}
          palette={MARD_PALETTE}
          selectedColor={selectedColor}
          onSelect={setSelectedColor}
        />
      )}
      {history && (
        <div style={{ marginTop: 8 }}>
          <PatternCanvas
            pattern={history.present}
            palette={MARD_PALETTE}
            tool={tool}
            onCellPaint={tool === 'eraser' ? onEraser : onCellPaint}
            onFillRect={(x0, y0, x1, y1) => {
              if (tool !== 'fill') return
              const start = fillStart.current
              if (!start) {
                fillStart.current = { x: x0, y: y0 }
              } else {
                onFill(start.x, start.y, x1, y1)
                fillStart.current = null
              }
            }}
            onPick={onPick}
          />
          <p style={{ color: '#666' }}>
            {history.present.width} × {history.present.height} 格
          </p>
          {result && <ColorCountsList result={result} palette={MARD_PALETTE} />}
        </div>
      )}
    </div>
  )
}

export default App
