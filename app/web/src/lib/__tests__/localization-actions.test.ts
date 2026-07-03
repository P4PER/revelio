import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  upsertLocalization: vi.fn(async () => {}),
  getCardIndexData: vi.fn(async () => ({ id: 'x-1', localizations: { en: {} } })),
  reindexCard: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/reindex', () => ({ getWriteClient: () => ({}) }))
vi.mock('@revelio/db', () => ({
  upsertLocalization: m.upsertLocalization,
  getCardIndexData: m.getCardIndexData,
}))
vi.mock('@revelio/search', () => ({ reindexCard: m.reindexCard }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import { updateLocalization } from '../localization-actions'

const valid = { cardId: 'x-1', lang: 'de', name: 'Neuer Name', text: 'Rumpf', flavorText: '', status: 'official' }

beforeEach(() => {
  m.requireRole.mockReset()
  m.upsertLocalization.mockReset()
  m.getCardIndexData.mockReset()
  m.reindexCard.mockReset()
  m.revalidatePath.mockReset()
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
  m.getCardIndexData.mockResolvedValue({ id: 'x-1', localizations: { en: {} } })
})

describe('updateLocalization', () => {
  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    await expect(updateLocalization(valid)).rejects.toThrow('Forbidden')
    expect(m.upsertLocalization).not.toHaveBeenCalled()
  })

  it('returns an error and does not write on invalid input', async () => {
    const res = await updateLocalization({ ...valid, name: '' })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.upsertLocalization).not.toHaveBeenCalled()
  })

  it('upserts (empty strings -> null), reindexes, revalidates, returns ok', async () => {
    const res = await updateLocalization(valid)
    expect(m.upsertLocalization).toHaveBeenCalledWith(expect.anything(), {
      cardId: 'x-1', lang: 'de', name: 'Neuer Name', text: 'Rumpf', flavorText: null, status: 'official',
    })
    expect(m.reindexCard).toHaveBeenCalled()
    expect(m.revalidatePath).toHaveBeenCalledWith('/card/x-1')
    expect(res).toEqual({ ok: true })
  })

  it('keeps the save when reindex fails (non-fatal warning)', async () => {
    m.reindexCard.mockRejectedValueOnce(new Error('meili down'))
    const res = await updateLocalization(valid)
    expect(m.upsertLocalization).toHaveBeenCalled()
    expect(res).toEqual({ ok: true, warning: 'reindex-failed' })
  })
})
