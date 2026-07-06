import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  saveSubTypeTranslations: vi.fn(async () => {}),
  updateTag: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ saveSubTypeTranslations: m.saveSubTypeTranslations }))
vi.mock('next/cache', () => ({ updateTag: m.updateTag }))

import { saveSubTypeTranslationsAction } from '../sub-type-actions'

const valid = { rows: [{ code: 'wizard', lang: 'de', label: 'Zauberer' }] }

beforeEach(() => {
  m.requireRole.mockReset(); m.saveSubTypeTranslations.mockReset(); m.updateTag.mockReset()
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
})

describe('saveSubTypeTranslationsAction', () => {
  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await saveSubTypeTranslationsAction(valid).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.saveSubTypeTranslations).not.toHaveBeenCalled()
  })

  it('returns invalid on a bad lang and does not write', async () => {
    const res = await saveSubTypeTranslationsAction({ rows: [{ code: 'x', lang: 'fr', label: 'y' }] })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.saveSubTypeTranslations).not.toHaveBeenCalled()
  })

  it('saves, revalidates the tag, returns ok', async () => {
    const res = await saveSubTypeTranslationsAction(valid)
    expect(m.saveSubTypeTranslations).toHaveBeenCalledWith({}, valid.rows)
    expect(m.updateTag).toHaveBeenCalledWith('sub-type-labels')
    expect(res).toEqual({ ok: true })
  })
})
