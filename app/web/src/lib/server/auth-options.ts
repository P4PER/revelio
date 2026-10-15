import 'server-only'

import type { BetterAuthOptions } from 'better-auth'
import { emailOTP, username, admin } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'

// What auth.ts reads from the environment. A null `discord` leaves the provider
// unregistered; auth.ts passes null unless both halves are set.
export type AuthConfig = {
  secret: string | undefined
  baseURL: string | undefined
  adminEmails: string[]
  discord: { clientId: string; clientSecret: string } | null
}

// The two things that need I/O, injected so a test can run these options over
// Better Auth's memory adapter with no Postgres and no mailer.
export type AuthDeps = {
  database: BetterAuthOptions['database']
  sendVerificationOTP: Parameters<typeof emailOTP>[0]['sendVerificationOTP']
}

// Return type left to inference on purpose: annotating it BetterAuthOptions
// would erase the plugin and additional fields (`role`, `username`,
// `termsVersion`) from `auth.api` and the session type.
export function createAuthOptions(config: AuthConfig, deps: AuthDeps) {
  const adminEmails = config.adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)

  return {
    secret: config.secret,
    baseURL: config.baseURL,
    database: deps.database,
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        // Terms of Service acceptance (db/src/auth-schema.ts). Declared so the
        // session carries termsVersion for the acceptance banner and so a
        // future `@better-auth/cli generate` keeps the columns. input:false:
        // no Better Auth endpoint may write them - sign-up and updateUser
        // bodies reject or drop them - and only acceptTermsAction does, from
        // the session and the server's own TERMS_VERSION.
        termsVersion: { type: 'string', required: false, input: false },
        termsAcceptedAt: { type: 'date', required: false, input: false },
      },
    },
    // Prefix auth cookies so they share the `revelio.` family with our functional
    // cookies (revelio.locale, revelio.theme, revelio.deck-view) - e.g.
    // `revelio.session_token` (Better Auth prepends `__Secure-` over HTTPS).
    // Changing this renames the cookies and logs existing sessions out once.
    advanced: { cookiePrefix: 'revelio' },
    socialProviders: config.discord
      ? {
          discord: {
            clientId: config.discord.clientId,
            clientSecret: config.discord.clientSecret,
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
        sendVerificationOTP: deps.sendVerificationOTP,
      }),
      nextCookies(), // must be the last plugin - sets cookies on Next server actions
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              role: adminEmails.includes(user.email.toLowerCase()) ? 'admin' : 'user',
            },
          }),
        },
      },
    },
  } satisfies BetterAuthOptions
}
