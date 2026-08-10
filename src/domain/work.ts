import type { ColorId, Pattern } from './types'

/** 作品 (Work)：已保存的图案实例及其元信息，是作品库的管理单元。 */
export interface Work {
  id: string
  name: string
  pattern: Pattern
  activePalette: ColorId[]
  createdAt: number
  updatedAt: number
  /** 原图缩略图 data URL（可选）。 */
  thumbnail?: string
}

/** 作品列表项：元信息，不含图案数据（列表页用）。 */
export interface WorkSummary {
  id: string
  name: string
  updatedAt: number
  thumbnail?: string
}

/** 作品库存储契约：领域逻辑依赖此接口，内存版可测试、IndexedDB 版在浏览器跑。 */
export interface WorkStore {
  list(): Promise<WorkSummary[]>
  get(id: string): Promise<Work | null>
  save(work: Work): Promise<void>
  remove(id: string): Promise<void>
}

/** 内存版作品库：测试与无浏览器环境用。持有副本，外部修改不影响存储。 */
export class MemoryWorkStore implements WorkStore {
  private works = new Map<string, Work>()

  async list(): Promise<WorkSummary[]> {
    return [...this.works.values()]
      .map((w) => ({ id: w.id, name: w.name, updatedAt: w.updatedAt, thumbnail: w.thumbnail }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async get(id: string): Promise<Work | null> {
    const w = this.works.get(id)
    return w ? cloneWork(w) : null
  }

  async save(work: Work): Promise<void> {
    this.works.set(work.id, cloneWork(work))
  }

  async remove(id: string): Promise<void> {
    this.works.delete(id)
  }
}

function cloneWork(work: Work): Work {
  return {
    ...work,
    pattern: { ...work.pattern, cells: [...work.pattern.cells] },
    activePalette: [...work.activePalette],
  }
}
