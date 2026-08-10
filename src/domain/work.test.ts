import { describe, it, expect } from 'vitest'
import { MemoryWorkStore } from './work'
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

describe('MemoryWorkStore', () => {
  it('save 后可 get 到完整 Work', async () => {
    const store = new MemoryWorkStore()
    const work = makeWork('w1', '图案一', 100)
    await store.save(work)
    expect(await store.get('w1')).toEqual(work)
  })

  it('get 不存在的 id 返回 null', async () => {
    const store = new MemoryWorkStore()
    expect(await store.get('nope')).toBeNull()
  })

  it('list 返回元信息（不含 pattern）并按 updatedAt 倒序', async () => {
    const store = new MemoryWorkStore()
    await store.save(makeWork('a', '旧', 100))
    await store.save(makeWork('b', '新', 200))
    const list = await store.list()
    expect(list.map((m) => m.id)).toEqual(['b', 'a'])
    expect(list[0]).not.toHaveProperty('pattern')
    expect(list[0]).not.toHaveProperty('activePalette')
  })

  it('save 覆盖同 id Work，更新 name 与时间', async () => {
    const store = new MemoryWorkStore()
    await store.save(makeWork('a', '原名', 100))
    await store.save({ ...makeWork('a', '新名', 300) })
    const got = await store.get('a')
    expect(got?.name).toBe('新名')
    expect(got?.updatedAt).toBe(300)
  })

  it('remove 后 get 返回 null、list 不含该项', async () => {
    const store = new MemoryWorkStore()
    await store.save(makeWork('a', 'x', 100))
    await store.remove('a')
    expect(await store.get('a')).toBeNull()
    expect(await store.list()).toEqual([])
  })

  it('save 后外部修改 pattern 不影响存储内容（持有副本）', async () => {
    const store = new MemoryWorkStore()
    const work = makeWork('a', 'x', 100)
    await store.save(work)
    work.pattern.cells[0] = 'changed'
    expect((await store.get('a'))?.pattern.cells).toEqual(['a'])
  })
})
