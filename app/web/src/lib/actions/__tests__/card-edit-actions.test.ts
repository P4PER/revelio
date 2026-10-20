import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  saveCardEdit: vi.fn(async () => {}),
  getCardIndexData: vi.fn(async () => ({ id: 'x-1', localizations: { en: {} } })),
  reindexCard: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/server/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/server/reindex', () => ({ getWriteClient: () => ({}) }))
vi.mock('@revelio/db', () => ({ saveCardEdit: m.saveCardEdit, getCardIndexData: m.getCardIndexData }))
vi.mock('@revelio/search', () => ({ reindexCard: m.reindexCard }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import { saveCardEditAction } from '../card-edit-actions'
import { routing } from '@/../i18n/routing'

const localization = { name: 'Neuer Name', text: 'Rumpf', flavorText: '', status: 'official' }
const valid = {
  cardId: 'x-1',
  lang: 'de',
  localization,
  rulings: [{ id: null, date: '2001-08-31', source: 'POJO', text: 'a ruling' }],
}

function savedLocalization() {
  return (m.saveCardEdit.mock.calls[0] as unknown as [unknown, { localization: Record<string, unknown> }])[1].localization
}

beforeEach(() => {
  vi.clearAllMocks()
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
  m.getCardIndexData.mockResolvedValue({ id: 'x-1', localizations: { en: {} } })
})

describe('saveCardEditAction', () => {
  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await saveCardEditAction(valid).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.saveCardEdit).not.toHaveBeenCalled()
  })
  it('returns an error and does not write on invalid input', async () => {
    const res = await saveCardEditAction({ ...valid, localization: { ...localization, name: '' } })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.saveCardEdit).not.toHaveBeenCalled()
  })
  it('writes nothing when only the rulings are invalid', async () => {
    const res = await saveCardEditAction({ ...valid, rulings: [{ id: null, text: 'no date or source' }] })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.saveCardEdit).not.toHaveBeenCalled()
  })
  it('rejects a name past the card name bound', async () => {
    const res = await saveCardEditAction({ ...valid, localization: { ...localization, name: 'x'.repeat(121) } })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.saveCardEdit).not.toHaveBeenCalled()
  })
  it('accepts a name at the card name bound', async () => {
    expect(await saveCardEditAction({ ...valid, localization: { ...localization, name: 'x'.repeat(120) } }))
      .toEqual({ ok: true })
  })
  it('saves both sections in one call (empty strings -> null), reindexes, revalidates', async () => {
    const res = await saveCardEditAction({
      ...valid,
      rulings: [...valid.rulings, { id: 'x-1-r0', date: '', source: '', text: 'undated' }],
    })
    expect(m.saveCardEdit).toHaveBeenCalledTimes(1)
    expect(m.saveCardEdit).toHaveBeenCalledWith(expect.anything(), {
      localization: { cardId: 'x-1', lang: 'de', name: 'Neuer Name', text: 'Rumpf', flavorText: null, status: 'official' },
      rulings: [
        { id: null, date: '2001-08-31', source: 'POJO', text: 'a ruling' },
        { id: 'x-1-r0', date: null, source: null, text: 'undated' },
      ],
    })
    // Every language index, since a de edit can change en's fallback document.
    expect(m.reindexCard).toHaveBeenCalledWith(expect.anything(), expect.anything(), [...routing.locales])
    expect(m.revalidatePath).toHaveBeenCalledWith('/card/x-1')
    expect(res).toEqual({ ok: true })
  })
  it('keeps the save when reindex fails (non-fatal warning)', async () => {
    m.reindexCard.mockRejectedValueOnce(new Error('meili down'))
    const res = await saveCardEditAction(valid)
    expect(m.saveCardEdit).toHaveBeenCalled()
    expect(res).toEqual({ ok: true, warning: 'reindex-failed' })
  })
  it('lets a failed write throw instead of reindexing', async () => {
    m.saveCardEdit.mockRejectedValueOnce(new Error('db down'))
    let caught: unknown
    await saveCardEditAction(valid).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('db down')
    expect(m.reindexCard).not.toHaveBeenCalled()
  })

  it('passes a normalized adventure group and omits match', async () => {
    await saveCardEditAction({
      ...valid,
      localization: { ...localization, adventure: { effect: '  spark  ', reward: '', toSolve: '' } },
    })
    expect(savedLocalization()).toEqual(
      expect.objectContaining({ adventure: { effect: 'spark', reward: null, toSolve: null } }),
    )
    expect('match' in savedLocalization()).toBe(false)
  })

  it('nulls an all-empty adventure group', async () => {
    await saveCardEditAction({
      ...valid,
      localization: { ...localization, adventure: { effect: '', reward: '  ', toSolve: '' } },
    })
    expect(savedLocalization()).toEqual(expect.objectContaining({ adventure: null }))
  })
})
