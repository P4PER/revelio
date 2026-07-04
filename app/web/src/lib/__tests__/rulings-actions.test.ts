import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { role: 'editor' } })),
  saveRulings: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ saveRulings: m.saveRulings }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import { saveRulingsAction } from '../rulings-actions'

const valid = {
  cardId: 'x-1',
  lang: 'en',
  rulings: [{ id: null, date: '2001-08-31', source: 'POJO', text: 'a ruling' }],
}

beforeEach(() => {
  m.requireRole.mockReset(); m.saveRulings.mockReset(); m.revalidatePath.mockReset()
  m.requireRole.mockResolvedValue({ user: { role: 'editor' } })
})

describe('saveRulingsAction', () => {
  it('rejects a non-editor before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await saveRulingsAction(valid).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(m.saveRulings).not.toHaveBeenCalled()
  })

  it('returns invalid and does not write on bad input', async () => {
    const res = await saveRulingsAction({ cardId: '', lang: 'en', rulings: [] })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.saveRulings).not.toHaveBeenCalled()
  })

  it('saves valid rulings, revalidates, returns ok', async () => {
    const res = await saveRulingsAction(valid)
    expect(m.saveRulings).toHaveBeenCalledWith({}, 'x-1', 'en', [
      { id: null, date: '2001-08-31', source: 'POJO', text: 'a ruling' },
    ])
    expect(m.revalidatePath).toHaveBeenCalledWith('/card/x-1')
    expect(res).toEqual({ ok: true })
  })
})
