// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { createAuthOptions, type AuthConfig } from '../auth-options'

// The real options, run by Better Auth itself over an in-memory store: what is
// under test is web's own config, not a copy of it.
function setup(config: Partial<AuthConfig> = {}) {
  let lastOtp = ''
  const store: Record<string, Record<string, unknown>[]> = {
    user: [], session: [], account: [], verification: [],
  }
  const auth = betterAuth(
    createAuthOptions(
      {
        secret: 'test-secret-at-least-32-characters-long',
        baseURL: 'http://localhost:3000',
        adminEmails: [],
        discord: null,
        ...config,
      },
      {
        database: memoryAdapter(store),
        sendVerificationOTP: async ({ otp }) => {
          lastOtp = otp
        },
      },
    ),
  )

  async function signIn(email: string) {
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
    const res = await auth.api.signInEmailOTP({ body: { email, otp: lastOtp }, asResponse: true })
    expect(res.status).toBe(200)
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    return new Headers({ cookie })
  }

  return { auth, store, signIn }
}

describe('createAuthOptions', () => {
  it('never lets a client set its own terms acceptance', async () => {
    const { auth, store, signIn } = setup()
    const headers = await signIn('terms@example.com')
    expect((await auth.api.getSession({ headers }))?.user.termsVersion ?? null).toBeNull()

    // Rejected or silently ignored, the stored value must not move.
    await auth.api
      .updateUser({ headers, body: { termsVersion: '2099-01-01' } as Record<string, unknown> })
      .catch(() => {})

    expect(store.user).toHaveLength(1)
    expect(store.user[0].termsVersion ?? null).toBeNull()
  })

  it('creates a listed admin email as admin, whatever its letter case', async () => {
    const { auth, signIn } = setup({ adminEmails: ['Boss@Revelio.cards'] })
    const headers = await signIn('BOSS@revelio.CARDS')
    expect((await auth.api.getSession({ headers }))?.user.role).toBe('admin')
  })

  it('creates any other email as a plain user', async () => {
    const { auth, signIn } = setup({ adminEmails: ['boss@revelio.cards'] })
    const headers = await signIn('ann@example.com')
    expect((await auth.api.getSession({ headers }))?.user.role).toBe('user')
  })

  it('registers Discord only when the config carries it', () => {
    expect(setup().auth.options.socialProviders).toEqual({})
    const { auth } = setup({ discord: { clientId: 'id', clientSecret: 'secret' } })
    expect(auth.options.socialProviders).toMatchObject({
      discord: { clientId: 'id', clientSecret: 'secret', disableSignUp: true },
    })
  })
})
