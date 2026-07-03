import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP, username, admin } from 'better-auth/plugins'
import { schema } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let auth: ReturnType<typeof betterAuth>
let lastOtp = ''

beforeAll(async () => {
  ctx = await withMigratedDb() // migrates the consolidated schema incl. auth tables
  auth = betterAuth({
    secret: 'test-secret-please-change',
    database: drizzleAdapter(ctx.db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: false },
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
    databaseHooks: {
      user: {
        create: {
          before: async (u: { email: string; [key: string]: unknown }) => ({
            data: {
              ...u,
              role: u.email === 'boss@revelio.cards' ? 'admin' : 'user',
            },
          }),
        },
      },
    },
  })
}, 60_000)

afterAll(async () => {
  await ctx.stop()
})

describe('email-OTP auth', () => {
  it('signs up a new user via OTP and creates a session', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'ann@example.com', type: 'sign-in' } })
    expect(lastOtp).toMatch(/^\d{6}$/)
    const res = await auth.api.signInEmailOTP({
      body: { email: 'ann@example.com', otp: lastOtp },
      asResponse: true,
    })
    expect(res.status).toBe(200)
  })

  it('promotes ADMIN_EMAILS on sign-up', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'boss@revelio.cards', type: 'sign-in' } })
    await auth.api.signInEmailOTP({ body: { email: 'boss@revelio.cards', otp: lastOtp } })
    const admins = await ctx.db.select().from(schema.user)
    expect(admins.find((u) => u.email === 'boss@revelio.cards')?.role).toBe('admin')
  })

  it('exposes the admin role on the session after sign-in', async () => {
    await auth.api.sendVerificationOTP({ body: { email: 'boss@revelio.cards', type: 'sign-in' } })
    const res = await auth.api.signInEmailOTP({
      body: { email: 'boss@revelio.cards', otp: lastOtp },
      asResponse: true,
    })
    const cookie = res.headers
      .getSetCookie()
      .map((c: string) => c.split(';')[0])
      .join('; ')
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(session?.user.role).toBe('admin')
  })
})
