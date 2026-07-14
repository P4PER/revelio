import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { id: 'me', role: 'admin' } })),
  updateUserRole: vi.fn(async () => {}),
  setUserBan: vi.fn(async () => {}),
  clearUserBan: vi.fn(async () => {}),
  deleteUserById: vi.fn(async () => {}),
  getUserForAdmin: vi.fn(async () => ({ id: 'u2', role: 'user' })),
  countAdmins: vi.fn(async () => 2),
  setUserPassword: vi.fn(async () => ({})),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  updateUserRole: m.updateUserRole, setUserBan: m.setUserBan, clearUserBan: m.clearUserBan,
  deleteUserById: m.deleteUserById, getUserForAdmin: m.getUserForAdmin, countAdmins: m.countAdmins,
}))
vi.mock('@/lib/auth', () => ({ auth: { api: { setUserPassword: m.setUserPassword } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import {
  setUserRole, banUser, unbanUser, setUserPassword, deleteUser,
} from '../user-admin-actions'

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.requireRole.mockResolvedValue({ user: { id: 'me', role: 'admin' } })
  m.getUserForAdmin.mockResolvedValue({ id: 'u2', role: 'user' })
  m.countAdmins.mockResolvedValue(2)
})

describe('setUserRole', () => {
  it('rejects a non-admin before writing', async () => {
    m.requireRole.mockRejectedValueOnce(new Error('Forbidden'))
    let caught: unknown
    await setUserRole('u2', 'editor').catch((e) => { caught = e })
    expect((caught as Error).message).toBe('Forbidden')
    expect(m.updateUserRole).not.toHaveBeenCalled()
  })

  it('blocks changing your own role', async () => {
    const res = await setUserRole('me', 'user')
    expect(res).toEqual({ ok: false, error: 'self' })
    expect(m.updateUserRole).not.toHaveBeenCalled()
  })

  it('blocks demoting the last admin', async () => {
    m.getUserForAdmin.mockResolvedValueOnce({ id: 'u2', role: 'admin' })
    m.countAdmins.mockResolvedValueOnce(1)
    const res = await setUserRole('u2', 'editor')
    expect(res).toEqual({ ok: false, error: 'last-admin' })
    expect(m.updateUserRole).not.toHaveBeenCalled()
  })

  it('updates the role and revalidates', async () => {
    const res = await setUserRole('u2', 'editor')
    expect(res).toEqual({ ok: true })
    expect(m.updateUserRole).toHaveBeenCalledWith(expect.anything(), 'u2', 'editor')
    expect(m.revalidatePath).toHaveBeenCalledWith('/admin/users')
  })

  it('rejects an unknown role value', async () => {
    const res = await setUserRole('u2', 'superuser')
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.updateUserRole).not.toHaveBeenCalled()
  })
})

describe('banUser / unbanUser', () => {
  it('blocks banning yourself', async () => {
    expect(await banUser('me', 'x', null)).toEqual({ ok: false, error: 'self' })
    expect(m.setUserBan).not.toHaveBeenCalled()
  })

  it('bans with a parsed expiry', async () => {
    const res = await banUser('u2', 'spam', '2030-01-01')
    expect(res).toEqual({ ok: true })
    const [, id, reason, expires] = m.setUserBan.mock.calls[0]
    expect(id).toBe('u2')
    expect(reason).toBe('spam')
    expect(expires).toBeInstanceOf(Date)
  })

  it('bans with no expiry (null)', async () => {
    await banUser('u2', 'spam', null)
    expect(m.setUserBan.mock.calls[0][3]).toBeNull()
  })

  it('unbans', async () => {
    expect(await unbanUser('u2')).toEqual({ ok: true })
    expect(m.clearUserBan).toHaveBeenCalledWith(expect.anything(), 'u2')
  })
})

describe('setUserPassword', () => {
  it('rejects a too-short password', async () => {
    const res = await setUserPassword('u2', 'short')
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(m.setUserPassword).not.toHaveBeenCalled()
  })

  it('sets a valid password on your own account via better-auth', async () => {
    const res = await setUserPassword('me', 'longenough1')
    expect(res).toEqual({ ok: true })
    expect(m.setUserPassword).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: 'me', newPassword: 'longenough1' } }),
    )
  })
})

describe('deleteUser', () => {
  it('blocks deleting yourself', async () => {
    expect(await deleteUser('me')).toEqual({ ok: false, error: 'self' })
    expect(m.deleteUserById).not.toHaveBeenCalled()
  })

  it('blocks deleting the last admin', async () => {
    m.getUserForAdmin.mockResolvedValueOnce({ id: 'u2', role: 'admin' })
    m.countAdmins.mockResolvedValueOnce(1)
    expect(await deleteUser('u2')).toEqual({ ok: false, error: 'last-admin' })
    expect(m.deleteUserById).not.toHaveBeenCalled()
  })

  it('deletes and revalidates', async () => {
    expect(await deleteUser('u2')).toEqual({ ok: true })
    expect(m.deleteUserById).toHaveBeenCalledWith(expect.anything(), 'u2')
    expect(m.revalidatePath).toHaveBeenCalledWith('/admin/users')
  })
})
