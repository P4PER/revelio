import 'server-only'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP, username, admin } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { createClient, schema } from '@revelio/db'
import { renderOtpEmail } from '@/lib/email/otp-template'
import { sendMail } from '@/lib/email/mailer'
import { getCachedSiteSettings } from '@/lib/server/site-settings'

const db = createClient(process.env.DATABASE_URL ?? '').db

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET

// Registered only when both halves are present. A local checkout without a
// Discord app must still boot, and a half-configured provider fails at the
// callback rather than at startup, which is worse. The Connections pane reads
// this to explain itself instead of rendering a button that cannot work.
export const discordLinkingConfigured = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET)

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: false },
  // Prefix auth cookies so they share the `revelio.` family with our functional
  // cookies (revelio.locale, revelio.theme, revelio.deck-view) — e.g.
  // `revelio.session_token` (Better Auth prepends `__Secure-` over HTTPS).
  // Changing this renames the cookies and logs existing sessions out once.
  advanced: { cookiePrefix: 'revelio' },
  socialProviders: discordLinkingConfigured
    ? {
        discord: {
          clientId: DISCORD_CLIENT_ID!,
          clientSecret: DISCORD_CLIENT_SECRET!,
          // Registering the provider also mounts the unauthenticated
          // POST /sign-in/social. This blocks the half of it that would create
          // an account straight from a Discord profile, bypassing the OTP flow
          // that assigns a username and leaving a user the sign-in form itself
          // treats as half-provisioned with no way to repair it. It does not on
          // its own stop that endpoint signing in an existing user - see
          // disableImplicitLinking below. The explicit link callback redirects
          // out before either flag is consulted.
          disableSignUp: true,
        },
      }
    : {},
  account: {
    // OAuth access/refresh tokens are encrypted with BETTER_AUTH_SECRET before
    // they reach the account row, so a database dump alone does not hand out
    // live Discord authorizations. Two consequences worth knowing:
    // rotating BETTER_AUTH_SECRET makes every stored token undecryptable (they
    // are only used for revocation, so the cost is a stale authorization left
    // at Discord, not a broken login), and rows written before this flag went
    // on stay plaintext until the account is re-linked - the one reader we
    // have, discord-oauth.ts, falls back to the stored value when a token
    // does not decrypt.
    encryptOAuthTokens: true,
    accountLinking: {
      // Completes disableSignUp: without it, POST /sign-in/social still signs
      // an existing user in whenever the Discord profile's verified email
      // matches theirs, quietly making Discord a second way in that skips the
      // OTP flow. Read only on that implicit path - the explicit link branch
      // never consults it - so Connections still works.
      disableImplicitLinking: true,
      // Deliberately NOT adding discord to trustedProviders: that would let the
      // implicit path accept an *unverified* provider email, and a Discord
      // email can be set to anything without proving ownership.
      //
      // Players rarely use the same address on Discord as on Revelio, and the
      // callback otherwise rejects the link with "email doesn't match". This
      // flag is read only on the explicit link paths - the sign-in path matches
      // by email regardless - so signing in with Discord is not loosened by it.
      allowDifferentEmails: true,
    },
  },
  plugins: [
    username(),
    admin(), // adds `role` (default 'user') + ban fields
    emailOTP({
      otpLength: 6,
      expiresIn: 600, // 10 minutes
      // The verification row keeps only a hash of the code, so a database dump
      // cannot be turned into a sign-in - matching how our own one-time codes
      // are stored (lib/server/account-codes.ts). Hashed rather than encrypted
      // because nothing needs to read the code back: verification compares
      // hashes, and resendStrategy stays at its 'rotate' default, which issues a
      // fresh code instead of re-sending the stored one.
      storeOTP: 'hashed',
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
