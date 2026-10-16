import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Meilisearch } from 'meilisearch'
import type { DB } from '@revelio/db'
import { indexCards, INDEX_TASK_INTERVAL_MS, INDEX_TASK_TIMEOUT_MS } from '../src/index-cards.js'

vi.mock('../src/build-documents.js', () => ({
  buildDocuments: async () => ({ en: [{ id: 'c1' }] }),
}))

type Wait = { task: string; status: string; options: unknown }

// A client whose enqueued-task promises record the options they were waited
// with and finish with the status the test sets.
function fakeClient(settingsStatus: string): { client: Meilisearch; waits: Wait[] } {
  const waits: Wait[] = []
  const enqueued = (task: string, status: string) =>
    Object.assign(Promise.resolve({ taskUid: waits.length }), {
      waitTask: async (options?: unknown) => {
        waits.push({ task, status, options })
        return { uid: waits.length, type: 'test', status, error: null }
      },
    })
  const index = {
    updateSettings: () => enqueued('settings', settingsStatus),
    addDocuments: () => enqueued('documents', 'succeeded'),
  }
  return { client: { index: () => index } as unknown as Meilisearch, waits }
}

describe('indexCards task waits', () => {
  let db: DB
  beforeEach(() => { db = {} as DB })

  it('rejects when Meilisearch failed the settings task', async () => {
    const { client } = fakeClient('failed')
    let error: unknown
    try {
      await indexCards(db, client)
    } catch (e) {
      error = e
    }
    expect((error as Error | undefined)?.message).toMatch(/failed/)
  })

  it('waits for settings, then documents, with a timeout sized for a whole corpus', async () => {
    const { client, waits } = fakeClient('succeeded')
    await indexCards(db, client)
    // Settings first: adding documents to a missing index would create it unconfigured.
    const wait = { timeout: INDEX_TASK_TIMEOUT_MS, interval: INDEX_TASK_INTERVAL_MS }
    expect(waits.map((w) => [w.task, w.options])).toStrictEqual([['settings', wait], ['documents', wait]])
    // A wait polls at most this often, so a long one does not flood a busy server.
    expect(INDEX_TASK_TIMEOUT_MS / INDEX_TASK_INTERVAL_MS).toBeLessThanOrEqual(1000)
  })
})
