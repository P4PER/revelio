import { it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ user: { id: 'u1', username: 'alice', email: 'alice@owl.post' } })),
  usernameAvailable: vi.fn(async () => true),
  emailHasAccount: vi.fn(async () => false),
  generateCode: vi.fn(() => '123456'),
  storeCode: vi.fn(async () => {}),
  consumeCode: vi.fn(async () => ({ newEmail: 'new@owl.post' })),
  renderOtpEmail: vi.fn(async () => ({ subject: 's', html: 'h', text: 't' })),
  sendMail: vi.fn(async () => {}),
  getCachedSiteSettings: vi.fn(async () => ({ contactEmail: 'c@x' })),
  deleteUserById: vi.fn(async () => {}),
  getUserExport: vi.fn(async () => ({ profile: {}, decks: [], collection: { visibility: 'private', ownedCards: [] }, likes: [] })),
  update: vi.fn(() => ({ set: () => ({ where: async () => {} }) })),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/server/session', () => ({ getSession: m.getSession }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({ update: m.update }) }))
vi.mock('@revelio/db', () => ({ user: { id: 'user.id' }, deleteUserById: m.deleteUserById, getUserExport: m.getUserExport }))
vi.mock('@/lib/auth-actions', () => ({ usernameAvailable: m.usernameAvailable, emailHasAccount: m.emailHasAccount }))
vi.mock('@/lib/server/account-codes', () => ({
  generateCode: m.generateCode, storeCode: m.storeCode, consumeCode: m.consumeCode,
  emailChangeId: (id: string) => `ec:${id}`, deleteId: (id: string) => `del:${id}`,
}))
vi.mock('@/lib/email/otp-template', () => ({ renderOtpEmail: m.renderOtpEmail }))
vi.mock('@/lib/email/mailer', () => ({ sendMail: m.sendMail }))
vi.mock('@/lib/server/site-settings', () => ({ getCachedSiteSettings: m.getCachedSiteSettings }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))

import {
  updateUsername, requestEmailChange, confirmEmailChange,
  requestAccountDeletion, confirmAccountDeletion, exportMyData,
} from '../settings-actions'

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.getSession.mockResolvedValue({ user: { id: 'u1', username: 'alice', email: 'alice@owl.post' } })
  m.usernameAvailable.mockResolvedValue(true)
  m.emailHasAccount.mockResolvedValue(false)
  m.generateCode.mockReturnValue('123456')
  m.consumeCode.mockResolvedValue({ newEmail: 'new@owl.post' })
  m.renderOtpEmail.mockResolvedValue({ subject: 's', html: 'h', text: 't' })
  m.getCachedSiteSettings.mockResolvedValue({ contactEmail: 'c@x' })
  m.getUserExport.mockResolvedValue({ profile: {}, decks: [], collection: { visibility: 'private', ownedCards: [] }, likes: [] })
  m.update.mockReturnValue({ set: () => ({ where: async () => {} }) })
})

it('rejects when logged out', async () => {
  m.getSession.mockResolvedValueOnce(null as never)
  expect(await updateUsername('bob')).toEqual({ ok: false, error: 'unauthorized' })
})
it('no-ops when the username is unchanged', async () => {
  expect(await updateUsername('alice')).toEqual({ ok: false, error: 'unchanged' })
})
it('rejects a taken username', async () => {
  m.usernameAvailable.mockResolvedValueOnce(false)
  expect(await updateUsername('bob')).toEqual({ ok: false, error: 'taken' })
})
it('updates a free username', async () => {
  expect(await updateUsername('bob')).toEqual({ ok: true })
  expect(m.update).toHaveBeenCalled()
})
it('rejects email change to the same address', async () => {
  expect(await requestEmailChange('alice@owl.post')).toEqual({ ok: false, error: 'same-email' })
})
it('rejects email change to a taken address', async () => {
  m.emailHasAccount.mockResolvedValueOnce(true)
  expect(await requestEmailChange('new@owl.post')).toEqual({ ok: false, error: 'email-taken' })
})
it('stores a code and mails the new address on email change request', async () => {
  expect(await requestEmailChange('new@owl.post')).toEqual({ ok: true })
  expect(m.storeCode).toHaveBeenCalledWith('ec:u1', '123456', { newEmail: 'new@owl.post' })
  expect(m.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@owl.post' }))
})
it('rejects a bad email-change code', async () => {
  m.consumeCode.mockResolvedValueOnce(null)
  expect(await confirmEmailChange('000000')).toEqual({ ok: false, error: 'code' })
})
it('applies the email change on a good code', async () => {
  expect(await confirmEmailChange('123456')).toEqual({ ok: true })
  expect(m.update).toHaveBeenCalled()
})
it('mails the current address on deletion request', async () => {
  expect(await requestAccountDeletion()).toEqual({ ok: true })
  expect(m.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@owl.post' }))
})
it('rejects a bad deletion code', async () => {
  m.consumeCode.mockResolvedValueOnce(null)
  expect(await confirmAccountDeletion('000000')).toEqual({ ok: false, error: 'code' })
})
it('deletes on a good code', async () => {
  m.consumeCode.mockResolvedValueOnce({})
  expect(await confirmAccountDeletion('123456')).toEqual({ ok: true })
  expect(m.deleteUserById).toHaveBeenCalledWith(expect.anything(), 'u1')
})
it('returns export data', async () => {
  const r = await exportMyData()
  expect(r.ok).toBe(true)
  expect(m.getUserExport).toHaveBeenCalledWith(expect.anything(), 'u1')
})
