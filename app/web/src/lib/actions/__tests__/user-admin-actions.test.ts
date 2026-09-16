import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({ user: { id: 'me', role: 'admin' } })),
  updateUserRole: vi.fn(async () => {}),
  setUserBan: vi.fn(async () => {}),
  clearUserBan: vi.fn(async () => {}),
  deleteUserById: vi.fn(async () => {}),
  getUserForAdmin: vi.fn(async () => ({ id: 'u2', role: 'user' })),
  countAdmins: vi.fn(async () => 2),
  revalidatePath: vi.fn(),
  unlinkAndRevokeDiscord: vi.fn(async () => 0),
  renderBanEmail: vi.fn(async () => ({ subject: 's', html: 'h', text: 't' })),
  sendMail: vi.fn(async () => {}),
  getCachedSiteSettings: vi.fn(async () => ({ contactEmail: 'help@x.test' })),
}))
vi.mock('@/lib/server/session', () => ({ requireRole: m.requireRole }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  updateUserRole: m.updateUserRole, setUserBan: m.setUserBan, clearUserBan: m.clearUserBan,
  deleteUserById: m.deleteUserById, getUserForAdmin: m.getUserForAdmin, countAdmins: m.countAdmins,
}))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))
// Deletion revokes the Discord link first. Stubbed here so the suite does not
// pull in lib/server/auth (a live Postgres client at import time) through it.
vi.mock('@/lib/server/discord-oauth', () => ({ unlinkAndRevokeDiscord: m.unlinkAndRevokeDiscord }))
vi.mock('@/lib/email/ban-template', () => ({ renderBanEmail: m.renderBanEmail }))
vi.mock('@/lib/email/mailer', () => ({ sendMail: m.sendMail }))
vi.mock('@/lib/server/site-settings', () => ({ getCachedSiteSettings: m.getCachedSiteSettings }))

import {
  setUserRole, banUser, unbanUser, deleteUser,
} from '../user-admin-actions'

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.requireRole.mockResolvedValue({ user: { id: 'me', role: 'admin' } })
  m.getUserForAdmin.mockResolvedValue({ id: 'u2', role: 'user', email: 'u2@x.test' })
  m.renderBanEmail.mockResolvedValue({ subject: 's', html: 'h', text: 't' })
  m.sendMail.mockResolvedValue(undefined)
  m.getCachedSiteSettings.mockResolvedValue({ contactEmail: 'help@x.test' })
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

  // Art. 17(3) DSA wants the facts and grounds; an empty reason cannot state
  // either.
  it('rejects a blank reason before writing', async () => {
    expect(await banUser('u2', '   ', null)).toEqual({ ok: false, error: 'reason-required' })
    expect(m.setUserBan).not.toHaveBeenCalled()
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  // Better Auth lifts a ban whose expiry has passed at the next sign-in, so a
  // past date would store no ban at all but still email a suspension notice.
  it('rejects an expiry that is not in the future', async () => {
    expect(await banUser('u2', 'spam', '2020-01-01')).toEqual({ ok: false, error: 'invalid' })
    expect(m.setUserBan).not.toHaveBeenCalled()
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('stores the trimmed reason', async () => {
    await banUser('u2', '  spam  ', null)
    expect(m.setUserBan.mock.calls[0][2]).toBe('spam')
  })

  it('rejects an unknown user before writing', async () => {
    m.getUserForAdmin.mockResolvedValueOnce(null)
    expect(await banUser('ghost', 'spam', null)).toEqual({ ok: false, error: 'not-found' })
    expect(m.setUserBan).not.toHaveBeenCalled()
  })

  it('emails the banned user the reason and expiry after storing the ban', async () => {
    expect(await banUser('u2', 'spam', '2030-01-01')).toEqual({ ok: true })
    expect(m.renderBanEmail).toHaveBeenCalledWith({
      reason: 'spam', expiresAt: new Date('2030-01-01'), contactEmail: 'help@x.test',
    })
    expect(m.sendMail).toHaveBeenCalledWith({ to: 'u2@x.test', subject: 's', html: 'h', text: 't' })
    expect(m.setUserBan.mock.invocationCallOrder[0]).toBeLessThan(m.sendMail.mock.invocationCallOrder[0])
  })

  // The ban is the safety-relevant half. Mail being down must not let the
  // account back in; the admin is told so they can send the reasons by hand.
  it('keeps the ban and warns when the notice cannot be sent', async () => {
    m.sendMail.mockRejectedValueOnce(new Error('SMTP down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await banUser('u2', 'spam', null)).toEqual({ ok: true, warning: 'notify-failed' })
    expect(m.setUserBan).toHaveBeenCalled()
    spy.mockRestore()
  })

  // The contact address only fills an optional footer line; failing to read it
  // must not cost the user their statement of reasons.
  it('still sends the notice when the site settings cannot be read', async () => {
    m.getCachedSiteSettings.mockRejectedValueOnce(new Error('db down'))
    expect(await banUser('u2', 'spam', null)).toEqual({ ok: true })
    expect(m.renderBanEmail).toHaveBeenCalledWith({ reason: 'spam', expiresAt: null, contactEmail: '' })
    expect(m.sendMail).toHaveBeenCalled()
  })

  it('does not email on unban', async () => {
    await unbanUser('u2')
    expect(m.sendMail).not.toHaveBeenCalled()
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
