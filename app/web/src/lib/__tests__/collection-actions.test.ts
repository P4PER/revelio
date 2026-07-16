import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ user: { id: 'u1' } })),
  getCardFinishes: vi.fn(async () => ['normal', 'holo']),
  setCardQuantity: vi.fn(async () => {}),
  setCollectionVisibility: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession: m.getSession }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  getCardFinishes: m.getCardFinishes,
  setCardQuantity: m.setCardQuantity,
  setCollectionVisibility: m.setCollectionVisibility,
}))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import { setCardQuantityAction, setCollectionVisibilityAction } from '../collection-actions'

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.getSession.mockResolvedValue({ user: { id: 'u1' } })
  m.getCardFinishes.mockResolvedValue(['normal', 'holo'])
})

describe('setCardQuantityAction', () => {
  it('rejects an unauthenticated user before writing', async () => {
    m.getSession.mockResolvedValueOnce(null)
    expect(await setCardQuantityAction('bs-1', 'normal', 1)).toEqual({ ok: false, error: 'auth' })
    expect(m.setCardQuantity).not.toHaveBeenCalled()
  })

  it('rejects a finish the card does not offer', async () => {
    m.getCardFinishes.mockResolvedValueOnce(['normal'])
    expect(await setCardQuantityAction('bs-1', 'holo', 1)).toEqual({ ok: false, error: 'finish' })
    expect(m.setCardQuantity).not.toHaveBeenCalled()
  })

  it('rejects an unknown card', async () => {
    m.getCardFinishes.mockResolvedValueOnce(null)
    expect(await setCardQuantityAction('nope', 'normal', 1)).toEqual({ ok: false, error: 'invalid' })
  })

  it('clamps negative quantity to zero and writes', async () => {
    expect(await setCardQuantityAction('bs-1', 'normal', -3)).toEqual({ ok: true })
    expect(m.setCardQuantity).toHaveBeenCalledWith({}, 'u1', 'bs-1', 'normal', 0)
    expect(m.revalidatePath).toHaveBeenCalledWith('/collection')
  })

  it('writes a valid quantity', async () => {
    expect(await setCardQuantityAction('bs-1', 'holo', 2)).toEqual({ ok: true })
    expect(m.setCardQuantity).toHaveBeenCalledWith({}, 'u1', 'bs-1', 'holo', 2)
  })
})

describe('setCollectionVisibilityAction', () => {
  it('rejects an invalid visibility', async () => {
    expect(await setCollectionVisibilityAction('secret')).toEqual({ ok: false, error: 'invalid' })
  })
  it('sets a valid visibility', async () => {
    expect(await setCollectionVisibilityAction('public')).toEqual({ ok: true })
    expect(m.setCollectionVisibility).toHaveBeenCalledWith({}, 'u1', 'public')
  })
})
