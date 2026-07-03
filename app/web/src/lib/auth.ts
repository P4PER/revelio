import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP, username, admin } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { createClient, schema } from '@revelio/db'

const db = createClient(process.env.DATABASE_URL ?? '').db

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: false },
  plugins: [
    username(),
    admin(), // adds `role` (default 'user') + ban fields
    emailOTP({
      otpLength: 6,
      expiresIn: 600, // 10 minutes
      async sendVerificationOTP({ email, otp, type }) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Email provider not configured (deferred to Plan 5)')
        }
        // eslint-disable-next-line no-console
        console.log(`[auth] OTP for ${email} (${type}): ${otp}`)
      },
    }),
    nextCookies(), // must be the last plugin — sets cookies on Next server actions
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            role: ADMIN_EMAILS.includes(user.email.toLowerCase()) ? 'admin' : 'user',
          },
        }),
      },
    },
  },
})
