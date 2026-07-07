import { it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ user: { id: 'u1' } })),
  createDeck: vi.fn(async () => 'new-id'),
  updateDeck: vi.fn(async () => {}),
  deleteDeck: vi.fn(async () => {}),
  getDeck: vi.fn(async () => ({ userId: 'u1', deck: { name: 'D', format: 'revival', visibility: 'private', cards: [] } })),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession: m.getSession }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  createDeck: m.createDeck,
  updateDeck: m.updateDeck,
  deleteDeck: m.deleteDeck,
  getDeck: m.getDeck,
}))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import { createDeckAction, updateDeckAction, deleteDeckAction } from '../deck-actions'

const validInput = { name: 'D', format: 'revival', visibility: 'private', cards: [{ cardId: 'x', zone: 'main', quantity: 4 }] }

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.getSession.mockResolvedValue({ user: { id: 'u1' } })
  m.getDeck.mockResolvedValue({ userId: 'u1', deck: { name: 'D', format: 'revival', visibility: 'private', cards: [] } })
})

it('rejects create when logged out', async () => {
  m.getSession.mockResolvedValueOnce(null as never)
  expect(await createDeckAction(validInput)).toEqual({ ok: false, error: 'auth' })
})

it('creates with the session user id', async () => {
  const r = await createDeckAction(validInput)
  expect(r).toEqual({ ok: true, id: 'new-id' })
  expect(m.createDeck).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ name: 'D' }))
})

it('rejects invalid input', async () => {
  expect(await createDeckAction({ name: '', format: 'nope', cards: [] })).toEqual({ ok: false, error: 'invalid' })
})

it('rejects update on a deck owned by someone else', async () => {
  m.getDeck.mockResolvedValueOnce({ userId: 'other', deck: {} } as never)
  expect(await updateDeckAction('d1', validInput)).toEqual({ ok: false, error: 'forbidden' })
  expect(m.updateDeck).not.toHaveBeenCalled()
})

it('rejects delete on a deck owned by someone else', async () => {
  m.getDeck.mockResolvedValueOnce({ userId: 'other', deck: {} } as never)
  expect(await deleteDeckAction('d1')).toEqual({ ok: false, error: 'forbidden' })
})
