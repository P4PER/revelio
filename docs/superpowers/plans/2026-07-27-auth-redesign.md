# Login & Register Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/login` and `/register` into a branded bounded split card (navbar/footer stay visible), rename the email-step button to **Login/Register**, and replace the plain code field with a real segmented 6-box OTP.

**Architecture:** A new client `AuthCard` renders a centered rounded card in the normal page body — left brand panel (Reveal-Glow gradient + wand mark, `hidden md:flex`), right form column. The existing `AuthForm` is restyled: the **email step keeps react-hook-form**; the **code step switches to `useState` + shadcn `InputOTP`** (a controlled component, so it must NOT use react-hook-form's `Controller` — that reintroduces a documented React 19 bug across the form's two-step swap). No route/layout changes: the global `SiteHeader`/`SiteFooter` already render on these routes via `[locale]/layout.tsx`.

**Tech Stack:** Next.js 16 (App Router, React 19.2), next-intl, react-hook-form + zod, shadcn/Radix + Tailwind v4, `input-otp` 1.4.2.

## Global Constraints

- All app commands run from `app/`. Single test file: `npm test -w web -- <path>`.
- Conventional Commits.
- Button copy: email step is `Login` (login mode) / `Register` (register mode); code step stays `Verify`. German: `Anmelden` / `Registrieren` / `Bestätigen`.
- Two-Meilisearch-key / auth-action rules are untouched — this plan changes **no** server actions or auth logic.
- The code step MUST NOT bind `InputOTP` through react-hook-form `Controller` (React 19 unmount/mount bug — see `auth-form.tsx` header comment). Use local `useState`.
- next-intl: `messages/en.json` and `messages/de.json` must keep identical key sets.
- Do not remove/regenerate anything under `db/drizzle/` (irrelevant here but repo-wide rule).

---

### Task 1: shadcn `InputOTP` primitive

**Files:**
- Modify: `app/web/package.json` (add `input-otp` dependency)
- Create: `app/web/src/components/ui/input-otp.tsx`
- Modify: `app/web/src/app/[locale]/globals.css` (add `caret-blink` keyframe used by the slot caret)
- Test: `app/web/src/components/ui/__tests__/input-otp.test.tsx`

**Interfaces:**
- Produces: `InputOTP`, `InputOTPGroup`, `InputOTPSlot` from `@/components/ui/input-otp`. `InputOTP` accepts `OTPInput` props (`maxLength`, `value`, `onChange`, `pattern`, `containerClassName`, plus forwarded input props like `id`, `aria-invalid`). Each rendered `InputOTPSlot` is a `<div data-slot="input-otp-slot">`.

- [ ] **Step 1: Install the dependency**

Run (from `app/`):
```bash
npm install input-otp@^1.4.2 -w web
```
Expected: `input-otp` added to `app/web/package.json` dependencies and `app/package-lock.json` updated.

- [ ] **Step 2: Write the failing test**

Create `app/web/src/components/ui/__tests__/input-otp.test.tsx`:
```tsx
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../input-otp'

describe('InputOTP', () => {
  it('renders one slot per index', () => {
    const { container } = render(
      <InputOTP maxLength={6} value="" onChange={() => {}}>
        <InputOTPGroup>
          {Array.from({ length: 6 }, (_, i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>,
    )
    expect(container.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6)
  })

  it('forwards id to the underlying input for label association', () => {
    const { container } = render(
      <InputOTP maxLength={6} value="" onChange={() => {}} id="code">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
        </InputOTPGroup>
      </InputOTP>,
    )
    expect(container.querySelector('input#code')).not.toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `app/`):
```bash
npm test -w web -- src/components/ui/__tests__/input-otp.test.tsx
```
Expected: FAIL — cannot resolve `../input-otp`.

- [ ] **Step 4: Create the component**

Create `app/web/src/components/ui/input-otp.tsx`:
```tsx
'use client'

import * as React from 'react'
import { OTPInput, OTPInputContext } from 'input-otp'

import { cn } from '@/lib/utils'

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        'flex items-center gap-2 has-disabled:opacity-50',
        containerClassName,
      )}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn('flex items-center', className)}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<'div'> & { index: number }) {
  const ctx = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = ctx?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        'relative flex h-12 w-11 items-center justify-center border-y border-r border-input text-lg font-medium tabular-nums shadow-xs transition-all outline-none',
        'first:rounded-l-md first:border-l last:rounded-r-md',
        'data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50',
        'aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot }
```

- [ ] **Step 5: Add the caret-blink keyframe**

In `app/web/src/app/[locale]/globals.css`, inside the existing `@theme inline { … }` block add the animation token (next to the other `--…` entries):
```css
  --animate-caret-blink: caret-blink 1.25s ease-out infinite;
```
Then, after the `@theme inline { … }` block closes, add the keyframes:
```css
@keyframes caret-blink {
  0%, 70%, 100% { opacity: 1; }
  20%, 50% { opacity: 0; }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `app/`):
```bash
npm test -w web -- src/components/ui/__tests__/input-otp.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add app/web/package.json app/package-lock.json app/web/src/components/ui/input-otp.tsx app/web/src/app/\[locale\]/globals.css app/web/src/components/ui/__tests__/input-otp.test.tsx
git commit -m "feat(web): add shadcn InputOTP primitive"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `app/web/messages/en.json` (`auth` block)
- Modify: `app/web/messages/de.json` (`auth` block)
- Test: `app/web/src/components/__tests__/auth-i18n.test.ts`

**Interfaces:**
- Produces: `auth.login`, `auth.panelTagline`, `auth.differentEmail` in both locales; `auth.sendCode` removed from both. `auth.code`, `auth.verify`, `auth.codeSent`, `validation.sixDigits` already exist and are reused.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/auth-i18n.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

describe('auth i18n', () => {
  it('has the new keys and dropped sendCode in both locales', () => {
    for (const m of [en, de]) {
      expect(m.auth.login).toBeTruthy()
      expect(m.auth.panelTagline).toBeTruthy()
      expect(m.auth.differentEmail).toBeTruthy()
      expect('sendCode' in m.auth).toBe(false)
    }
  })

  it('keeps identical auth key sets across locales', () => {
    expect(Object.keys(en.auth).sort()).toEqual(Object.keys(de.auth).sort())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app/`):
```bash
npm test -w web -- src/components/__tests__/auth-i18n.test.ts
```
Expected: FAIL — `m.auth.login` undefined / `sendCode` still present.

- [ ] **Step 3: Edit `en.json`**

In `app/web/messages/en.json`, in the `auth` object: replace the line
```json
    "sendCode": "Send code",
```
with
```json
    "login": "Login",
```
and add, after the `"registerSubtitle": …` line:
```json
    "panelTagline": "The charm that reveals what's hidden.",
    "differentEmail": "Use a different email",
```

- [ ] **Step 4: Edit `de.json`**

In `app/web/messages/de.json`, in the `auth` object: replace the line
```json
    "sendCode": "Code senden",
```
with
```json
    "login": "Anmelden",
```
and add, after the `"registerSubtitle": …` line:
```json
    "panelTagline": "Der Zauber, der das Verborgene enthüllt.",
    "differentEmail": "Andere E-Mail verwenden",
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `app/`):
```bash
npm test -w web -- src/components/__tests__/auth-i18n.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json app/web/src/components/__tests__/auth-i18n.test.ts
git commit -m "i18n(web): add login/panelTagline/differentEmail, drop sendCode"
```

---

### Task 3: Rework `AuthForm` (labels, button rename, segmented OTP)

**Files:**
- Modify: `app/web/src/components/auth-form.tsx`
- Test: `app/web/src/components/__tests__/auth-form.test.tsx` (update existing)

**Interfaces:**
- Consumes: `InputOTP`, `InputOTPGroup`, `InputOTPSlot` (Task 1); `auth.login`, `auth.code`, `auth.differentEmail` (Task 2); existing `makeEmailStepSchema`, `makeCodeSchema` from `@/lib/schemas/auth`; `REGEXP_ONLY_DIGITS` from `input-otp`.
- Produces: `AuthForm({ mode })` renders a layout-neutral `<div>` (no page wrapper) — an `AuthCard` (Task 4) provides width/placement.

- [ ] **Step 1: Update the existing tests (write the failing spec)**

In `app/web/src/components/__tests__/auth-form.test.tsx`, replace the four occurrences of `screen.getByRole('button', { name: 'Send code' })` — the button is now mode-specific — and switch field lookups to labels. Apply these edits:

Replace the first two `it(...)` blocks:
```tsx
  it('register mode shows a username field and links to sign in', () => {
    renderForm('register')
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('login mode has no username field and links to register', () => {
    renderForm('login')
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument()
  })
```

Replace the "required error" test:
```tsx
  it('shows a required error under email when submitting empty (login)', async () => {
    renderForm('login')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByText(en.validation.required)).toBeInTheDocument()
    expect(sendVerificationOtp).not.toHaveBeenCalled()
  })
```

Replace the "unknown email" test's typing + click:
```tsx
    await userEvent.type(screen.getByLabelText('Email'), 'ghost@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))
```

Replace the "taken username" test's typing + click:
```tsx
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Username'), 'hermione')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
```

Replace the "sets username after verifying" test body:
```tsx
  it('register sets the username AND displayUsername (original casing) after verifying', async () => {
    renderForm('register')
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Username'), 'Hermione')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))
    await userEvent.type(screen.getByLabelText('Verification code'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(updateUser).toHaveBeenCalledWith({ username: 'Hermione', displayUsername: 'Hermione' })
  })
```

Add two new tests at the end of the `describe`:
```tsx
  it('login submit button reads "Login"; register reads "Register"', () => {
    const { unmount } = renderForm('login')
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    unmount()
    renderForm('register')
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
  })

  it('renders six OTP slots on the code step', async () => {
    const { container } = renderForm('login')
    await userEvent.type(screen.getByLabelText('Email'), 'known@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))
    await screen.findByLabelText('Verification code')
    expect(container.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `app/`):
```bash
npm test -w web -- src/components/__tests__/auth-form.test.tsx
```
Expected: FAIL — button name `Login` not found / `getByLabelText('Email')` finds nothing (no labels yet).

- [ ] **Step 3: Rework the imports and code-step state**

In `app/web/src/components/auth-form.tsx`, update the imports block to add `Label`, the OTP primitive, and the digit regexp, and drop nothing else:
```tsx
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { FieldError } from '@/components/ui/field-error'
import { makeEmailStepSchema, makeCodeSchema } from '@/lib/schemas/auth'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
```

Remove the `codeForm` react-hook-form instance and add local state for the code step. Replace this block:
```tsx
  const codeForm = useForm<{ code: string }>({
    resolver: zodResolver(makeCodeSchema((k) => tv(k))),
    defaultValues: { code: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
```
with:
```tsx
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
```

- [ ] **Step 4: Rewrite the `verify` function**

Replace the whole `verify` function:
```tsx
  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setCodeError(null)
    const parsed = makeCodeSchema((k) => tv(k)).safeParse({ code })
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? tv('sixDigits'))
      return
    }
    setVerifying(true)
    const { error } = await authClient.signIn.emailOtp({ email, otp: code })
    if (error) {
      setVerifying(false)
      setCodeError(t('badCode'))
      return
    }
    if (register) {
      const name = emailForm.getValues('name') ?? ''
      const { error: updateError } = await authClient.updateUser({ username: name, displayUsername: name })
      if (updateError) {
        setVerifying(false)
        setCodeError(t('usernameTaken'))
        return
      }
    }
    // Refresh so server components (e.g. the header) re-render with the new
    // session cookie — without this the header keeps its logged-out state.
    router.push('/')
    router.refresh()
  }
```

- [ ] **Step 5: Rewrite the returned JSX**

Replace the entire `return ( … )` block:
```tsx
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
        {register ? t('registerTitle') : t('title')}
      </h1>
      {step === 'email' && (
        <p className="mb-6 text-sm text-muted-foreground">
          {register
            ? t('registerSubtitle', { brand: BRAND_NAME })
            : t('subtitle', { brand: BRAND_NAME })}
        </p>
      )}
      {step === 'email' ? (
        <form onSubmit={emailForm.handleSubmit(requestCode)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="h-11 text-base md:text-base"
              aria-invalid={!!emailForm.formState.errors.email}
              {...emailForm.register('email')}
            />
            <FieldError>{emailForm.formState.errors.email?.message}</FieldError>
          </div>
          {register && (
            <div className="space-y-1.5">
              <Label htmlFor="username">{t('username')}</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="e.g. hermione_g"
                className="h-11 text-base md:text-base"
                aria-invalid={!!emailForm.formState.errors.name}
                {...emailForm.register('name')}
              />
              <FieldError>{emailForm.formState.errors.name?.message}</FieldError>
            </div>
          )}
          <FieldError>{emailForm.formState.errors.root?.message}</FieldError>
          <Button type="submit" disabled={emailForm.formState.isSubmitting} className="h-11 w-full text-base">
            {register ? t('register') : t('login')}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <p className="text-sm text-muted-foreground">{t('codeSent', { email })}</p>
          <div className="space-y-1.5">
            <Label htmlFor="code">{t('code')}</Label>
            <InputOTP
              id="code"
              maxLength={6}
              value={code}
              onChange={setCode}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoComplete="one-time-code"
              containerClassName="justify-center"
              aria-invalid={!!codeError}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <FieldError>{codeError}</FieldError>
          </div>
          <Button type="submit" disabled={verifying} className="h-11 w-full text-base">
            {t('verify')}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setCode('')
              setCodeError(null)
            }}
            className="mx-auto block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            &larr; {t('differentEmail')}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {register ? (
          <>
            {t('haveAccount')}{' '}
            <Link href="/login" className="text-foreground underline">{t('signIn')}</Link>
          </>
        ) : (
          <>
            {t('noAccount')}{' '}
            <Link href="/register" className="text-foreground underline">{t('register')}</Link>
          </>
        )}
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Update the header comment**

Replace the file's leading doc comment (lines describing `register()` vs `Controller`) with an updated version that also covers the code step:
```tsx
// Shared passwordless (email OTP) form. `register` collects a username and sets
// it after verification; `login` is email-only. Both cross-link to the other.
//
// The email step uses react-hook-form with uncontrolled register() (NOT
// <Controller>): the form swaps between the email and code step, and
// Controller-bound inputs stop updating after that unmount/mount under React 19.
// The code step is a controlled segmented OTP (InputOTP), so it is kept OUT of
// react-hook-form entirely — the value lives in local useState and is validated
// with makeCodeSchema on submit.
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (from `app/`):
```bash
npm test -w web -- src/components/__tests__/auth-form.test.tsx
```
Expected: PASS (all cases, including the two new OTP/button tests).

- [ ] **Step 8: Commit**

```bash
git add app/web/src/components/auth-form.tsx app/web/src/components/__tests__/auth-form.test.tsx
git commit -m "feat(web): segmented OTP + Login/Register button in auth form"
```

---

### Task 4: `AuthCard` bounded split card + wire pages

**Files:**
- Create: `app/web/src/components/auth-card.tsx`
- Modify: `app/web/src/app/[locale]/login/page.tsx`
- Modify: `app/web/src/app/[locale]/register/page.tsx`
- Test: `app/web/src/components/__tests__/auth-card.test.tsx`

**Interfaces:**
- Consumes: `AuthForm` (Task 3); `auth.panelTagline` (Task 2); `BRAND_NAME` from `@/lib/brand`.
- Produces: `AuthCard({ mode: 'login' | 'register' })` — a client component rendering the centered split card with `<AuthForm mode>` inside.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/auth-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'

// Stub AuthForm so the card renders in isolation (no auth-client mocking needed).
vi.mock('@/components/auth-form', () => ({
  AuthForm: ({ mode }: { mode: string }) => <div data-testid="auth-form">{mode}</div>,
}))

import { AuthCard } from '../auth-card'

function renderCard(mode: 'login' | 'register') {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AuthCard mode={mode} />
    </NextIntlClientProvider>,
  )
}

describe('AuthCard', () => {
  it('renders the brand tagline and the form for the given mode', () => {
    renderCard('login')
    expect(screen.getByText(en.auth.panelTagline)).toBeInTheDocument()
    expect(screen.getByTestId('auth-form')).toHaveTextContent('login')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app/`):
```bash
npm test -w web -- src/components/__tests__/auth-card.test.tsx
```
Expected: FAIL — cannot resolve `../auth-card`.

- [ ] **Step 3: Create the component**

Create `app/web/src/components/auth-card.tsx`:
```tsx
'use client'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { AuthForm } from './auth-form'

// Bounded split card for /login and /register. Sits inside the normal page
// (the global SiteHeader/SiteFooter stay). Left: a branded Reveal-Glow panel
// (hidden below md). Right: the form. login/register pages render this.
export function AuthCard({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('auth')
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 md:py-20">
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-xl md:grid-cols-[0.9fr_1.1fr]">
        <aside
          className="relative hidden flex-col items-center justify-center gap-5 p-8 text-center md:flex"
          style={{
            background:
              'radial-gradient(360px 360px at 50% 45%, rgba(232,178,58,0.20), transparent 62%),' +
              'linear-gradient(150deg, #2A2570, #161436 70%)',
          }}
        >
          <Image
            src="/revelio-icon.svg"
            alt=""
            width={120}
            height={120}
            priority
            className="h-24 w-auto drop-shadow-[0_0_30px_rgba(232,178,58,0.5)]"
          />
          <p className="text-lg leading-snug font-semibold tracking-tight text-balance text-foreground">
            {t('panelTagline')}
          </p>
        </aside>
        <div className="p-8 sm:p-10">
          <AuthForm mode={mode} />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Wire the pages**

In `app/web/src/app/[locale]/login/page.tsx`, replace the `AuthForm` import and usage:
```tsx
import { AuthCard } from '@/components/auth-card'
```
```tsx
export default function LoginPage() {
  return <AuthCard mode="login" />
}
```

In `app/web/src/app/[locale]/register/page.tsx`, the same:
```tsx
import { AuthCard } from '@/components/auth-card'
```
```tsx
export default function RegisterPage() {
  return <AuthCard mode="register" />
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `app/`):
```bash
npm test -w web -- src/components/__tests__/auth-card.test.tsx
```
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/auth-card.tsx app/web/src/components/__tests__/auth-card.test.tsx app/web/src/app/\[locale\]/login/page.tsx app/web/src/app/\[locale\]/register/page.tsx
git commit -m "feat(web): bounded split AuthCard for login/register"
```

---

### Task 5: Full verification

**Files:** none (integration gate).

- [ ] **Step 1: Typecheck**

Run (from `app/`):
```bash
npm run typecheck
```
Expected: PASS across all workspaces. (If web fails on stale `.next/types`, run `npx next typegen` in `app/web` first, then re-run.)

- [ ] **Step 2: Full web test suite**

Run (from `app/`):
```bash
npm test -w web
```
Expected: PASS — all suites green, including the new `input-otp`, `auth-i18n`, `auth-card`, and updated `auth-form` tests.

- [ ] **Step 3: Lint**

Run (from `app/`):
```bash
npm run lint -w web
```
Expected: 0 errors (pre-existing warnings unrelated to these files are acceptable).

- [ ] **Step 4: Production build**

Run (from `app/`) with placeholder env (build-time `NEXT_PUBLIC_*` must be present):
```bash
NEXT_PUBLIC_BASE_URL=https://revelio.cards NEXT_PUBLIC_IMAGE_BASE_URL=https://img.revelio.cards \
DATABASE_URL=postgres://u:p@localhost:5432/db BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=https://revelio.cards \
MEILI_HOST=http://localhost:7700 MEILI_SEARCH_KEY=x MEILI_WRITE_KEY=x \
ADMIN_EMAILS=a@b.c CONTACT_EMAIL=a@b.c MAIL_FROM=a@b.c GITHUB_URL=https://x \
npm run build -w web
```
Expected: build succeeds; `/[locale]/login` and `/[locale]/register` listed in the route output.

- [ ] **Step 5: Dev smoke check**

Run (from `app/`): `npm run dev -w web`, then open `http://localhost:3000/en/login` and `/en/register`. Confirm: navbar + footer visible; split card with brand panel (≥768px) and form; **Login/Register** button; entering an email advances to a **6-box** OTP; the "← use a different email" link returns to the email step. Stop the server when done.

- [ ] **Step 6: Final commit (if any smoke-fix tweaks were needed)**

```bash
git add -A
git commit -m "chore(web): auth redesign verification tweaks"
```
(Skip if nothing changed.)

---

## Notes for the implementer

- **Do not** convert the code step to react-hook-form/`Controller`. The local-`useState` approach is deliberate (React 19 bug — see the `auth-form.tsx` header comment).
- `emailForm` stays mounted across both steps, so `emailForm.getValues('name')` in `verify` still works.
- The `AuthCard` gradient uses brand hexes directly (documented Reveal-Glow palette) because the radial glow needs alpha the CSS tokens don't carry.
- No route/layout changes: `SiteHeader`/`SiteFooter` already render on these routes via `[locale]/layout.tsx`.
- **OTP typing in jsdom:** if `userEvent.type(getByLabelText('Verification code'), '123456')` does not propagate to the controlled `InputOTP` in Task 3's tests, replace it with a direct change event on the same element:
  ```tsx
  import { fireEvent } from '@testing-library/react'
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } })
  ```
  `input-otp` fires its `onChange` from the underlying input's change event, so this sets the code reliably.
