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
import { exportSheetPng, exportSheetPdf, shareSheet } from './sheet-export'
import { drawGrid, CELL_SIZE } from './render-grid'
import { IdbWorkStore } from './idb-work-store'
import type { Work, WorkStore, WorkSummary } from './domain/work'
import './index.css'
import './App.css'

const MAX_IMAGE_SIDE = 256
const DEFAULT_LONG_SIDE = 40
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

/** 色号 -> 珠色 CSS。 */
function beadStyle(id: ColorId, palette: ColorPalette): React.CSSProperties {
  const entry = palette.find((e) => e.id === id)
  return {
    background: entry ? `rgb(${entry.rgb.r},${entry.rgb.g},${entry.rgb.b})` : 'var(--panel)',
  }
}

function PatternCanvas({
  pattern,
  palette,
  tool,
  highlightId,
  onPaint,
  onErase,
  onFill,
  onPick,
}: {
  pattern: Pattern
  palette: ColorPalette
  tool: Tool
  highlightId: ColorId | null
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
    drawGrid(ctx, pattern, palette, 0, 0, highlightId)
  }, [pattern, palette, highlightId])

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
    <div className="palette-bar">
      <div className="palette-row">
        {activePalette.map((id) => (
          <button
            key={id}
            className={`bead${id === selectedColor ? ' selected' : ''}`}
            onClick={() => onSelect(id)}
            title={id}
            style={beadStyle(id, palette)}
          />
        ))}
        <button className="bead-more" onClick={() => setShowAll((v) => !v)} title="从全色板选色">
          ＋
        </button>
      </div>
      {showAll && (
        <div className="palette-all">
          {unselected.map((entry) => (
            <button
              key={entry.id}
              className="bead"
              onClick={() => {
                onExtend(entry.id)
                setShowAll(false)
              }}
              title={entry.id}
              style={beadStyle(entry.id, palette)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 算色清单：按 Active Palette 顺序列出每个色号 + 颜色样块 + 数量。点击 chip 高亮该色号在图案中的位置。 */
function ColorCountsList({
  history,
  palette,
  highlightId,
  onHighlight,
}: {
  history: History
  palette: ColorPalette
  highlightId: ColorId | null
  onHighlight: (id: ColorId | null) => void
}) {
  const counts = useMemo(
    () => computeColorCounts(history.present.pattern, history.present.activePalette),
    [history],
  )
  return (
    <div className="counts">
      <span className="counts-label">算色</span>
      {history.present.activePalette.map((id) => (
        <button
          key={id}
          type="button"
          className={`count-chip${highlightId === id ? ' highlight' : ''}`}
          onClick={() => onHighlight(highlightId === id ? null : id)}
          title={`高亮 ${id}`}
        >
          <span className="bead" style={beadStyle(id, palette)} />
          <span className="count-id">{id}</span>
          <span className="count-num">× {counts.get(id) ?? 0}</span>
        </button>
      ))}
    </div>
  )
}

/** 作品库面板：列出作品（缩略图+名称+时间），支持打开/重命名/删除。 */
function WorkspacePanel({
  works,
  onOpen,
  onRename,
  onDelete,
}: {
  works: WorkSummary[]
  onOpen: (id: string) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="workspace">
      <h3>作品库</h3>
      {works.length === 0 ? (
        <p className="empty">还没有作品。导入图片转好图案后，点"保存作品"存到这里。</p>
      ) : (
        works.map((w) => (
          <div key={w.id} className="work-row">
            {w.sourceThumbnail ? (
              <img src={w.sourceThumbnail} alt="" className="work-thumb" />
            ) : (
              <span className="work-thumb" />
            )}
            <button className="work-open" onClick={() => onOpen(w.id)}>
              {w.name}
            </button>
            <button className="btn" onClick={() => onRename(w.id)}>
              重命名
            </button>
            <button className="btn" onClick={() => onDelete(w.id)}>
              删除
            </button>
          </div>
        ))
      )}
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
  const [highlightId, setHighlightId] = useState<ColorId | null>(null)
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null)
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)
  const [saveName, setSaveName] = useState('')
  const storeRef = useRef<WorkStore | null>(null)
  if (!storeRef.current) storeRef.current = new IdbWorkStore()

  useEffect(() => {
    storeRef.current!.list().then(setWorks)
  }, [])

  async function refreshWorks() {
    setWorks(await storeRef.current!.list())
  }

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
    // 高亮色号若被编辑清除（图案中不再出现），自动取消高亮，避免"高亮对象不可见"
    if (highlightId !== null && !nextPattern.cells.includes(highlightId)) {
      setHighlightId(null)
    }
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

  /** 保存当前图案为作品：续编（editingWorkId）时更新原作品，否则新建。 */
  async function onSaveWork() {
    if (!history || !saveName.trim()) return
    const now = Date.now()
    const existing = editingWorkId ? await storeRef.current!.get(editingWorkId) : null
    const work: Work = {
      id: existing?.id ?? crypto.randomUUID(),
      name: saveName.trim(),
      pattern: history.present.pattern,
      activePalette: history.present.activePalette,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      sourceThumbnail: existing?.sourceThumbnail,
    }
    await storeRef.current!.save(work)
    setEditingWorkId(work.id)
    setSaveName('')
    await refreshWorks()
  }

  /** 打开作品：恢复 pattern 与用色集，记录续编目标 id。 */
  async function onOpenWork(id: string) {
    const work = await storeRef.current!.get(id)
    if (!work) return
    setHistory(
      createHistory({ pattern: work.pattern, activePalette: work.activePalette }),
    )
    setSelectedColor(work.activePalette[0] ?? MARD_PALETTE[0].id)
    setEditingWorkId(work.id)
    setSaveName(work.name)
    setHighlightId(null)
    setImage(null)
  }

  async function onRenameWork() {
    if (!rename || !rename.name.trim()) return
    const work = await storeRef.current!.get(rename.id)
    if (!work) return
    await storeRef.current!.save({ ...work, name: rename.name.trim(), updatedAt: Date.now() })
    setRename(null)
    await refreshWorks()
  }

  async function onDeleteWork(id: string) {
    await storeRef.current!.remove(id)
    await refreshWorks()
  }

  const present = history?.present.pattern ?? null

  return (
    <div>
      <header className="app-header">
        <span className="logo">
          <span className="bead" style={beadStyle('F5', MARD_PALETTE)} />
          <span className="bead" style={beadStyle('B8', MARD_PALETTE)} />
          <span className="bead" style={beadStyle('D3', MARD_PALETTE)} />
          <span className="bead" style={beadStyle('A5', MARD_PALETTE)} />
        </span>
        <span className="brand">pinDu</span>
        <span className="brand-sub">MARD 221</span>
        <span className="header-spacer" />
        {/* 用 opacity+absolute 而非 hidden：个别旧版 iPad Safari 对 display:none 的
            file input 触发 label 可能不弹选择器 */}
        <input
          type="file"
          accept="image/*"
          onChange={onFile}
          id="file-input"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
        />
        <label htmlFor="file-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
          导入图片
        </label>
      </header>

      <div className="params">
        <label className="param-field">
          长边珠数
          <input
            type="number"
            min={1}
            max={200}
            value={longSide}
            onChange={(e) => setLongSide(Math.max(1, Number(e.target.value)))}
          />
        </label>
        <label className="param-field">
          用色数
          <input
            type="number"
            min={1}
            max={MAX_PALETTE_SIZE}
            value={maxColors}
            onChange={(e) => setMaxColors(Math.max(1, Number(e.target.value)))}
          />
        </label>
        <label className="param-field">
          <input
            type="checkbox"
            checked={dithering}
            onChange={(e) => setDithering(e.target.checked)}
          />
          抖动
        </label>
        <label className="param-field">
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          图纸标号
        </label>
      </div>

      {history && (
        <div className="toolbar">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`tool-btn${tool === t.id ? ' active' : ''}`}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button className="tool-btn" onClick={onUndo} disabled={!history || undo(history) === null}>
            撤销
          </button>
          <button className="tool-btn" onClick={onRedo} disabled={!history || redo(history) === null}>
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
        <>
          <div className="canvas-wrap">
            <PatternCanvas
              pattern={present}
              palette={MARD_PALETTE}
              tool={tool}
              highlightId={highlightId}
              onPaint={(x, y) => commitEdit((p) => setCell(p, x, y, selectedColor))}
              onErase={(x, y) => commitEdit((p) => eraseCell(p, x, y))}
              onFill={(x0, y0, x1, y1) => commitEdit((p) => fillRect(p, { x0, y0, x1, y1 }, selectedColor))}
              onPick={(x, y) => {
                const id = colorAt(present, x, y)
                if (id) setSelectedColor(id)
              }}
            />
            <p className="grid-meta">
              {present.width} × {present.height} 格
            </p>
          </div>

          <ColorCountsList
            history={history}
            palette={MARD_PALETTE}
            highlightId={highlightId}
            onHighlight={setHighlightId}
          />

          <div className="sheet-actions">
            <button
              className="btn"
              onClick={() =>
                exportSheetPng(history, MARD_PALETTE, 'pindu-sheet.png', showLabels, highlightId)
              }
            >
              导出图纸 PNG
            </button>
            <button
              className="btn"
              onClick={() =>
                exportSheetPdf(history, MARD_PALETTE, 'pindu-sheet.pdf', showLabels, highlightId)
              }
            >
              导出图纸 PDF
            </button>
            <select
              className="btn"
              defaultValue="png"
              style={{ background: 'var(--panel)', color: 'var(--ink)' }}
              onChange={(e) =>
                shareSheet(
                  history,
                  MARD_PALETTE,
                  `pindu-sheet.${e.target.value}`,
                  showLabels,
                  e.target.value as 'png' | 'pdf',
                  highlightId,
                )
              }
            >
              <option value="png">分享图纸 PNG</option>
              <option value="pdf">分享图纸 PDF</option>
            </select>
          </div>

          <div className="save-row">
            <input
              placeholder="作品名称，例如：星空小猫"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <button className="btn btn-primary" onClick={onSaveWork}>
              保存作品
            </button>
          </div>
        </>
      )}

      {!history && (
        <div className="canvas-wrap">
          <p className="empty">从右上角导入一张图片，开始拼豆。</p>
        </div>
      )}

      <WorkspacePanel
        works={works}
        onOpen={onOpenWork}
        onRename={(id) => {
          const w = works.find((x) => x.id === id)
          setRename({ id, name: w?.name ?? '' })
        }}
        onDelete={onDeleteWork}
      />

      {rename && (
        <div className="rename-row">
          <input
            value={rename.name}
            onChange={(e) => setRename({ ...rename, name: e.target.value })}
          />
          <button className="btn btn-primary" onClick={onRenameWork}>
            确认
          </button>
          <button className="btn" onClick={() => setRename(null)}>
            取消
          </button>
        </div>
      )}
    </div>
  )
}

export default App
