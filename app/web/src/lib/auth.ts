import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP, username, admin } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { createClient, schema } from '@revelio/db'
import { renderOtpEmail } from '@/lib/email/otp-template'
import { sendMail } from '@/lib/email/mailer'
import { getCachedSiteSettings } from '@/lib/site-settings'

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
        // Password auth is disabled, so 'forget-password' never fires; map it
        // defensively so the remaining kinds match our template's union.
        const kind = type === 'forget-password' ? 'sign-in' : type
        const settings = await getCachedSiteSettings()
        const { subject, html, text } = await renderOtpEmail({
          otp,
          type: kind,
          contactEmail: settings?.contactEmail ?? '',
        })
        await sendMail({ to: email, subject, html, text })
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
