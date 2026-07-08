# Form Validation with Inline Errors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every relevant form in `app/web` proper validation with error messages rendered directly under the offending input (especially for missing required fields), consistently styled, accessible, and internationalized.

**Architecture:** Two tiers. Classic forms (Auth, Set, Localization, Rulings) migrate to `react-hook-form` + `@hookform/resolvers/zod` + a new canonical shadcn `ui/form.tsx`; per-field errors render via `<FormMessage>`. Non-classic inputs (deck import, deck-list rename, filter cost-range, uploaders) keep their bespoke state and gain inline errors via a small shared `<FieldError>` component. Toasts remain only for success and genuine non-field failures. Zod schema shapes live in shared `lib/schemas/` modules imported by both client and server so they never drift.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `react-hook-form`, `@hookform/resolvers`, `zod` (already present), `next-intl`, shadcn/Radix (`radix-ui` unified package), Tailwind v4, Vitest + Testing Library (`vitest.config.ts`, `vitest.setup.ts` already configured with jsdom + jest-dom).

## Global Constraints

- All commands run from `app/` (npm workspaces root). Web workspace is `-w web`.
- Radix primitives are imported from the unified `radix-ui` package, used as namespaces: `import { Slot } from "radix-ui"` → `Slot.Root`; `import { Label as LabelPrimitive } from "radix-ui"` → `LabelPrimitive.Root`.
- Path alias: `@/` → `app/web/src/`. Locale-aware nav via `@/../i18n/navigation` (never bare `next/link`).
- Every user-visible string goes through `next-intl` `useTranslations`. Add new keys to **both** `app/web/messages/en.json` and `app/web/messages/de.json` (identical key sets — CI/tests import `en.json`).
- Server Actions (`'use server'`, files in `src/lib/*-actions.ts`) stay authoritative: they keep calling `safeParse` and returning `{ ok: false, error: '<code>' }`. Never leak secrets to the client.
- shadcn `Input`/`Select`/`Checkbox`/`Button` already ship `aria-invalid:*` destructive styling — setting `aria-invalid` activates it for free.
- After every task: `npm test -w web` (all green), `npm run typecheck`, `npm run lint -w web` (0 new errors). The pre-existing `useReactTable` React-Compiler lint warning is unrelated and may remain.
- Conventional Commits. Commit at the end of each task.

---

## File structure

**New files:**
- `app/web/src/components/ui/form.tsx` — canonical shadcn Form primitives (RHF-backed).
- `app/web/src/components/ui/field-error.tsx` — standalone inline error line for non-RHF inputs.
- `app/web/src/lib/schemas/auth.ts` — auth field schema factory.
- `app/web/src/lib/schemas/set.ts` — set create/write schema factories.
- `app/web/src/lib/schemas/localization.ts` — localization schema factory.
- `app/web/src/lib/schemas/rulings.ts` — client-side strict rulings schema factory.
- `app/web/src/components/ui/__tests__/field-error.test.tsx` — FieldError test.

**Modified files:**
- `app/web/messages/en.json`, `app/web/messages/de.json` — add `validation` namespace + a few form keys.
- `app/web/src/components/auth-form.tsx` (+ `__tests__/auth-form.test.tsx`)
- `app/web/src/components/set-form.tsx` (+ new test) and `app/web/src/lib/set-actions.ts`
- `app/web/src/components/localization-form.tsx` (+ existing tests) and `app/web/src/lib/localization-actions.ts`
- `app/web/src/components/rulings-editor.tsx` (+ existing/new test)
- `app/web/src/components/image-uploader.tsx`, `app/web/src/components/set-symbol-uploader.tsx`
- `app/web/src/components/deck-import-dialog.tsx` (+ existing deck tests)
- `app/web/src/components/filter-sheet.tsx`
- `app/web/src/components/deck-list.tsx`
- `app/web/src/components/subtype-translations-form.tsx`

---

## Task 1: Foundation — deps, `ui/form.tsx`, `ui/field-error.tsx`, `validation` i18n

**Files:**
- Modify: `app/web/package.json` (dependencies)
- Create: `app/web/src/components/ui/form.tsx`
- Create: `app/web/src/components/ui/field-error.tsx`
- Create: `app/web/src/components/ui/__tests__/field-error.test.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`

**Interfaces:**
- Produces (form.tsx): `Form` (= RHF `FormProvider`), `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`. `FormField` takes RHF `ControllerProps`. `FormControl` renders `Slot.Root` and injects `id`, `aria-describedby`, `aria-invalid`. `FormMessage` renders the field error text under the control.
- Produces (field-error.tsx): `FieldError({ id?, children }: { id?: string; children?: React.ReactNode })` — renders `<p role="alert" className="text-destructive text-sm">` when `children` is truthy, else `null`.
- Produces (i18n): `validation.*` keys usable via `useTranslations('validation')`.

- [ ] **Step 1: Install dependencies**

Run (from `app/`):
```bash
npm install -w web react-hook-form @hookform/resolvers
```
Expected: `app/web/package.json` gains `"react-hook-form"` and `"@hookform/resolvers"` under `dependencies`; `app/package-lock.json` updates.

- [ ] **Step 2: Write the FieldError failing test**

Create `app/web/src/components/ui/__tests__/field-error.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FieldError } from '../field-error'

describe('FieldError', () => {
  it('renders nothing when no message', () => {
    const { container } = render(<FieldError />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the message as an alert', () => {
    render(<FieldError>Something is missing</FieldError>)
    const el = screen.getByRole('alert')
    expect(el).toHaveTextContent('Something is missing')
    expect(el).toHaveClass('text-destructive')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w web -- src/components/ui/__tests__/field-error.test.tsx`
Expected: FAIL — cannot resolve `../field-error`.

- [ ] **Step 4: Implement FieldError**

Create `app/web/src/components/ui/field-error.tsx`:
```tsx
import { cn } from '@/lib/utils'

// Standalone inline error line for inputs that are NOT backed by react-hook-form
// (uploaders, deck import, filter range, inline rename). Matches <FormMessage>
// styling so field errors look identical everywhere. Renders nothing when empty.
export function FieldError({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children?: React.ReactNode
}) {
  if (!children) return null
  return (
    <p id={id} role="alert" className={cn('text-destructive text-sm', className)}>
      {children}
    </p>
  )
}
```

- [ ] **Step 5: Run the FieldError test to verify it passes**

Run: `npm test -w web -- src/components/ui/__tests__/field-error.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Create the shadcn Form primitive**

Create `app/web/src/components/ui/form.tsx` (canonical shadcn Form adapted to this repo's `radix-ui` unified imports):
```tsx
'use client'
import * as React from 'react'
import { Slot } from 'radix-ui'
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { name: TName }

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue)

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

type FormItemContextValue = { id: string }
const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue)

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) throw new Error('useFormField should be used within <FormField>')

  const { id } = itemContext
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

function FormItem({ className, ...props }: React.ComponentProps<'div'>) {
  const id = React.useId()
  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn('space-y-1.5', className)} {...props} />
    </FormItemContext.Provider>
  )
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField()
  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn('data-[error=true]:text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    />
  )
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  return (
    <Slot.Root
      data-slot="form-control"
      id={formItemId}
      aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  )
}

function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField()
  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function FormMessage({ className, ...props }: React.ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? '') : props.children
  if (!body) return null
  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      role="alert"
      className={cn('text-destructive text-sm', className)}
      {...props}
    >
      {body}
    </p>
  )
}

export {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  useFormField,
}
```

- [ ] **Step 7: Add the `validation` i18n namespace + form keys (en)**

In `app/web/messages/en.json`, add a top-level `"validation"` block and a couple of per-form keys. Insert `validation` (alphabetical placement not required — append before the closing brace is fine):
```json
"validation": {
  "required": "This field is required.",
  "email": "Enter a valid email address.",
  "sixDigits": "Enter the 6-digit code.",
  "usernameTaken": "That username is taken.",
  "noAccount": "No account exists for that email.",
  "codeExists": "A set with that code already exists.",
  "fileType": "Choose an image file.",
  "fileSize": "The image must be 5 MB or smaller.",
  "costRange": "Min cost must not exceed max cost.",
  "saveFailed": "Could not save. Please try again."
}
```

- [ ] **Step 8: Add the same keys to de.json**

In `app/web/messages/de.json`, add the identical block with German copy:
```json
"validation": {
  "required": "Dieses Feld ist erforderlich.",
  "email": "Gib eine gültige E-Mail-Adresse ein.",
  "sixDigits": "Gib den 6-stelligen Code ein.",
  "usernameTaken": "Dieser Benutzername ist vergeben.",
  "noAccount": "Für diese E-Mail existiert kein Konto.",
  "codeExists": "Ein Set mit diesem Code existiert bereits.",
  "fileType": "Wähle eine Bilddatei.",
  "fileSize": "Das Bild darf höchstens 5 MB groß sein.",
  "costRange": "Min-Kosten dürfen die Max-Kosten nicht überschreiten.",
  "saveFailed": "Speichern fehlgeschlagen. Bitte erneut versuchen."
}
```

- [ ] **Step 9: Verify messages parse and types compile**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('web/messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('web/messages/de.json','utf8'));console.log('ok')"
npm run typecheck
```
Expected: `ok`, and typecheck passes (form.tsx compiles).

- [ ] **Step 10: Run the full web test suite**

Run: `npm test -w web`
Expected: all pass (previous suite + 2 new FieldError tests).

- [ ] **Step 11: Commit**

```bash
git add app/web/package.json app/package-lock.json app/web/src/components/ui/form.tsx app/web/src/components/ui/field-error.tsx app/web/src/components/ui/__tests__/field-error.test.tsx app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): add react-hook-form, shadcn Form + FieldError primitives, validation i18n"
```

---

## Task 2: Auth form — per-field inline errors (RHF)

**Files:**
- Create: `app/web/src/lib/schemas/auth.ts`
- Modify: `app/web/src/components/auth-form.tsx`
- Modify: `app/web/src/components/__tests__/auth-form.test.tsx`

**Interfaces:**
- Consumes: `Form, FormField, FormItem, FormControl, FormMessage` from `@/components/ui/form`; `useTranslations('validation')`.
- Produces (auth.ts): `makeEmailStepSchema(t)` → zod object `{ email: string, name?: string }` with `email` required+email and (register) `name` required; `makeCodeSchema(t)` → `{ code: string }` required + `^[0-9]{6}$`. `t` is `(key: string) => string`.

- [ ] **Step 1: Create the auth schema factory**

Create `app/web/src/lib/schemas/auth.ts`:
```ts
import { z } from 'zod'

type T = (key: string) => string

// Email-step schema. In register mode `name` (username) is required; login mode
// omits it. Availability/existence are checked server-side and mapped to fields.
export function makeEmailStepSchema(t: T, register: boolean) {
  return z.object({
    email: z.string().trim().min(1, t('required')).email(t('email')),
    name: register ? z.string().trim().min(1, t('required')) : z.string().optional(),
  })
}

export function makeCodeSchema(t: T) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, t('required'))
      .regex(/^[0-9]{6}$/, t('sixDigits')),
  })
}
```

- [ ] **Step 2: Write the failing test — empty submit shows a required error under email**

Add to `app/web/src/components/__tests__/auth-form.test.tsx` (new `it` inside the existing `describe`; the file already mocks `authClient`, `auth-actions`, and `i18n/navigation`):
```tsx
it('shows a required error under email when submitting empty (login)', async () => {
  const user = userEvent.setup()
  renderForm('login')
  await user.click(screen.getByRole('button', { name: en.auth.sendCode }))
  expect(await screen.findByText(en.validation.required)).toBeInTheDocument()
  expect(sendVerificationOtp).not.toHaveBeenCalled()
})

it('maps a taken username onto the username field (register)', async () => {
  usernameAvailable.mockResolvedValueOnce(false)
  const user = userEvent.setup()
  renderForm('register')
  await user.type(screen.getByPlaceholderText(en.auth.email), 'a@b.com')
  await user.type(screen.getByPlaceholderText(en.auth.username), 'taken')
  await user.click(screen.getByRole('button', { name: en.auth.sendCode }))
  expect(await screen.findByText(en.validation.usernameTaken)).toBeInTheDocument()
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w web -- src/components/__tests__/auth-form.test.tsx`
Expected: FAIL — no `validation.required` text is rendered (native validation blocks submit or no inline message exists).

- [ ] **Step 4: Rewrite auth-form.tsx to use RHF**

Replace the entire body of `app/web/src/components/auth-form.tsx` with:
```tsx
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import { emailHasAccount, usernameAvailable } from '@/lib/auth-actions'
import { BRAND_NAME } from '@/lib/brand'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form'
import { makeEmailStepSchema, makeCodeSchema } from '@/lib/schemas/auth'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('auth')
  const tv = useTranslations('validation')
  const router = useRouter()
  const register = mode === 'register'
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')

  const emailForm = useForm<{ email: string; name?: string }>({
    resolver: zodResolver(makeEmailStepSchema((k) => tv(k), register)),
    defaultValues: { email: '', name: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const codeForm = useForm<{ code: string }>({
    resolver: zodResolver(makeCodeSchema((k) => tv(k))),
    defaultValues: { code: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  async function requestCode(values: { email: string; name?: string }) {
    // /login is for existing users only — account creation happens via /register.
    if (!register && !(await emailHasAccount(values.email))) {
      emailForm.setError('email', { message: tv('noAccount') })
      return
    }
    // /register: reject a taken username up front (DB unique is the final guard).
    if (register && !(await usernameAvailable(values.name ?? ''))) {
      emailForm.setError('name', { message: tv('usernameTaken') })
      return
    }
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: values.email, type: 'sign-in' })
    if (error) {
      emailForm.setError('root', { message: t('sendFailed') })
      return
    }
    setEmail(values.email)
    setStep('code')
  }

  async function verify(values: { code: string }) {
    const { error } = await authClient.signIn.emailOtp({ email, otp: values.code })
    if (error) {
      codeForm.setError('code', { message: t('badCode') })
      return
    }
    if (register) {
      const name = emailForm.getValues('name') ?? ''
      const { error: updateError } = await authClient.updateUser({ username: name, displayUsername: name })
      if (updateError) {
        codeForm.setError('root', { message: t('usernameTaken') })
        return
      }
    }
    router.push('/')
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold text-primary">
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
        <Form {...emailForm}>
          <form onSubmit={emailForm.handleSubmit(requestCode)} className="space-y-3" noValidate>
            <FormField
              control={emailForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="email" placeholder={t('email')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {register && (
              <FormField
                control={emailForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="text" placeholder={t('username')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {emailForm.formState.errors.root && (
              <p role="alert" className="text-sm text-destructive">{emailForm.formState.errors.root.message}</p>
            )}
            <Button type="submit" disabled={emailForm.formState.isSubmitting} className="w-full">
              {t('sendCode')}
            </Button>
          </form>
        </Form>
      ) : (
        <Form {...codeForm}>
          <form onSubmit={codeForm.handleSubmit(verify)} className="space-y-3" noValidate>
            <p className="text-sm text-muted-foreground">{t('codeSent', { email })}</p>
            <FormField
              control={codeForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input inputMode="numeric" maxLength={6} placeholder="000000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {codeForm.formState.errors.root && (
              <p role="alert" className="text-sm text-destructive">{codeForm.formState.errors.root.message}</p>
            )}
            <Button type="submit" disabled={codeForm.formState.isSubmitting} className="w-full">
              {t('verify')}
            </Button>
          </form>
        </Form>
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
    </main>
  )
}
```

- [ ] **Step 5: Reconcile any pre-existing auth tests**

Existing tests may assert on the old single `text-destructive` paragraph (`noAccountError`, `sendFailed`, `badCode`). Update those assertions to the new messages: `noAccount` errors now use `en.validation.noAccount` (under email), `usernameTaken` uses `en.validation.usernameTaken` (under username), send/verify failures use `en.auth.sendFailed` / `en.auth.badCode` (root paragraph, still `role="alert"`). Where a test typed an invalid email and expected submission, add a valid email so the resolver passes.

- [ ] **Step 6: Run the auth tests to verify they pass**

Run: `npm test -w web -- src/components/__tests__/auth-form.test.tsx`
Expected: PASS (existing + 2 new).

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint -w web`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add app/web/src/lib/schemas/auth.ts app/web/src/components/auth-form.tsx app/web/src/components/__tests__/auth-form.test.tsx
git commit -m "feat(web): auth form per-field inline validation via react-hook-form"
```

---

## Task 3: Set create/edit form — inline errors + `exists` mapping (RHF)

**Files:**
- Create: `app/web/src/lib/schemas/set.ts`
- Modify: `app/web/src/lib/set-actions.ts` (extract inline schemas to the shared module)
- Modify: `app/web/src/components/set-form.tsx`
- Create: `app/web/src/components/__tests__/set-form.test.tsx`

**Interfaces:**
- Consumes: `Form, FormField, FormItem, FormLabel, FormControl, FormMessage` from `@/components/ui/form`.
- Produces (set.ts): `makeSetWriteSchema(t)` → object `{ name, releaseDate, isOfficial, localizations }`; `makeSetCreateSchema(t)` → write + `{ code }`. Both accept `t: (key: string) => string`. `name` (and `code` for create) are `.trim().min(1, t('required'))`.

- [ ] **Step 1: Create the set schema factory**

Create `app/web/src/lib/schemas/set.ts`:
```ts
import { z } from 'zod'

type T = (key: string) => string

export function makeSetWriteSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('required')),
    releaseDate: z.string(),
    isOfficial: z.boolean(),
    localizations: z.record(z.string(), z.string()),
  })
}

export function makeSetCreateSchema(t: T) {
  return makeSetWriteSchema(t).extend({
    code: z.string().trim().min(1, t('required')),
  })
}
```

- [ ] **Step 2: Point the server action at the shared schema (pure extraction)**

In `app/web/src/lib/set-actions.ts`, remove the inline `writeSchema`/`createSchema` definitions and import the factories, calling them with an identity resolver (the server discards messages, so behavior is identical):
```ts
import { makeSetWriteSchema, makeSetCreateSchema } from '@/lib/schemas/set'

const writeSchema = makeSetWriteSchema((k) => k)
const createSchema = makeSetCreateSchema((k) => k)
```
Leave `createSetAction`/`updateSetAction` bodies unchanged (they still `safeParse` and return `{ ok:false, error:'invalid' }` / `'exists'`).

- [ ] **Step 3: Write the failing test — empty name shows a required error, no action call**

Create `app/web/src/components/__tests__/set-form.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createSetAction = vi.fn(async () => ({ ok: true }))
const updateSetAction = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/set-actions', () => ({
  createSetAction: (...a: unknown[]) => createSetAction(...a),
  updateSetAction: (...a: unknown[]) => updateSetAction(...a),
  uploadSetSymbol: vi.fn(),
}))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/components/set-symbol-uploader', () => ({ SetSymbolUploader: () => <div /> }))
vi.mock('@/components/date-picker', () => ({
  DatePicker: (p: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="date" value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}))

import { SetForm } from '../set-form'
import en from '@/../messages/en.json'

const initial = { code: '', name: '', releaseDate: '', isOfficial: false, localizations: { en: '', de: '' } }

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SetForm mode="create" locales={['en', 'de']} initial={initial} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => { createSetAction.mockClear() })

describe('SetForm', () => {
  it('shows required errors and does not call the action when empty', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: en.admin.sets.create }))
    expect(await screen.findAllByText(en.validation.required)).not.toHaveLength(0)
    expect(createSetAction).not.toHaveBeenCalled()
  })

  it('maps a duplicate code onto the code field', async () => {
    createSetAction.mockResolvedValueOnce({ ok: false, error: 'exists' })
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText(en.admin.sets.code), 'base')
    await user.type(screen.getByLabelText(en.admin.sets.name), 'Base Set')
    await user.click(screen.getByRole('button', { name: en.admin.sets.create }))
    expect(await screen.findByText(en.validation.codeExists)).toBeInTheDocument()
  })
})
```
(If `en.admin.sets.create`/`.code`/`.name` differ, use the actual key values.)

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -w web -- src/components/__tests__/set-form.test.tsx`
Expected: FAIL — no required message; action called with empty name.

- [ ] **Step 5: Migrate set-form.tsx to RHF**

Rewrite `app/web/src/components/set-form.tsx`. Keep the same props/`SetFormInitial`, `SetSymbolUploader`, `DatePicker`, and localized-name loop, but drive validation with RHF:
```tsx
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { createSetAction, updateSetAction, uploadSetSymbol } from '@/lib/set-actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/date-picker'
import { SetSymbolUploader } from '@/components/set-symbol-uploader'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { makeSetCreateSchema } from '@/lib/schemas/set'

export type SetFormInitial = {
  code: string
  name: string
  releaseDate: string
  isOfficial: boolean
  localizations: Record<string, string>
}

type Values = {
  code: string
  name: string
  releaseDate: string
  isOfficial: boolean
  localizations: Record<string, string>
}

export function SetForm({
  mode, locales, initial,
}: { mode: 'create' | 'edit'; locales: string[]; initial: SetFormInitial }) {
  const t = useTranslations('admin.sets')
  const tv = useTranslations('validation')
  const router = useRouter()
  const [symbolFile, setSymbolFile] = useState<File | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(makeSetCreateSchema((k) => tv(k))),
    defaultValues: {
      code: initial.code,
      name: initial.name,
      releaseDate: initial.releaseDate,
      isOfficial: initial.isOfficial,
      localizations: Object.fromEntries(locales.map((l) => [l, initial.localizations[l] ?? ''])),
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  async function submit(values: Values) {
    const payload = {
      name: values.name,
      releaseDate: values.releaseDate,
      isOfficial: values.isOfficial,
      localizations: values.localizations,
    }
    const res =
      mode === 'create'
        ? await createSetAction({ code: values.code, ...payload })
        : await updateSetAction(values.code, payload)
    if (res.ok && mode === 'create' && symbolFile) {
      try {
        const fd = new FormData()
        fd.append('code', values.code)
        fd.append('file', symbolFile)
        const up = await uploadSetSymbol(fd)
        if (!up.ok) toast.warning(t('saveError'))
      } catch {
        toast.warning(t('saveError'))
      }
    }
    if (res.ok) {
      toast.success(t(mode === 'create' ? 'created' : 'updated'))
      if (mode === 'create') router.push('/admin/sets')
      else router.refresh()
      return
    }
    if (res.error === 'exists') form.setError('code', { message: tv('codeExists') })
    else toast.error(t('saveError'))
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="max-w-xl space-y-5" noValidate>
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('code')}</FormLabel>
              <FormControl>
                <Input {...field} disabled={mode === 'edit'} aria-label={t('code')} className="font-mono" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input {...field} aria-label={t('name')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="releaseDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('releaseDate')}</FormLabel>
              <FormControl>
                <DatePicker value={field.value} onChange={field.onChange} ariaLabel={t('releaseDate')} placeholder={t('releaseDate')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isOfficial"
          render={({ field }) => (
            <label className="flex items-center gap-2">
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              <span className="text-sm">{t('official')}</span>
            </label>
          )}
        />

        {mode === 'create' && (
          <div className="space-y-1.5">
            <FormLabelPlain>{t('symbol')}</FormLabelPlain>
            <SetSymbolUploader staged stagedFile={symbolFile} onStagedChange={setSymbolFile} />
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t('localizedNames')}</legend>
          {locales.map((l) => (
            <FormField
              key={l}
              control={form.control}
              name={`localizations.${l}` as const}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{l.toUpperCase()}</FormLabel>
                  <FormControl>
                    <Input {...field} aria-label={l.toUpperCase()} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </fieldset>

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t(mode === 'create' ? 'create' : 'save')}
        </Button>
      </form>
    </Form>
  )
}

// The symbol block sits outside a FormField, so it uses a plain shadcn label.
function FormLabelPlain({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-2 text-sm leading-none font-medium">{children}</span>
}
```
Note: in **edit** mode `code` is disabled and pre-filled, so its `.min(1)` always passes.

- [ ] **Step 6: Run the set-form test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/set-form.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint -w web && npm test -w web`
Expected: green. (Confirms the set-actions extraction didn't break existing behavior.)

- [ ] **Step 8: Commit**

```bash
git add app/web/src/lib/schemas/set.ts app/web/src/lib/set-actions.ts app/web/src/components/set-form.tsx app/web/src/components/__tests__/set-form.test.tsx
git commit -m "feat(web): set form inline validation + duplicate-code field error"
```

---

## Task 4: Localization form — inline name error (RHF)

**Files:**
- Create: `app/web/src/lib/schemas/localization.ts`
- Modify: `app/web/src/components/localization-form.tsx`
- Modify: existing localization test(s) under `app/web/src/components/__tests__/` (if present) or create `localization-form.test.tsx`.

**Interfaces:**
- Consumes: `Form, FormField, FormItem, FormControl, FormMessage` from `@/components/ui/form`.
- Preserves: `LocalizationFormHandle = { save: () => Promise<SaveResult> }` and the `embedded` + `ref` orchestration contract used by `card-edit-form.tsx`. `save()` must return `{ ok: false, error: 'invalid' }` when the name is blank (trigger validation first).

- [ ] **Step 1: Create the localization schema factory**

Create `app/web/src/lib/schemas/localization.ts`:
```ts
import { z } from 'zod'

type T = (key: string) => string

// Only `name` is user-required in the form; the rest are optional free text.
export function makeLocalizationSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('required')),
    text: z.string(),
    flavorText: z.string(),
    status: z.enum(['machine', 'official']),
    adventure: z.object({ effect: z.string(), reward: z.string(), toSolve: z.string() }),
    match: z.object({ prize: z.string(), toWin: z.string() }),
  })
}
```

- [ ] **Step 2: Write the failing test — blank name shows a required error under the name field**

Create `app/web/src/components/__tests__/localization-form.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

const updateLocalization = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/localization-actions', () => ({
  updateLocalization: (...a: unknown[]) => updateLocalization(...a),
}))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { LocalizationForm } from '../localization-form'
import en from '@/../messages/en.json'

const initial = {
  name: '', text: '', flavorText: '', status: 'machine' as const,
  adventure: { effect: '', reward: '', toSolve: '' }, match: { prize: '', toWin: '' },
}

describe('LocalizationForm', () => {
  it('shows a required error under name and does not save when blank', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LocalizationForm cardId="c1" lang="en" initial={{ ...initial, name: 'x' }} kind={null} />
      </NextIntlClientProvider>,
    )
    await user.clear(screen.getByLabelText(en.edit.name))
    await user.click(screen.getByRole('button', { name: en.edit.save }))
    expect(await screen.findByText(en.validation.required)).toBeInTheDocument()
    expect(updateLocalization).not.toHaveBeenCalled()
  })
})
```
(The name Input must be associated with `en.edit.name` via `FormLabel`/`htmlFor`. Standalone Save is disabled until `dirty`; the test seeds `name: 'x'` then clears it so the form is dirty.)

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w web -- src/components/__tests__/localization-form.test.tsx`
Expected: FAIL — no inline required message.

- [ ] **Step 4: Migrate localization-form.tsx**

Rewrite `app/web/src/components/localization-form.tsx` to back the **name** field with RHF while keeping the other fields as controlled `useState` (they have no validation) and preserving the `embedded`/`ref` contract. Key changes:
```tsx
'use client'
import { useImperativeHandle } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateLocalization, type SaveResult } from '@/lib/localization-actions'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { makeLocalizationSchema } from '@/lib/schemas/localization'
```
Replace the state block with a single RHF form whose values are the full `Initial` shape; use `form.watch`/`form.setValue` for the free-text fields, or keep separate `useState` for non-name fields and only validate `name`. Recommended minimal approach — keep the existing `useState` for everything, add one RHF form solely for `name`:
```tsx
  const t = useTranslations('edit')
  const tv = useTranslations('validation')
  const router = useRouter()
  const [text, setText] = useState(initial.text)
  const [flavorText, setFlavor] = useState(initial.flavorText)
  const [status, setStatus] = useState<'machine' | 'official'>(initial.status)
  const [adventure, setAdventure] = useState(initial.adventure)
  const [match, setMatch] = useState(initial.match)

  const form = useForm<{ name: string }>({
    resolver: zodResolver(makeLocalizationSchema((k) => tv(k)).pick({ name: true })),
    defaultValues: { name: initial.name },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const name = form.watch('name')

  const dirty =
    name !== initial.name ||
    text !== initial.text ||
    flavorText !== initial.flavorText ||
    status !== initial.status ||
    JSON.stringify(adventure) !== JSON.stringify(initial.adventure) ||
    JSON.stringify(match) !== JSON.stringify(initial.match)

  // Persist just this localization; validate name first so embedding parents get
  // { ok:false, error:'invalid' } without a network call when the name is blank.
  async function save(): Promise<SaveResult> {
    const valid = await form.trigger('name')
    if (!valid) return { ok: false, error: 'invalid' }
    return updateLocalization({
      cardId, lang, name: form.getValues('name'), text, flavorText, status,
      ...(kind === 'adventure' ? { adventure } : {}),
      ...(kind === 'match' ? { match } : {}),
    })
  }

  useImperativeHandle(ref, () => ({ save }))

  async function onSubmit() {
    if (embedded) return
    const res = await save()
    if (!res.ok) return // inline FormMessage already shows the name error
    if (res.warning) toast.warning(t('reindexWarning'))
    else toast.success(t('saved'))
    router.refresh()
  }
```
Wrap the JSX in `<Form {...form}>` and replace the name `<label>`/`<Input>` block with:
```tsx
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
```
Change the outer `<form onSubmit={onSubmit}>` to `<form onSubmit={form.handleSubmit(onSubmit)} noValidate>`. Keep all other fields exactly as they are. The standalone Save button stays `disabled={form.formState.isSubmitting || !dirty}`.

- [ ] **Step 5: Run the localization test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/localization-form.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify the embedded orchestration still works**

Run the card-edit / localization existing tests if any: `npm test -w web -- localization` and `npm test -w web -- card-edit`.
Expected: PASS. `save()` still returns `{ ok:false, error:'invalid' }` for blank names, so `CardEditForm`'s `toast.error(t('invalid'))` path is unchanged.

- [ ] **Step 7: Typecheck, lint, full suite; Commit**

```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/lib/schemas/localization.ts app/web/src/components/localization-form.tsx app/web/src/components/__tests__/localization-form.test.tsx
git commit -m "feat(web): localization form inline required-name validation"
```

---

## Task 5: Rulings editor — per-row required date/source/text (RHF `useFieldArray`)

**Files:**
- Create: `app/web/src/lib/schemas/rulings.ts`
- Modify: `app/web/src/components/rulings-editor.tsx`
- Create: `app/web/src/components/__tests__/rulings-editor.test.tsx`

**Interfaces:**
- Preserves: `RulingsEditorHandle = { save: () => Promise<RulingsSaveResult> }` and `embedded`/`ref` contract used by `card-edit-form.tsx`. `save()` must validate all rows first and return `{ ok: false, error: 'invalid' }` when any present row is incomplete (so the shared Save shows `rulingsFailed` and the inline messages appear).
- Produces (rulings.ts): `makeRulingsSchema(t)` → `{ rows: Array<{ id: string|null; date: min1; source: min1; text: min1 }> }` with `t('required')` messages.

- [ ] **Step 1: Create the client rulings schema (stricter than the server)**

Create `app/web/src/lib/schemas/rulings.ts`:
```ts
import { z } from 'zod'

type T = (key: string) => string

// Client-only gate: every present ruling row must have date, source, and text.
// The server action stays lenient (shape-only) and filters blanks — this is the
// UX guard that surfaces per-field errors before saving.
export function makeRulingsSchema(t: T) {
  return z.object({
    rows: z.array(
      z.object({
        id: z.string().nullable(),
        date: z.string().trim().min(1, t('required')),
        source: z.string().trim().min(1, t('required')),
        text: z.string().trim().min(1, t('required')),
      }),
    ),
  })
}
```

- [ ] **Step 2: Write the failing test — saving an incomplete row shows required errors under its fields**

Create `app/web/src/components/__tests__/rulings-editor.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

const saveRulingsAction = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/rulings-actions', () => ({
  saveRulingsAction: (...a: unknown[]) => saveRulingsAction(...a),
}))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/date-picker', () => ({
  DatePicker: (p: { value: string; onChange: (v: string) => void; ariaLabel?: string }) => (
    <input aria-label={p.ariaLabel} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}))

import { RulingsEditor } from '../rulings-editor'
import en from '@/../messages/en.json'

describe('RulingsEditor', () => {
  it('shows required errors for an incomplete row and does not save', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <RulingsEditor cardId="c1" lang="en" initial={[]} sources={['WotC']} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: en.edit.addRuling }))
    await user.click(screen.getByRole('button', { name: en.edit.saveRulings }))
    expect(await screen.findAllByText(en.validation.required)).not.toHaveLength(0)
    expect(saveRulingsAction).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w web -- src/components/__tests__/rulings-editor.test.tsx`
Expected: FAIL — the empty row saves (or no message appears).

- [ ] **Step 4: Migrate rulings-editor.tsx to RHF `useFieldArray`**

Rewrite `app/web/src/components/rulings-editor.tsx`. Replace `rows` `useState` with `useForm` + `useFieldArray` on a `rows` field, keep add/remove/move via the field-array helpers, and render `FormMessage` under each of date/source/text. Preserve the auto-scroll-to-new-row effect. Skeleton:
```tsx
'use client'
import { useEffect, useImperativeHandle, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { saveRulingsAction, type RulingsSaveResult } from '@/lib/rulings-actions'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { DatePicker } from '@/components/date-picker'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form'
import { makeRulingsSchema } from '@/lib/schemas/rulings'

type Row = { id: string | null; date: string; source: string; text: string }
type Initial = { id: string; date: string; source: string; text: string }
export type RulingsEditorHandle = { save: () => Promise<RulingsSaveResult> }

export function RulingsEditor({
  cardId, lang, initial, sources = [], embedded = false, ref,
}: {
  cardId: string; lang: string; initial: Initial[]; sources?: string[]; embedded?: boolean
  ref?: React.Ref<RulingsEditorHandle>
}) {
  const t = useTranslations('edit')
  const tv = useTranslations('validation')
  const router = useRouter()
  const form = useForm<{ rows: Row[] }>({
    resolver: zodResolver(makeRulingsSchema((k) => tv(k))),
    defaultValues: { rows: initial.map((r) => ({ id: r.id, date: r.date, source: r.source, text: r.text })) },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'rows' })
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pendingScrollKey = useRef<string | null>(null)

  useEffect(() => {
    const key = pendingScrollKey.current
    if (!key) return
    const el = rowRefs.current.get(key)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.querySelector('input')?.focus()
    pendingScrollKey.current = null
  }, [fields])

  async function save(): Promise<RulingsSaveResult> {
    const valid = await form.trigger()
    if (!valid) return { ok: false, error: 'invalid' }
    const rows = form.getValues('rows')
    return saveRulingsAction({
      cardId, lang,
      rulings: rows.map((r) => ({ id: r.id, date: r.date, source: r.source, text: r.text })),
    })
  }
  useImperativeHandle(ref, () => ({ save }))

  async function onSave() {
    const res = await save()
    if (!res.ok) return // inline messages show which fields are missing
    toast.success(t('rulingsSaved'))
    router.refresh()
  }

  return (
    <Form {...form}>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('rulings')}</h2>
          <Button type="button" variant="outline" size="sm"
            onClick={() => { const id = `new-${fields.length}-${Date.now()}`; pendingScrollKey.current = id; append({ id: null, date: '', source: '', text: '' }) }}>
            {t('addRuling')}
          </Button>
        </div>

        {fields.map((f, i) => (
          <div key={f.id} ref={(el) => { if (el) rowRefs.current.set(pendingScrollKey.current ?? f.id, el) }}
            className="space-y-3 rounded-md border p-4">
            <div className="flex items-start justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" aria-label={t('moveUp')} onClick={() => move(i, i - 1)}><ChevronUp className="size-4" /></Button>
              <Button type="button" variant="ghost" size="sm" aria-label={t('moveDown')} onClick={() => move(i, i + 1)}><ChevronDown className="size-4" /></Button>
              <Button type="button" variant="ghost" size="sm" aria-label={t('removeRuling')} onClick={() => remove(i)}><X className="size-4" /></Button>
            </div>
            <div className="flex gap-3">
              <FormField control={form.control} name={`rows.${i}.date` as const} render={({ field }) => (
                <FormItem className="flex-1">
                  <span className="text-sm font-medium">{t('rulingDate')}</span>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} ariaLabel={t('rulingDate')} placeholder={t('rulingDate')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name={`rows.${i}.source` as const} render={({ field }) => (
                <FormItem className="flex-1">
                  <span className="text-sm font-medium">{t('rulingSource')}</span>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={t('rulingSource')} /></SelectTrigger>
                    <SelectContent>{sources.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name={`rows.${i}.text` as const} render={({ field }) => (
              <FormItem>
                <span className="text-sm font-medium">{t('rulingText')}</span>
                <FormControl>
                  <AutoTextarea aria-label={t('rulingText')} value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        ))}

        {!embedded && (
          <Button type="button" disabled={form.formState.isSubmitting} onClick={onSave}>
            {t('saveRulings')}
          </Button>
        )}
      </section>
    </Form>
  )
}
```
Note: `move`/`remove`/`append` come from `useFieldArray` (replacing the manual array logic). The `Date.now()` key is only a client-side scroll target and never persisted.

- [ ] **Step 5: Run the rulings test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/rulings-editor.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify embedded save contract**

Run: `npm test -w web -- rulings` and `npm test -w web -- card-edit`.
Expected: PASS — `save()` returns `{ ok:false, error:'invalid' }` on incomplete rows, so `CardEditForm`'s `rulingsFailed` toast path is intact.

- [ ] **Step 7: Typecheck, lint, full suite; Commit**

```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/lib/schemas/rulings.ts app/web/src/components/rulings-editor.tsx app/web/src/components/__tests__/rulings-editor.test.tsx
git commit -m "feat(web): rulings editor per-row required-field validation"
```

---

## Task 6: Image & symbol uploaders — inline type/size errors

**Files:**
- Modify: `app/web/src/components/image-uploader.tsx`
- Modify: `app/web/src/components/set-symbol-uploader.tsx`
- Create/Modify: tests for both under `app/web/src/components/__tests__/`.

**Interfaces:**
- Consumes: `FieldError` from `@/components/ui/field-error`; `useTranslations('validation')`.
- Behavior: a client-side check runs before upload — reject non-`image/*` (`fileType`) and files `> 5 MB` (`fileSize`), showing `FieldError` under the dropzone and skipping the upload. Server `type`/`size` results also render inline instead of a generic toast.

- [ ] **Step 1: Write the failing test — oversize file shows an inline size error, no upload**

Create `app/web/src/components/__tests__/image-uploader.test.tsx` (adapt selectors to the component's actual dropzone/file-input markup; the component uploads via `uploadCardImage`):
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

const uploadCardImage = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/image-actions', () => ({
  uploadCardImage: (...a: unknown[]) => uploadCardImage(...a),
  removeCardImage: vi.fn(),
}))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ImageUploader } from '../image-uploader'
import en from '@/../messages/en.json'

it('rejects an oversize file inline and does not upload', async () => {
  const user = userEvent.setup()
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      {/* render with the props the component actually requires */}
      <ImageUploader cardId="c1" lang="en" />
    </NextIntlClientProvider>,
  )
  const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' })
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, big)
  expect(await screen.findByText(en.validation.fileSize)).toBeInTheDocument()
  expect(uploadCardImage).not.toHaveBeenCalled()
})
```
(If `ImageUploader` requires more props, pass minimal valid values; the test only exercises the size guard.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w web -- src/components/__tests__/image-uploader.test.tsx`
Expected: FAIL — no inline size message; upload attempted.

- [ ] **Step 3: Add the client-side guard + FieldError to image-uploader.tsx**

In `app/web/src/components/image-uploader.tsx`: add `import { FieldError } from '@/components/ui/field-error'`, `const tv = useTranslations('validation')`, and a `const [fieldError, setFieldError] = useState('')`. In the file-select handler, before calling `uploadCardImage`, validate:
```tsx
const MAX_BYTES = 5 * 1024 * 1024
// inside the pick/drop handler, given `file: File`:
setFieldError('')
if (!file.type.startsWith('image/')) { setFieldError(tv('fileType')); return }
if (file.size > MAX_BYTES) { setFieldError(tv('fileSize')); return }
```
On a server error result, map codes: `if (res.error === 'type') setFieldError(tv('fileType')); else if (res.error === 'size') setFieldError(tv('fileSize')); else toast.error(t('imageFailed'))`. Render `<FieldError>{fieldError}</FieldError>` directly beneath the dropzone. Keep the existing success/reindex toasts.

- [ ] **Step 4: Mirror the guard in set-symbol-uploader.tsx**

Apply the identical pattern to `app/web/src/components/set-symbol-uploader.tsx` (immediate mode). In **staged** mode (no upload yet), still run the type/size check on pick and show `FieldError`, and only call `onStagedChange(file)` when valid. Map server `type`/`size` → inline for immediate mode.

- [ ] **Step 5: Run the uploader tests to verify they pass**

Run: `npm test -w web -- src/components/__tests__/image-uploader.test.tsx src/components/__tests__/set-symbol-uploader.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck, lint, full suite; Commit**

```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/components/image-uploader.tsx app/web/src/components/set-symbol-uploader.tsx app/web/src/components/__tests__/image-uploader.test.tsx app/web/src/components/__tests__/set-symbol-uploader.test.tsx
git commit -m "feat(web): inline file type/size errors for image & symbol uploaders"
```

---

## Task 7: Deck import dialog — move empty/invalid/no-lines errors inline

**Files:**
- Modify: `app/web/src/components/deck-import-dialog.tsx`
- Modify/extend deck tests (existing deck suites under `app/web/src/components/__tests__/`).

**Interfaces:**
- Consumes: `FieldError` from `@/components/ui/field-error`. Reuses existing `decks.import.emptyInput` / `invalidJson` / `noLines` message keys — now rendered inline under the paste textarea instead of via `toast.error`. Keeps the existing `unparsed`/`unresolved` alert blocks and the `import.success` toast.

- [ ] **Step 1: Write the failing test — empty import shows inline error, not a toast**

Add to the deck-import test (or create `app/web/src/components/__tests__/deck-import-dialog.test.tsx`). The dialog is a `Sheet`; open it, click Import with empty input:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deck-actions', () => ({
  getCardViewsAction: vi.fn(async () => ({})),
  resolveImportNames: vi.fn(async () => ({})),
}))
vi.mock('@revelio/core', async (orig) => ({ ...(await orig()) }))

import { DeckImportDialog } from '../deck-import-dialog'
import en from '@/../messages/en.json'

const state = { name: '', format: 'classic', visibility: 'private', entries: [] } as never

it('shows the empty-input error inline under the textarea', async () => {
  const user = userEvent.setup()
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeckImportDialog state={state} onImport={vi.fn()} />
    </NextIntlClientProvider>,
  )
  await user.click(screen.getByRole('button', { name: en.decks.import.button }))
  await user.click(screen.getByRole('button', { name: en.decks.import.submit }))
  expect(await screen.findByText(en.decks.import.emptyInput)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w web -- src/components/__tests__/deck-import-dialog.test.tsx`
Expected: FAIL — `emptyInput` only appears via toast (sonner is not in the DOM under this render), so `findByText` times out.

- [ ] **Step 3: Add an inline error state to deck-import-dialog.tsx**

In `app/web/src/components/deck-import-dialog.tsx`: add `import { FieldError } from '@/components/ui/field-error'`, `const [inputError, setInputError] = useState('')`. Clear it in `reset()` (`setInputError('')`). Replace the three `toast.error(...)` calls for `emptyInput`, `invalidJson`, `noLines` with `setInputError(t('import.emptyInput'))` etc., and clear it at the start of `handleImport` (`setInputError('')`). Render `<FieldError>{inputError}</FieldError>` immediately below the `AutoTextarea` block. Keep `toast.success(t('import.success'))` and the `unparsed`/`unresolved` blocks unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w web -- src/components/__tests__/deck-import-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, full suite; Commit**

```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/components/deck-import-dialog.tsx app/web/src/components/__tests__/deck-import-dialog.test.tsx
git commit -m "feat(web): deck import shows empty/invalid/no-lines errors inline"
```

---

## Task 8: Filter cost-range — inline min>max error + Apply guard

**Files:**
- Modify: `app/web/src/components/filter-sheet.tsx`
- Modify: filter-sheet test (create `app/web/src/components/__tests__/filter-sheet.test.tsx` if none).

**Interfaces:**
- Consumes: `FieldError` from `@/components/ui/field-error`; `useTranslations('validation')` for `costRange`.
- Behavior: when `draft.costMin` and `draft.costMax` are both numeric and `Number(costMin) > Number(costMax)`, show a `FieldError` under the cost group and make `apply()` a no-op (do not call `onApply`, keep the sheet open). Blank/non-numeric values never trigger the error.

- [ ] **Step 1: Write the failing test — inverted range blocks Apply**

Create `app/web/src/components/__tests__/filter-sheet.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

import { FilterSheet, EMPTY_SELECTION } from '../filter-sheet'
import en from '@/../messages/en.json'

it('blocks Apply and shows an inline error when min > max', async () => {
  const onApply = vi.fn()
  const user = userEvent.setup()
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FilterSheet sets={[]} value={EMPTY_SELECTION} locale="en" onApply={onApply} />
    </NextIntlClientProvider>,
  )
  await user.click(screen.getByRole('button', { name: en.filters.title }))
  await user.type(screen.getByLabelText(en.filters.costMin), '5')
  await user.type(screen.getByLabelText(en.filters.costMax), '2')
  await user.click(screen.getByRole('button', { name: en.filters.apply }))
  expect(await screen.findByText(en.validation.costRange)).toBeInTheDocument()
  expect(onApply).not.toHaveBeenCalled()
})
```
(The `SheetTrigger` button label is `en.filters.title`; confirm and adjust if the trigger uses a different accessible name.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w web -- src/components/__tests__/filter-sheet.test.tsx`
Expected: FAIL — `onApply` is called; no inline error.

- [ ] **Step 3: Add the cost-range guard to filter-sheet.tsx**

In `app/web/src/components/filter-sheet.tsx`: add `import { FieldError } from '@/components/ui/field-error'` and `const tv = useTranslations('validation')`. Add a derived flag:
```tsx
const costInvalid =
  draft.costMin !== '' && draft.costMax !== '' &&
  Number.isFinite(Number(draft.costMin)) && Number.isFinite(Number(draft.costMax)) &&
  Number(draft.costMin) > Number(draft.costMax)
```
Guard `apply()`:
```tsx
function apply() {
  if (costInvalid) return
  onApply(draft)
  setOpen(false)
}
```
Render the error under the cost inputs block:
```tsx
<FieldError className="mt-1">{costInvalid ? tv('costRange') : ''}</FieldError>
```
(Place it right after the `<div className="flex items-center gap-2">…</div>` that holds the two cost inputs, inside the cost `<div>`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w web -- src/components/__tests__/filter-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, full suite; Commit**

```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/components/filter-sheet.tsx app/web/src/components/__tests__/filter-sheet.test.tsx
git commit -m "feat(web): filter cost range inline error blocks inverted min/max"
```

---

## Task 9: Deck-list rename — inline server-error surfacing

**Files:**
- Modify: `app/web/src/components/deck-list.tsx`
- Modify: `app/web/src/components/__tests__/deck-list.test.tsx`

**Interfaces:**
- Consumes: `FieldError` from `@/components/ui/field-error`. On a failed `updateDeckMetaAction` rename, keep the inline input open and render `FieldError` (message `t('list.renameError')`) beneath it, instead of only a toast. Empty/unchanged name keeps the current silent-cancel behavior.

- [ ] **Step 1: Write the failing test — a failed rename shows an inline error and keeps the input open**

Add to `app/web/src/components/__tests__/deck-list.test.tsx` (the suite already mocks `deck-actions`; set the rename to fail):
```tsx
it('keeps the rename input open and shows an inline error on failure', async () => {
  updateDeckMetaAction.mockResolvedValueOnce({ ok: false, error: 'invalid' })
  const user = userEvent.setup()
  renderList() // existing helper that renders DeckList with at least one deck
  await user.click(screen.getByRole('button', { name: /rename/i })) // open inline rename (adjust to the real trigger)
  const input = screen.getByRole('textbox')
  await user.clear(input)
  await user.type(input, 'New name')
  await user.keyboard('{Enter}')
  expect(await screen.findByText(en.decks.list.renameError)).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toBeInTheDocument() // still editing
})
```
(Adjust `renameError` key path to match `de.json`/`en.json`; the rename trigger lives in the card's DropdownMenu.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w web -- src/components/__tests__/deck-list.test.tsx`
Expected: FAIL — the input closes on failure; no inline error.

- [ ] **Step 3: Add inline rename error state to deck-list.tsx**

In `app/web/src/components/deck-list.tsx`: add `import { FieldError } from '@/components/ui/field-error'` and `const [renameError, setRenameError] = useState('')`. In `cancelRename`, also `setRenameError('')`. In `saveRename`, clear it before the call, and on failure set it and DO NOT `cancelRename()`:
```tsx
      const res = await updateDeckMetaAction(deck.id, { name })
      setPendingId(null)
      if (res.ok) {
        toast.success(t('list.renamed'))
        cancelRename()
      } else {
        setRenameError(t('list.renameError'))
      }
```
In the inline-rename JSX, wrap the input row and add the error beneath it:
```tsx
<div className="flex flex-1 flex-col gap-1">
  <div className="flex items-center gap-1.5">
    {/* existing Input + check/cancel buttons */}
  </div>
  <FieldError>{renameError}</FieldError>
</div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w web -- src/components/__tests__/deck-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, full suite; Commit**

```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/components/deck-list.tsx app/web/src/components/__tests__/deck-list.test.tsx
git commit -m "feat(web): deck rename surfaces server errors inline"
```

---

## Task 10: Sub-Type matrix — consistent save-error surfacing (no new required rules)

**Files:**
- Modify: `app/web/src/components/subtype-translations-form.tsx`
- Modify: its test if present.

**Interfaces:**
- Consumes: `FieldError` from `@/components/ui/field-error`. No per-cell required rules (labels may be empty by design). On a failed `saveSubTypeTranslationsAction`, render a single `FieldError` near the Save button in addition to (or instead of) the existing `toast.error`, so the failure has an inline, consistent presentation.

- [ ] **Step 1: Write the failing test — a failed save shows an inline error near Save**

Add to the subtype form test (create if none). Mock `saveSubTypeTranslationsAction` to return `{ ok: false }`, click Save, assert an inline `role="alert"` with the save-error message appears. Use `en.admin.subTypes.saveError` (confirm the actual key path).
```tsx
saveSubTypeTranslationsAction.mockResolvedValueOnce({ ok: false })
await user.click(screen.getByRole('button', { name: en.admin.subTypes.save }))
expect(await screen.findByText(en.admin.subTypes.saveError)).toBeInTheDocument()
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w web -- subtype`
Expected: FAIL — message only appears via toast, not in the DOM.

- [ ] **Step 3: Add an inline save-error to subtype-translations-form.tsx**

Add `import { FieldError } from '@/components/ui/field-error'` and `const [saveError, setSaveError] = useState('')`. In the save handler, clear it at the start; on `!res.ok` set `setSaveError(t('saveError'))` (keep the existing toast too, harmless). Render `<FieldError>{saveError}</FieldError>` beside the Save button.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w web -- subtype`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, full suite; Commit**

```bash
npm run typecheck && npm run lint -w web && npm test -w web
git add app/web/src/components/subtype-translations-form.tsx app/web/src/components/__tests__
git commit -m "feat(web): sub-type matrix surfaces save errors inline"
```

---

## Final verification

- [ ] **Run the whole suite + gates**

```bash
npm test -w web && npm run typecheck && npm run lint -w web && npm run build -w web
```
Expected: tests green, no new typecheck/lint errors, build succeeds (build needs the usual env vars — see `app/.env.example`). The only tolerated lint warning is the pre-existing `useReactTable`/React-Compiler note in `admin-sets-table.tsx`.

- [ ] **Manual smoke (optional, `npm run dev -w web`)**

Confirm: empty login submit shows a required error under email; register with a taken username shows it under the username field; creating a set with a duplicate code shows the error under the code field; a rulings row with only text shows required errors under date and source; uploading a 6 MB image shows the size error under the dropzone; importing an empty deck shows the inline error under the textarea; setting cost min 5 / max 2 blocks Apply with an inline error.

---

## Notes on divergences from the spec

- **Schema single-source:** Auth/Set/Localization share a schema factory between client and (for Set) the server action via an identity message resolver `(k) => k`. Rulings intentionally does **not** share with its server action — the client rule (every row complete) is stricter than the lenient server shape by design.
- **Localization** keeps `useState` for the non-`name` free-text fields (they have no validation) and uses RHF only for the required `name`, minimizing churn while still rendering the error inline.
- **Deck name** field is unchanged (auto-name fallback, per the approved design).
