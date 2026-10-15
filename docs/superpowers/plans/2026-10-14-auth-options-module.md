# Better Auth options in a testable module

Follow-up from PR #158, whose notes listed it as open.

## Problem

`web/src/lib/server/auth.ts` builds the Better Auth instance at import time: it opens a
Postgres client and wires the mailer and site settings in the same expression as the
options. Nothing in `web` can load it in a test, so the two rules web itself owns have no
test that runs them:

- `termsVersion` / `termsAcceptedAt` are `input: false`, so no Better Auth endpoint lets a
  client write its own terms acceptance.
- `ADMIN_EMAILS` decides the role a new user is created with.

`ingest/test/auth.test.ts` tests both against a hand-written copy of the options. If web's
options change, that copy still passes.

## Change

1. New `web/src/lib/server/auth-options.ts` (`import 'server-only'`, like everything in
   `lib/server/`). It exports `createAuthOptions(config, deps)`:
   - `config`: `secret`, `baseURL`, `adminEmails: string[]`, and
     `discord: { clientId, clientSecret } | null`.
   - `deps`: the `database` adapter and `sendVerificationOTP`.
   It returns the options object, with its type inferred rather than annotated as
   `BetterAuthOptions`, so `auth.api` and the session keep the plugin fields (`role`,
   `username`, `termsVersion`). The module has no I/O and imports no `@revelio/db`. The
   comments on the options move with them.
2. `auth.ts` keeps the env parsing (`ADMIN_EMAILS`, the Discord pair,
   `discordLinkingConfigured`) and calls
   `betterAuth(createAuthOptions(config, { database: drizzleAdapter(...), sendVerificationOTP }))`,
   where `sendVerificationOTP` renders the OTP email and sends it.
3. New `web/src/lib/server/__tests__/auth-options.test.ts` runs `betterAuth` over the real
   options with Better Auth's `memoryAdapter`, using a captured OTP:
   - a client cannot set `termsVersion`: sign-up leaves it null, and `updateUser` with
     `termsVersion` leaves it unchanged
   - an email in `adminEmails`, in any letter case, signs up as `admin`; any other email
     signs up as `user`
   - Discord is registered only when the config carries it (`auth.options.socialProviders`)
4. `ingest/test/auth.test.ts` keeps one test: OTP sign-up creates a user and a session
   against the migrated Postgres schema, including the `role`, `username` and terms
   columns. The terms and admin tests go, and the role hook goes with them. The comment
   says that behaviour is tested in web.

## Order

Write the web test first, against the module before it exists (RED), then extract.
Mutation check: flip `input: false` to `true`, and drop the `.toLowerCase()` in the admin
check. Each change should fail the test.

## Verification

`npm test` for `web` and `ingest` (Docker is needed for Testcontainers), `npm run typecheck`,
`npm run lint` from `app/`.
