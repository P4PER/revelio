import 'server-only'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createClient, schema } from '@revelio/db'
import { renderOtpEmail } from '@/lib/email/otp-template'
import { sendMail } from '@/lib/email/mailer'
import { getFooterContactEmail } from '@/lib/server/site-settings'
import { createAuthOptions } from '@/lib/server/auth-options'

const db = createClient(process.env.DATABASE_URL ?? '').db

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET

// Registered only when both halves are present. A local checkout without a
// Discord app must still boot, and a half-configured provider fails at the
// callback rather than at startup, which is worse. The Connections pane reads
// this to explain itself instead of rendering a button that cannot work.
export const discordLinkingConfigured = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET)

export const auth = betterAuth(
  createAuthOptions(
    {
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL,
      adminEmails: (process.env.ADMIN_EMAILS ?? '').split(','),
      discord: discordLinkingConfigured
        ? { clientId: DISCORD_CLIENT_ID!, clientSecret: DISCORD_CLIENT_SECRET! }
        : null,
    },
    {
      database: drizzleAdapter(db, { provider: 'pg', schema }),
      async sendVerificationOTP({ email, otp, type }) {
        // Password auth is disabled, so 'forget-password' never fires; map it
        // defensively so the remaining kinds match our template's union.
        const kind = type === 'forget-password' ? 'sign-in' : type
        const { subject, html, text } = await renderOtpEmail({
          otp,
          type: kind,
          contactEmail: await getFooterContactEmail(),
        })
        await sendMail({ to: email, subject, html, text })
      },
    },
  ),
)
