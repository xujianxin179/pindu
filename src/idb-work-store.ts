// 作品库的 IndexedDB 适配层：实现 WorkStore 契约，浏览器环境使用（不在 node seam 内）。

import type { Work, WorkStore, WorkSummary } from './domain/work'
import { toSummary } from './domain/work'

const DB_NAME = 'pindu-works'
const DB_VERSION = 1
const STORE = 'works'

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 用 Promise 包装一次 object store 操作。 */
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IdbWorkStore implements WorkStore {
  private db: Promise<IDBDatabase> | null = null
  private readonly dbName: string

  constructor(dbName: string = DB_NAME) {
    this.dbName = dbName
  }

  private getDb() {
    if (!this.db) this.db = openDb(this.dbName)
    return this.db
  }

  async list(): Promise<WorkSummary[]> {
    const db = await this.getDb()
    const tx = db.transaction(STORE, 'readonly')
    const all = await request<Work[]>(tx.objectStore(STORE).getAll())
    return all.map(toSummary).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async get(id: string): Promise<Work | null> {
    const db = await this.getDb()
    const tx = db.transaction(STORE, 'readonly')
    return (await request<Work | undefined>(tx.objectStore(STORE).get(id))) ?? null
  }

  async save(work: Work): Promise<void> {
    const db = await this.getDb()
    const tx = db.transaction(STORE, 'readwrite')
    await request(tx.objectStore(STORE).put(work))
  }

  async remove(id: string): Promise<void> {
    const db = await this.getDb()
    const tx = db.transaction(STORE, 'readwrite')
    await request(tx.objectStore(STORE).delete(id))
  }
}
