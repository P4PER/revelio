import { describe, it, expect, afterAll } from 'vitest'
import { cardsIndex } from '../src/documents.js'
import { waitForSuccess } from '../src/tasks.js'
import { testMeiliClient, uniqueLang } from './helpers.js'

const client = testMeiliClient()
const lang = uniqueLang()

afterAll(async () => {
  await client.index(cardsIndex(lang)).delete().waitTask()
})

describe('waitForSuccess', () => {
  it('resolves with the task once it succeeded', async () => {
    const task = await waitForSuccess(
      client.index(cardsIndex(lang)).addDocuments([{ id: 'ok-1' }], { primaryKey: 'id' }),
    )
    expect(task.status).toBe('succeeded')
  })

  it('rejects with the task error when Meilisearch failed the task', async () => {
    // Vitest's rejects.toThrow misbehaves in this repo, so the throw is caught by hand.
    let error: unknown
    try {
      await waitForSuccess(
        client.index(cardsIndex(lang)).addDocuments([{ id: 'bad id!' }], { primaryKey: 'id' }),
      )
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/Meilisearch task \d+ .*failed.*invalid_document_id/)
  })
})
