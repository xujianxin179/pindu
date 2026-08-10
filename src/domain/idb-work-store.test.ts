import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IdbWorkStore } from '../idb-work-store'
import type { Work } from './work'

function makeWork(id: string, name: string, updatedAt: number): Work {
  return {
    id,
    name,
    pattern: { width: 1, height: 1, cells: [id] },
    activePalette: [id],
    createdAt: updatedAt,
    updatedAt,
  }
}

describe('IdbWorkStore', () => {
  let store: IdbWorkStore
  let dbSeq = 0

  beforeEach(() => {
    // 每个用例用唯一库名隔离（fake-indexeddb 按 name 复用数据库）
    store = new IdbWorkStore(`pindu-works-test-${dbSeq++}`)
  })

  it('save 后可 get 到完整 Work', async () => {
    const work = makeWork('w1', '图案一', 100)
    await store.save(work)
    expect(await store.get('w1')).toEqual(work)
  })

  it('list 返回元信息（不含 pattern）并按 updatedAt 倒序', async () => {
    await store.save(makeWork('a', '旧', 100))
    await store.save(makeWork('b', '新', 200))
    const list = await store.list()
    expect(list.map((m) => m.id)).toEqual(['b', 'a'])
    expect(list[0]).not.toHaveProperty('pattern')
  })

  it('remove 后 get 返回 null', async () => {
    await store.save(makeWork('a', 'x', 100))
    await store.remove('a')
    expect(await store.get('a')).toBeNull()
  })
})
