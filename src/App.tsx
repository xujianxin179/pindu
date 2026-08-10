import { useState, useRef, useEffect, useMemo, type ChangeEvent } from 'react'
import { convertImageToPattern, computeColorCounts } from './domain/convert'
import { MARD_PALETTE } from './domain/palette'
import type { ColorId, ColorPalette, ConvertResult, Pattern, RGB, SourceImage } from './domain/types'
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

/** 图案预览（纯展示，无编辑交互）。 */
function PatternCanvas({
  pattern,
  palette,
  highlightId,
}: {
  pattern: Pattern
  palette: ColorPalette
  highlightId: ColorId | null
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = pattern.width * CELL_SIZE
    canvas.height = pattern.height * CELL_SIZE
    drawGrid(ctx, pattern, palette, 0, 0, highlightId, '#f5f5f5')
  }, [pattern, palette, highlightId])

  return <canvas ref={ref} />
}

/** 算色清单：按 Active Palette 顺序列出每个色号 + 颜色样块 + 数量。点击 chip 高亮该色号在图案中的位置。 */
function ColorCountsList({
  result,
  palette,
  highlightId,
  onHighlight,
}: {
  result: ConvertResult
  palette: ColorPalette
  highlightId: ColorId | null
  onHighlight: (id: ColorId | null) => void
}) {
  const counts = useMemo(
    () => computeColorCounts(result.pattern, result.activePalette),
    [result],
  )
  return (
    <div className="counts">
      <span className="counts-label">算色</span>
      {result.activePalette.map((id) => (
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
  const [longSide, setLongSide] = useState<number | ''>(DEFAULT_LONG_SIDE)
  const [maxColors, setMaxColors] = useState<number | ''>(DEFAULT_MAX_COLORS)
  const [removeBackground, setRemoveBackground] = useState(true)
  const [result, setResult] = useState<ConvertResult | null>(null)
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
    if (!image || longSide === '' || maxColors === '') return
    const size = computeGridSize(image, longSide)
    const r = convertImageToPattern(
      image,
      { ...size, maxColors, removeBackground },
      MARD_PALETTE,
    )
    setResult(r)
  }, [image, longSide, maxColors, removeBackground])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const img = await fileToSourceImage(file)
    setImage(img)
  }

  /** 保存当前图案为作品：续编（editingWorkId）时更新原作品，否则新建。 */
  async function onSaveWork() {
    if (!result || !saveName.trim()) return
    const now = Date.now()
    const existing = editingWorkId ? await storeRef.current!.get(editingWorkId) : null
    const work: Work = {
      id: existing?.id ?? crypto.randomUUID(),
      name: saveName.trim(),
      pattern: result.pattern,
      activePalette: result.activePalette,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      sourceThumbnail: existing?.sourceThumbnail,
    }
    await storeRef.current!.save(work)
    setEditingWorkId(work.id)
    setSaveName('')
    await refreshWorks()
  }

  /** 打开作品：恢复图案与用色集。 */
  async function onOpenWork(id: string) {
    const work = await storeRef.current!.get(id)
    if (!work) return
    setResult({ pattern: work.pattern, activePalette: work.activePalette })
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
            placeholder="40"
            onChange={(e) => setLongSide(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
        <label className="param-field">
          用色数
          <input
            type="number"
            min={1}
            max={MAX_PALETTE_SIZE}
            value={maxColors}
            placeholder="30"
            onChange={(e) => setMaxColors(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
        <label className="param-field">
          <input
            type="checkbox"
            checked={removeBackground}
            onChange={(e) => setRemoveBackground(e.target.checked)}
          />
          去背景
        </label>
      </div>

      {result && (
        <>
          <div className="canvas-wrap">
            <PatternCanvas
              pattern={result.pattern}
              palette={MARD_PALETTE}
              highlightId={highlightId}
            />
            <p className="grid-meta">
              {result.pattern.width} × {result.pattern.height} 格
            </p>
          </div>

          <ColorCountsList
            result={result}
            palette={MARD_PALETTE}
            highlightId={highlightId}
            onHighlight={setHighlightId}
          />

          <div className="sheet-actions">
            <button
              className="btn"
              onClick={() => exportSheetPng(result, MARD_PALETTE, 'pindu-sheet.png', highlightId)}
            >
              导出图纸 PNG
            </button>
            <button
              className="btn"
              onClick={() => exportSheetPdf(result, MARD_PALETTE, 'pindu-sheet.pdf', highlightId)}
            >
              导出图纸 PDF
            </button>
            <select
              className="btn"
              defaultValue="png"
              style={{ background: 'var(--panel)', color: 'var(--ink)' }}
              onChange={(e) =>
                shareSheet(
                  result,
                  MARD_PALETTE,
                  `pindu-sheet.${e.target.value}`,
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

      {!result && (
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
