import { useState, useRef, useEffect, useMemo, type ChangeEvent, type PointerEvent } from 'react'
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
import type { ColorId, ColorPalette, Pattern, RGB, SourceImage } from './domain/types'
import { exportSheetPng, exportSheetPdf, shareSheetPng } from './sheet-export'
import { drawGrid, CELL_SIZE } from './render-grid'

const DEFAULT_LONG_SIDE = 40
/** 读入图片前先缩到长边不超过此值（px），限制内存峰值。 */
const MAX_IMAGE_SIDE = 256
const DEFAULT_MAX_COLORS = 30
/** 用色数上限不超过色板大小（MARD 221 色）。 */
const MAX_PALETTE_SIZE = MARD_PALETTE.length

type Tool = 'pen' | 'eraser' | 'fill' | 'picker'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'pen', label: '画笔' },
  { id: 'eraser', label: '橡皮' },
  { id: 'fill', label: '填充' },
  { id: 'picker', label: '吸管' },
]

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
  onPaint,
  onErase,
  onFill,
  onPick,
}: {
  pattern: Pattern
  palette: ColorPalette
  tool: Tool
  onPaint: (x: number, y: number) => void
  onErase: (x: number, y: number) => void
  onFill: (x0: number, y0: number, x1: number, y1: number) => void
  onPick: (x: number, y: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  // 拖拽状态：画笔/橡皮逐格涂色的起点；填充工具记录矩形锚点
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const lastCell = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = pattern.width * CELL_SIZE
    canvas.height = pattern.height * CELL_SIZE
    drawGrid(ctx, pattern, palette, 0, 0)
  }, [pattern, palette])

  /** 事件坐标 -> 网格坐标；越界返回 null。 */
  const cellAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * pattern.width)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * pattern.height)
    if (x < 0 || x >= pattern.width || y < 0 || y >= pattern.height) return null
    return { x, y }
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const cell = cellAt(e)
    if (!cell) return
    if (tool === 'picker') {
      onPick(cell.x, cell.y)
      return
    }
    dragStart.current = cell
    lastCell.current = cell
    if (tool === 'fill') return
    if (tool === 'eraser') onErase(cell.x, cell.y)
    else onPaint(cell.x, cell.y)
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!dragStart.current) return
    const cell = cellAt(e)
    if (!cell) return
    if (tool === 'fill') {
      lastCell.current = cell
      return
    }
    if (lastCell.current && lastCell.current.x === cell.x && lastCell.current.y === cell.y) return
    lastCell.current = cell
    if (tool === 'eraser') onErase(cell.x, cell.y)
    else onPaint(cell.x, cell.y)
  }

  function onPointerUp() {
    const start = dragStart.current
    const end = lastCell.current
    dragStart.current = null
    lastCell.current = null
    if (tool === 'fill' && start && end) {
      onFill(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.max(start.x, end.x), Math.max(start.y, end.y))
    }
  }

  function onPointerLeave() {
    dragStart.current = null
    lastCell.current = null
  }

  return (
    <canvas
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      style={{ touchAction: 'none' }}
    />
  )
}

/** 用色集色板条：可选色号 + 当前选中高亮 + "＋"展开全色板选外部色号。 */
function ActivePaletteBar({
  activePalette,
  palette,
  selectedColor,
  onSelect,
  onExtend,
}: {
  activePalette: ColorId[]
  palette: ColorPalette
  selectedColor: ColorId
  onSelect: (id: ColorId) => void
  onExtend: (id: ColorId) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const unselected = palette.filter((e) => !activePalette.includes(e.id))
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
        <button
          onClick={() => setShowAll((v) => !v)}
          title="从全色板选色"
          style={{ width: 20, height: 20, borderRadius: 4, border: '1px dashed #999', cursor: 'pointer' }}
        >
          ＋
        </button>
      </div>
      {showAll && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, borderTop: '1px solid #eee', paddingTop: 6 }}>
          {unselected.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                onExtend(entry.id)
                setShowAll(false)
              }}
              title={entry.id}
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                border: '1px solid #ccc',
                background: `rgb(${entry.rgb.r},${entry.rgb.g},${entry.rgb.b})`,
                padding: 0,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 算色清单：按 Active Palette 顺序列出每个色号 + 颜色样块 + 数量。 */
function ColorCountsList({ history, palette }: { history: History; palette: ColorPalette }) {
  const counts = useMemo(
    () => computeColorCounts(history.present.pattern, history.present.activePalette),
    [history],
  )
  return (
    <div>
      {history.present.activePalette.map((id) => {
        const entry = palette.find((e) => e.id === id)!
        const count = counts.get(id) ?? 0
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
  const [history, setHistory] = useState<History | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [selectedColor, setSelectedColor] = useState<ColorId>(MARD_PALETTE[0].id)
  const [showLabels, setShowLabels] = useState(true)

  useEffect(() => {
    if (!image) return
    const size = computeGridSize(image, longSide)
    const r = convertImageToPattern(image, { ...size, maxColors, dithering }, MARD_PALETTE)
    setHistory(createHistory({ pattern: r.pattern, activePalette: r.activePalette }))
    setSelectedColor(r.activePalette[0] ?? MARD_PALETTE[0].id)
  }, [image, longSide, maxColors, dithering])

  /** 应用一个编辑，把新快照推进历史栈。 */
  function commitEdit(edit: (pattern: Pattern) => Pattern) {
    if (!history) return
    const present = history.present
    const nextPattern = edit(present.pattern)
    const nextPalette = extendActivePalette(present.activePalette, selectedColor, MARD_PALETTE)
    setHistory(applyEdit(history, { pattern: nextPattern, activePalette: nextPalette }))
  }

  function onUndo() {
    if (history) setHistory((h) => undo(h!) ?? h)
  }

  function onRedo() {
    if (history) setHistory((h) => redo(h!) ?? h)
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const img = await fileToSourceImage(file)
    setImage(img)
  }

  const present = history?.present.pattern ?? null

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
          {TOOLS.map((t) => (
            <button key={t.id} onClick={() => setTool(t.id)} disabled={tool === t.id}>
              {t.label}
            </button>
          ))}{' '}
          <button onClick={onUndo} disabled={!history || undo(history) === null}>
            撤销
          </button>{' '}
          <button onClick={onRedo} disabled={!history || redo(history) === null}>
            重做
          </button>
        </div>
      )}
      {history && (
        <ActivePaletteBar
          activePalette={history.present.activePalette}
          palette={MARD_PALETTE}
          selectedColor={selectedColor}
          onSelect={setSelectedColor}
          onExtend={(id) => {
            setHistory(
              applyEdit(history, {
                pattern: history.present.pattern,
                activePalette: extendActivePalette(history.present.activePalette, id, MARD_PALETTE),
              }),
            )
            setSelectedColor(id)
          }}
        />
      )}
      {history && present && (
        <div style={{ marginTop: 8 }}>
          <PatternCanvas
            pattern={present}
            palette={MARD_PALETTE}
            tool={tool}
            onPaint={(x, y) => commitEdit((p) => setCell(p, x, y, selectedColor))}
            onErase={(x, y) => commitEdit((p) => eraseCell(p, x, y))}
            onFill={(x0, y0, x1, y1) => commitEdit((p) => fillRect(p, { x0, y0, x1, y1 }, selectedColor))}
            onPick={(x, y) => {
              const id = colorAt(present, x, y)
              if (id) setSelectedColor(id)
            }}
          />
          <p style={{ color: '#666' }}>
            {present.width} × {present.height} 格
          </p>
          <div style={{ marginTop: 4 }}>
            <label>
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />{' '}
              显示标号
            </label>{' '}
            <button
              onClick={() => exportSheetPng(history, MARD_PALETTE, 'pindu-sheet.png', showLabels)}
            >
              导出 PNG
            </button>{' '}
            <button
              onClick={() => exportSheetPdf(history, MARD_PALETTE, 'pindu-sheet.pdf', showLabels)}
            >
              导出 PDF
            </button>{' '}
            <button
              onClick={() => shareSheetPng(history, MARD_PALETTE, 'pindu-sheet.png', showLabels)}
            >
              分享
            </button>
          </div>
          <ColorCountsList history={history} palette={MARD_PALETTE} />
        </div>
      )}
    </div>
  )
}

export default App
