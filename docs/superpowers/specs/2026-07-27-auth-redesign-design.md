# Login & Register redesign — bounded split card

**Date:** 2026-07-27
**Status:** Approved (Option 2, navbar visible, segmented OTP)

## Goal

Rework `/login` and `/register` from the current bare centered form into a
branded **bounded split card** that sits inside the normal page — **the global
navbar and footer stay visible**. Rename the email-step submit button from
**"Send code"** to **"Login" / "Register"**, and replace the plain code input
with a **real segmented 6-box OTP** (shadcn `input-otp`).

## Decisions

- **Chrome unchanged.** `/login` and `/register` keep the global `SiteHeader`
  (search, nav, account menu, language switcher) and `SiteFooter`. **No
  route-group refactor** — everything renders in the page body. This is the key
  simplification over the earlier immersive-shell idea, which was rejected.
- **Bounded split card.** A centered, rounded card floating in the page:
  - **Left brand panel** (`hidden md:flex`): wand-and-spark mark on the
    indigo→midnight Reveal-Glow gradient with a gold glow + short tagline.
  - **Right form column**: heading, subtitle, fields, primary button, cross-link.
  - Below `md` the brand panel drops; the card becomes a single form column.
- **Button copy.** Email step: `Login` (login) / `Register` (register). Code step
  keeps **`Verify`**.
- **Segmented OTP.** Six separate boxes via shadcn `input-otp` (the `input-otp`
  package). Numeric, paste-aware, keyboard-navigable.
- **Passwordless OTP flow unchanged** (email → 6-digit code). No auth-logic changes.

## Architecture

### Components (all under the existing navbar/footer)

- **New `auth-card.tsx`** (`'use client'`) — the bounded split card: brand panel
  (left) + form (right), centered in the page with vertical padding. Renders
  `<AuthForm mode>` in the form column. `login/page.tsx` and `register/page.tsx`
  render `<AuthCard mode=… />`.
- **`auth-form.tsx`** (edit) — remove the current `min-h-[60vh]/max-w-sm`
  wrapper (the card owns layout). Email step: keep react-hook-form + `register()`,
  add shadcn `Label`s, rename button. Code step: **segmented OTP** (below).
- **New `src/components/ui/input-otp.tsx`** — shadcn `InputOTP` primitive
  (`InputOTP`, `InputOTPGroup`, `InputOTPSlot`), backed by the `input-otp` npm
  package.

### Code step — why local state, not react-hook-form

`auth-form.tsx` documents that controlled/`Controller`-bound inputs stop updating
under React 19 across its two-`useForm` step swap; it uses raw `register()`.
`InputOTP` is inherently controlled. To avoid reintroducing that bug, the code
step drops `codeForm` (react-hook-form) and instead:

- holds the code in `useState<string>` bound to `<InputOTP value onChange>`,
- validates on submit with the existing `makeCodeSchema` (`safeParse`) so the
  same i18n messages apply,
- tracks `badCode` / submit errors and `isSubmitting` in local `useState`.

The **email step keeps react-hook-form unchanged** (username-taken / no-account
checks, field errors). Only the code step changes binding strategy.

## i18n

`messages/{en,de}.json` → `auth`:
- add `login` (`Login` / `Anmelden`)
- add `panelTagline` (brand panel copy)
- (optional) `differentEmail` for a "← use a different email" affordance
- remove `sendCode` (now unused)

## Testing

- `auth-form.test.tsx`:
  - submit-button queries `Send code` → `Login` / `Register`
  - email/username via `getByLabelText`
  - OTP: type into the segmented input (query by its accessible role/label) and
    assert `verify` runs → `updateUser` called with the username.
  - add a case asserting six OTP slots render on the code step.
- `legal-i18n-parity` test keeps en/de key parity (add/remove keys in both).
- Verify: `npm run typecheck`, `npm test -w web`, `npm run lint -w web`,
  `npm run build -w web`, plus a dev smoke check of `/login` and `/register`.

## Out of scope

- Route-group / layout refactor (navbar stays, so unnecessary).
- Any change to the auth server actions, OTP delivery, or session handling.
