import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP, username, admin } from 'better-auth/plugins'
import { schema } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let auth: ReturnType<typeof betterAuth>
let lastOtp = ''

// A schema check only: the migrated auth tables carry every column web's Better
// Auth setup reads and writes. The rules that setup enforces (terms acceptance
// is server-only, ADMIN_EMAILS decides the role) are tested against web's own
// options in web/src/lib/server/__tests__/auth-options.test.ts.
beforeAll(async () => {
  ctx = await withMigratedDb() // migrates the consolidated schema incl. auth tables
  auth = betterAuth({
    secret: 'test-secret-please-change',
    database: drizzleAdapter(ctx.db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        termsVersion: { type: 'string', required: false, input: false },
        termsAcceptedAt: { type: 'date', required: false, input: false },
      },
    },
    plugins: [
      username(),
      admin(),
      emailOTP({
        otpLength: 6,
        async sendVerificationOTP({ otp }: { otp: string }) {
          lastOtp = otp
        },
      }),
    ],
  })
}, 60_000)

afterAll(async () => {
  await ctx.stop()
})

describe('auth schema', () => {
  it('signs up a new user via OTP and reads the session back', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'ann@example.com', type: 'sign-in' } })
    expect(lastOtp).toMatch(/^\d{6}$/)
    const res = await auth.api.signInEmailOTP({
      body: { email: 'ann@example.com', otp: lastOtp },
      asResponse: true,
    })
    expect(res.status).toBe(200)

    const cookie = res.headers
      .getSetCookie()
      .map((c: string) => c.split(';')[0])
      .join('; ')
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(session?.user).toMatchObject({ email: 'ann@example.com', role: 'user', termsVersion: null })
  })
})
