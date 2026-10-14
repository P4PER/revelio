# Contact Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/contact` so it reads as a sibling of `/login` and `/about`: two columns over the star field on desktop, the login-style single column with the owl-post emblem on a phone, and the emblem taking off in the sent state.

**Architecture:** The page (server component) renders the intro block (heading, intro, topic list) and the GitHub line, and hands both to `ContactForm` (client) as nodes. `ContactForm` owns the layout grid because the sent state has to move the emblem from above the heading to above the success card, which a server-rendered sibling cannot react to. The card chrome is login's `FORM_CARD`, now exported from `auth-form.tsx`; the winged envelope moves out of `contact-form.tsx` into `OwlPostEmblem`, used still on the phone and animated in the sent state.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4, react-hook-form, Vitest + Testing Library, Playwright (visual check only).

**Spec:** No written spec - this is a bounded change agreed in chat on 2026-10-14. The mockups are the "Chosen" boards on the design canvas (https://claude.ai/artifact/9CNfXgnDEwcwqsGkcSrLrK): **desktop = "Chosen - desktop: C + star field"**, **phone = "Chosen - phone: A + star field"**, **sent = "A - sent: the emblem takes off"**. The agreed design, in full:

- **From `lg` (1024px) up:** a two-column grid, `5fr / 6fr`, `max-w-5xl`, vertically centred below the header. Left: heading, intro, three topics with icons, GitHub line. Right: the form card, name and email side by side.
- **Below `lg`:** one column, max 480px. Owl-post emblem on top, heading and intro centred, then the form, then the GitHub line under it. No topic list. Below `sm` the form has no box (login's rule).
- **No eyebrow/"Owl post" label** anywhere - removed at the user's request.
- **Star field** (`<StarField />`, as on About) behind both layouts.
- **Sent state:** the emblem (animated: lift, trail draw, spark pulse - the existing keyframes) sits over the success card, which uses the same card chrome. The intro column stays; on a phone the still emblem above the heading disappears, so the emblem reads as having moved to the card.
- **Card chrome** is `FORM_CARD` from `auth-form.tsx`, shared, not copied. Field spacing `space-y-4` (login's), not `space-y-6`.
- **GitHub line:** "Prefer GitHub? Find the project there." linking the admin-configured `githubUrl`, hidden when none is set (About and the footer do the same). Not `/issues`: the setting is free text, not guaranteed to be a GitHub repo.

## Global Constraints

- All commands run from `app/` (npm workspaces root). Prefix node/npm with `export PATH="/usr/local/bin:$PATH";`.
- Work on branch `feat/contact-page-redesign` (already created off `main`). Never commit to `main`.
- Commits: Conventional Commits, scope `web` or the web domain (`legal`, `auth`), imperative lower-case subject, no tool attribution, no `Co-authored-by`. Sign with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Every user-facing string comes from `messages/en.json` **and** `messages/de.json` (German uses "du", matching the existing contact copy).
- Code comments ASCII only: no em-dashes, no unicode arrows.
- `type` aliases, not `interface`; `import type` for type-only imports; props types named `XxxProps`.
- Components in `components/legal/` stay components; a shared class string is exported from the component that owns it (`FORM_CARD` from `auth-form.tsx`), never from a bare constants module.
- No Tailwind mixing of named (`md:`) and arbitrary (`min-[...]:`) responsive variants on one property.
- `vitest`'s `rejects.toThrow` is broken in `app/web` - catch throws by hand if a test needs one (none here should).

## Review Focus

1. **Signed-in prefill survives the new layout** - name/email arrive prefilled and "Send another message" resets back to the prefill, not to empty. Pinned by the existing `prefills name and email` test plus a new reset-keeps-prefill test in Task 2.
2. **Honeypot stays hidden and in place** - the honeypot div is `absolute left-[-9999px]`; it must remain inside a `relative` ancestor (`FORM_CARD` has `relative`) and keep `tabIndex={-1}`. Pinned by a Task 2 test that the honeypot input is not reachable by Tab.
3. **No GitHub URL configured** - the GitHub line must disappear entirely, with no empty `<p>` and no `href=""`. Pinned in Task 3.
4. **Phone width does not scroll sideways** - star field is `fixed`, the grid must not force a min width; checked in Task 4's Playwright run (`scrollWidth <= clientWidth` at 390px).
5. **Reduced motion** - the sent-state emblem animates only under `motion-safe:`; a reduced-motion user sees it static. Pinned in Task 1 (animation classes carry the `motion-safe:` prefix).

---

### Task 1: Share the card chrome and extract the owl-post emblem

**Files:**
- Modify: `app/web/src/components/auth/auth-form.tsx:24-25` (export `FORM_CARD`)
- Create: `app/web/src/components/legal/owl-post-emblem.tsx`
- Test: `app/web/src/components/legal/__tests__/owl-post-emblem.test.tsx`

**Interfaces:**
- Produces: `export const FORM_CARD: string` from `@/components/auth/auth-form`.
- Produces: `export function OwlPostEmblem(props: OwlPostEmblemProps)` with `type OwlPostEmblemProps = { flying?: boolean; className?: string }`. Renders a wrapper `<div data-slot="owl-post-emblem" data-state="still" | "flying" aria-hidden="true">`.

- [ ] **Step 1: Write the failing test**

`app/web/src/components/legal/__tests__/owl-post-emblem.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OwlPostEmblem } from '@/components/legal/owl-post-emblem'

function emblem(container: HTMLElement) {
  const el = container.querySelector('[data-slot="owl-post-emblem"]')
  if (!el) throw new Error('emblem not rendered')
  return el as HTMLElement
}

describe('OwlPostEmblem', () => {
  it('is decorative', () => {
    const { container } = render(<OwlPostEmblem />)
    expect(emblem(container)).toHaveAttribute('aria-hidden', 'true')
  })

  it('stands still by default, with no animation classes', () => {
    const { container } = render(<OwlPostEmblem />)
    expect(emblem(container)).toHaveAttribute('data-state', 'still')
    expect(container.innerHTML).not.toContain('animate-')
  })

  it('animates when flying, only for users who allow motion', () => {
    const { container } = render(<OwlPostEmblem flying />)
    expect(emblem(container)).toHaveAttribute('data-state', 'flying')
    const animated = Array.from(container.querySelectorAll('[class*="animate-"]'))
    expect(animated.length).toBeGreaterThanOrEqual(3)
    for (const el of animated) {
      const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.includes('animate-'))
      for (const c of classes) expect(c.startsWith('motion-safe:')).toBe(true)
    }
  })

  it('passes a className through to the wrapper', () => {
    const { container } = render(<OwlPostEmblem className="lg:hidden" />)
    expect(emblem(container)).toHaveClass('lg:hidden')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/legal/__tests__/owl-post-emblem.test.tsx`
Expected: FAIL - cannot resolve `@/components/legal/owl-post-emblem`.

- [ ] **Step 3: Export `FORM_CARD`**

In `app/web/src/components/auth/auth-form.tsx`, change `const FORM_CARD =` to `export const FORM_CARD =` and extend the comment above it with one line:

```tsx
// The card chrome only applies from `sm` up. On a phone a box costs width - a
// second gutter inside the page's - and frames a form that already fills the
// screen, so below `sm` the form sits directly on the page. z-10 keeps it above
// the fan cards that run behind its top edge. The contact page uses it too, so
// the two form pages cannot drift apart.
export const FORM_CARD =
  'relative z-10 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-8 sm:shadow-[0_-10px_28px_rgb(19_18_42/0.22)]'
```

- [ ] **Step 4: Create the emblem**

`app/web/src/components/legal/owl-post-emblem.tsx` - the SVG is the one currently inline in `contact-form.tsx`'s success branch, moved verbatim; only the animation classes become conditional:

```tsx
import { cn } from '@/lib/utils'

type OwlPostEmblemProps = {
  // Still above the heading on a phone; flying over the success card once the
  // message is sent. Flying only animates for motion-safe users.
  flying?: boolean
  className?: string
}

// The contact page's winged envelope: a gold flight trail, the envelope with
// wings, and the four-point sparkle from the logo mark (logos/revelio-icon.svg)
// at the trail's head. Decorative; the copy next to it carries the meaning.
export function OwlPostEmblem({ flying = false, className }: OwlPostEmblemProps) {
  return (
    <div
      data-slot="owl-post-emblem"
      data-state={flying ? 'flying' : 'still'}
      aria-hidden="true"
      className={cn('pointer-events-none relative flex justify-center', className)}
    >
      {/* Soft gold glow behind the emblem. */}
      <div className="absolute left-1/2 top-3 h-28 w-44 -translate-x-1/2 rounded-full bg-primary/8 blur-2xl sm:h-36 sm:w-48" />
      <svg
        viewBox="0 0 140 100"
        fill="none"
        className={cn(
          'relative h-24 w-auto text-primary-ink [filter:drop-shadow(0_0_9px_var(--glow-owl))] sm:h-32',
          flying && 'motion-safe:animate-[owl-lift_620ms_ease-out]',
        )}
      >
        {/* Flight trail - draws itself from the launch point when flying. */}
        <path
          d="M18 88 C 34 82, 46 74, 56 62"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="0.5"
          strokeDasharray="130"
          className={cn(flying && 'motion-safe:animate-[trail-draw_720ms_200ms_ease-out_both]')}
        />
        <circle cx="18" cy="88" r="2.4" fill="currentColor" fillOpacity="0.6" />

        {/* Winged envelope. */}
        <path d="M58 42 C 44 34, 32 38, 22 34 C 32 42, 44 46, 57 47 Z" fill="currentColor" fillOpacity="0.85" />
        <path d="M82 42 C 96 34, 108 38, 118 34 C 108 42, 96 46, 83 47 Z" fill="currentColor" fillOpacity="0.85" />
        <rect x="58" y="38" width="24" height="17" rx="3" fill="currentColor" />
        <path
          d="M58.5 40.5 L70 49 L81.5 40.5"
          stroke="var(--color-background)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Destination spark, scaled down from the logo mark. */}
        <g
          transform="translate(112 17) scale(0.46) translate(-70 -34)"
          className={cn(flying && 'motion-safe:animate-[spark-pulse_2.4s_ease-in-out_infinite]')}
        >
          <path
            d="M70,16 Q73.4,30.6 88,34 Q73.4,37.4 70,52 Q66.6,37.4 52,34 Q66.6,30.6 70,16 Z"
            fill="currentColor"
          />
        </g>
      </svg>
    </div>
  )
}
```

Note: `strokeDasharray="130"` with no offset draws the full trail when still, so the still emblem looks identical to the end frame of the flying one.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w web -- src/components/legal/__tests__/owl-post-emblem.test.tsx src/components/auth`
Expected: PASS (emblem tests, and every existing auth test still green after the export).

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/auth/auth-form.tsx app/web/src/components/legal/owl-post-emblem.tsx app/web/src/components/legal/__tests__/owl-post-emblem.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): share the auth card chrome and extract the owl-post emblem"
```

---

### Task 2: Contact form takes the login card and owns the two-column layout

**Files:**
- Modify: `app/web/src/components/legal/contact-form.tsx` (whole render; `onSubmit` and the schema wiring unchanged)
- Test: `app/web/src/components/legal/__tests__/contact-form.test.tsx`

**Interfaces:**
- Consumes: `FORM_CARD` from `@/components/auth/auth-form`; `OwlPostEmblem` from `@/components/legal/owl-post-emblem` (Task 1).
- Produces: `ContactForm(props: ContactFormProps)` with

  ```ts
  type ContactFormProps = {
    renderedAt: number
    defaultName?: string
    defaultEmail?: string
    // The page's heading block (server-rendered). Left column from `lg` up.
    intro: React.ReactNode
    // Optional line under the form on a phone, under the intro from `lg` up.
    footer?: React.ReactNode
  }
  ```

  DOM hooks the page test and Playwright rely on: `data-slot="contact-layout"` (grid), `data-slot="contact-intro"`, `data-slot="contact-card"` (form card and success card), `data-slot="contact-footer"`.

- [ ] **Step 1: Update the test helper and write the failing tests**

In `contact-form.test.tsx`, add the import and change `renderForm` so every test passes the now-required `intro`:

```tsx
import { FORM_CARD } from '@/components/auth/auth-form'

function renderForm(props: Partial<React.ComponentProps<typeof ContactForm>> = {}) {
  // renderedAt well in the past so the (client-collected) value is plausible.
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ContactForm renderedAt={Date.now() - 10_000} intro={<h1>Intro block</h1>} {...props} />
    </NextIntlClientProvider>,
  )
}
```

Change the `prefills name and email` test to `renderForm({ defaultName: 'Hermione', defaultEmail: 'h@x.io' })`. Then append to the `describe`:

```tsx
  it('renders the intro and footer it is given', () => {
    renderForm({ footer: <p>Footer line</p> })
    expect(screen.getByRole('heading', { name: 'Intro block' })).toBeInTheDocument()
    expect(screen.getByText('Footer line')).toBeInTheDocument()
  })

  it('wraps the form in the shared login card chrome', () => {
    const { container } = renderForm()
    const card = container.querySelector('[data-slot="contact-card"]')
    expect(card?.className).toContain(FORM_CARD)
    expect(card?.querySelector('form')).not.toBeNull()
  })

  it('shows the still emblem above the intro on small screens only', () => {
    const { container } = renderForm()
    const intro = container.querySelector('[data-slot="contact-intro"]')
    const emblem = intro?.querySelector('[data-slot="owl-post-emblem"]')
    expect(emblem).toHaveAttribute('data-state', 'still')
    expect(emblem).toHaveClass('lg:hidden')
  })

  it('keeps the honeypot out of the tab order', async () => {
    const user = userEvent.setup()
    renderForm()
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(document.activeElement?.id).not.toBe('contact-website')
    }
  })

  it('after sending, flies the emblem over a success card and keeps the intro', async () => {
    const user = userEvent.setup()
    const { container } = renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: en.contact.send }))
    await screen.findByText(en.contact.successTitle)

    expect(screen.getByRole('heading', { name: 'Intro block' })).toBeInTheDocument()
    const emblems = container.querySelectorAll('[data-slot="owl-post-emblem"]')
    expect(emblems).toHaveLength(1)
    expect(emblems[0]).toHaveAttribute('data-state', 'flying')
    const status = screen.getByRole('status')
    expect(status.closest('[data-slot="contact-card"]')?.className).toContain(FORM_CARD)
  })

  it('send another message resets to the signed-in prefill, not to empty', async () => {
    const user = userEvent.setup()
    renderForm({ defaultName: 'Hermione', defaultEmail: 'hermione@example.com' })
    await user.type(screen.getByLabelText(en.contact.subject), 'Card data typo')
    await user.type(screen.getByLabelText(en.contact.message), 'The Lumos card has the wrong lesson cost listed.')
    await user.click(screen.getByRole('button', { name: en.contact.send }))
    await user.click(await screen.findByRole('button', { name: en.contact.sendAnother }))

    expect(screen.getByLabelText(en.contact.name)).toHaveValue('Hermione')
    expect(screen.getByLabelText(en.contact.email)).toHaveValue('hermione@example.com')
    expect(screen.getByLabelText(en.contact.subject)).toHaveValue('')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- src/components/legal/__tests__/contact-form.test.tsx`
Expected: the new tests FAIL (no `contact-intro`/`contact-card` slots, no intro rendered); the existing ones still pass.

- [ ] **Step 3: Implement**

In `contact-form.tsx`:

1. Imports: add `import type { ReactNode } from 'react'`, `import { FORM_CARD } from '@/components/auth/auth-form'`, `import { OwlPostEmblem } from '@/components/legal/owl-post-emblem'`, `import { cn } from '@/lib/utils'`.
2. Replace the inline props type with the `ContactFormProps` type above (declared after `type Values`, before `ERROR_KEY`), with `intro: ReactNode` and `footer?: ReactNode`.
3. Replace both return branches with one layout. Keep `onSubmit`, `form`, the honeypot, the hidden `renderedAt` and every `FormField` exactly as they are; only the wrappers change, plus the name/email pair moves into a grid:

```tsx
  // The page hands in its intro and footer so this component can own the grid:
  // sending moves the emblem from above the intro (phone) to above the success
  // card, which a server-rendered sibling could not follow. From `lg` up the
  // intro and footer stack in the left column and the card spans both rows on
  // the right; below `lg` everything is one column in DOM order.
  return (
    <div
      data-slot="contact-layout"
      className="grid gap-6 lg:grid-cols-[5fr_6fr] lg:grid-rows-[auto_1fr] lg:gap-x-16"
    >
      <div data-slot="contact-intro" className="lg:col-start-1 lg:row-start-1 lg:pt-6">
        {!sent && <OwlPostEmblem className="mb-4 lg:hidden" />}
        {intro}
      </div>

      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {sent ? (
          <>
            <OwlPostEmblem flying className="-mb-11" />
            <div data-slot="contact-card" className={FORM_CARD}>
              <div role="status" className="flex flex-col items-center py-6 text-center">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t('successTitle')}</h2>
                <p className="mt-2 max-w-sm text-base text-muted-foreground">{t('successBody')}</p>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-6"
                  onClick={() => {
                    // Reset to the original defaults (keeps the signed-in prefill and reuses
                    // the still-valid renderedAt token) so a second message can be sent.
                    form.reset()
                    setSent(false)
                  }}
                >
                  {t('sendAnother')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div data-slot="contact-card" className={FORM_CARD}>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                {/* honeypot div and hidden renderedAt input: unchanged */}
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* name FormField: unchanged */}
                  {/* email FormField: unchanged */}
                </div>
                {/* subject FormField: unchanged */}
                {/* message FormField: unchanged */}
                <FieldError>{form.formState.errors.root?.message}</FieldError>
                <Button
                  type="submit"
                  size="lg"
                  disabled={form.formState.isSubmitting}
                  className="w-full font-semibold"
                >
                  {form.formState.isSubmitting ? t('sending') : t('send')}
                </Button>
              </form>
            </Form>
          </div>
        )}
      </div>

      {footer && (
        <div data-slot="contact-footer" className="lg:col-start-1 lg:row-start-2 lg:self-start">
          {footer}
        </div>
      )}
    </div>
  )
```

(The "unchanged" comments above stand for the existing JSX blocks moved as-is; do not paraphrase them.) Delete the old success-branch SVG and the old `rounded-2xl border bg-card` wrappers - the emblem now lives in `OwlPostEmblem`, the chrome in `FORM_CARD`. The file needs no `cn` import; leave it out of item 1.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web -- src/components/legal/__tests__/contact-form.test.tsx`
Expected: PASS, all tests (the 8 existing plus 6 new).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/legal/contact-form.tsx app/web/src/components/legal/__tests__/contact-form.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): give the contact form the login card and a two-column layout"
```

---

### Task 3: Contact page - intro, topics, GitHub line, star field

**Files:**
- Modify: `app/web/src/app/[locale]/contact/page.tsx`
- Modify: `app/web/messages/en.json` (`contact` namespace), `app/web/messages/de.json` (`contact` namespace)
- Test: `app/web/src/app/[locale]/__tests__/contact-page.test.tsx`

**Interfaces:**
- Consumes: `ContactForm` with `intro` / `footer` props (Task 2); `getCachedSiteSettings` from `@/lib/server/site-settings` (returns `{ githubUrl: string | null, ... } | null`); `StarField` from `@/components/star-field`; `DiscordMark` from `@/components/discord-mark`.
- Produces: new message keys in `contact`: `topicsLabel`, `topicCardsTitle`, `topicCardsBody`, `topicBugsTitle`, `topicBugsBody`, `topicBotTitle`, `topicBotBody`, `github`.

- [ ] **Step 1: Write the failing tests**

In `contact-page.test.tsx`:

1. Make the translator mock support `t.rich` (the GitHub line uses it), and mock site settings and the star field, next to the existing mocks:

```tsx
vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    const t = (k: string) => k
    t.rich = (k: string, tags: Record<string, (c: React.ReactNode) => React.ReactNode>) =>
      tags.link ? tags.link(k) : k
    return t
  },
}))
const getCachedSiteSettings = vi.fn(async () => null as unknown)
vi.mock('@/lib/server/site-settings', () => ({ getCachedSiteSettings: () => getCachedSiteSettings() }))
vi.mock('@/components/star-field', () => ({ StarField: () => <div data-testid="star-field" /> }))
```

2. Make the `ContactForm` stub render its `intro` and `footer`:

```tsx
vi.mock('@/components/legal/contact-form', () => ({
  ContactForm: ({
    renderedAt,
    defaultName,
    defaultEmail,
    intro,
    footer,
  }: {
    renderedAt: number
    defaultName?: string
    defaultEmail?: string
    intro: React.ReactNode
    footer?: React.ReactNode
  }) => (
    <div data-testid="contact-form" data-name={defaultName} data-email={defaultEmail}>
      {intro}
      <span>{renderedAt}</span>
      {footer}
    </div>
  ),
}))
```

3. Reset the new mock in `beforeEach`: `getCachedSiteSettings.mockReset(); getCachedSiteSettings.mockResolvedValue(null)`.

4. Add tests:

```tsx
  it('lists the three topics, hidden below lg', async () => {
    render(await ContactPage())
    const list = screen.getByRole('list', { name: 'topicsLabel' })
    expect(list).toHaveClass('hidden', 'lg:flex')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'topicCardsTitletopicCardsBody',
      'topicBugsTitletopicBugsBody',
      'topicBotTitletopicBotBody',
    ])
  })

  it('links the configured GitHub project', async () => {
    getCachedSiteSettings.mockResolvedValue({ githubUrl: 'https://github.com/example/revelio' })
    render(await ContactPage())
    const link = screen.getByRole('link', { name: 'github' })
    expect(link).toHaveAttribute('href', 'https://github.com/example/revelio')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('omits the GitHub line entirely when no URL is configured', async () => {
    const { container } = render(await ContactPage())
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).not.toContain('github')
  })

  it('draws the star field behind the page', async () => {
    render(await ContactPage())
    expect(screen.getByTestId('star-field')).toBeInTheDocument()
  })
```

Add `within` to the `@testing-library/react` import. The existing `renders the accent title, intro, and the form` test stays as is.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- "src/app/\[locale\]/__tests__/contact-page.test.tsx"`
Expected: the four new tests FAIL (no list, no link, no star field).

- [ ] **Step 3: Add the strings**

`messages/en.json`, inside `"contact"` after `"intro"`:

```json
    "topicsLabel": "What to write about",
    "topicCardsTitle": "Card corrections",
    "topicCardsBody": "A wrong text, a missing image, a translation that reads off.",
    "topicBugsTitle": "Bugs and ideas",
    "topicBugsBody": "Something broken on the site or in the deck builder, or a feature you miss.",
    "topicBotTitle": "The Discord bot",
    "topicBotBody": "Adding it to your server, or a command that misbehaves.",
    "github": "Prefer GitHub? <link>Find the project there</link>.",
```

`messages/de.json`, same position:

```json
    "topicsLabel": "Worüber du schreiben kannst",
    "topicCardsTitle": "Kartenkorrekturen",
    "topicCardsBody": "Ein falscher Text, ein fehlendes Bild, eine holprige Übersetzung.",
    "topicBugsTitle": "Fehler und Ideen",
    "topicBugsBody": "Etwas funktioniert auf der Seite oder im Deckbuilder nicht, oder dir fehlt eine Funktion.",
    "topicBotTitle": "Der Discord-Bot",
    "topicBotBody": "Ihn auf deinen Server holen, oder ein Befehl, der sich danebenbenimmt.",
    "github": "Lieber über GitHub? <link>Dort findest du das Projekt</link>.",
```

- [ ] **Step 4: Rewrite the page**

`app/web/src/app/[locale]/contact/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { Bug, ScrollText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ContactForm } from '@/components/legal/contact-form'
import { DiscordMark } from '@/components/discord-mark'
import { StarField } from '@/components/star-field'
import { getSession } from '@/lib/server/session'
import { getCachedSiteSettings } from '@/lib/server/site-settings'

// Rendered per request so the submit-timing token is fresh and never statically cached.
export const dynamic = 'force-dynamic'

// What the topic list offers, in order. Icons are decorative: each item's
// title says what it is.
const TOPICS = [
  { key: 'Cards', Icon: ScrollText },
  { key: 'Bugs', Icon: Bug },
  { key: 'Bot', Icon: DiscordMark },
] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contact')
  return { title: t('metaTitle') }
}

export default async function ContactPage() {
  const t = await getTranslations('contact')

  // Prefill for signed-in users so they don't retype what we already know. Mirrors
  // the app's display-name convention (displayUsername ?? username).
  const user = (await getSession())?.user
  const defaultName = user?.displayUsername ?? user?.username ?? ''
  const defaultEmail = user?.email ?? ''
  const githubUrl = (await getCachedSiteSettings())?.githubUrl ?? null

  // Centred like the login page from `sm` up; on a phone it stays at the top,
  // where an opening keyboard would otherwise shift a centred form.
  return (
    <main className="relative mx-auto flex w-full max-w-[480px] flex-col px-4 py-6 sm:min-h-[calc(100dvh-var(--header-h))] sm:justify-center sm:px-0 md:py-12 lg:max-w-5xl lg:px-6">
      <StarField />
      {/* A fresh per-request submit-timing token. This page is force-dynamic, so it
          renders once per request - Date.now() is intentional here (no re-render
          instability in a server component), which the purity rule can't infer. */}
      <ContactForm
        // eslint-disable-next-line react-hooks/purity
        renderedAt={Date.now()}
        defaultName={defaultName}
        defaultEmail={defaultEmail}
        intro={
          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground lg:text-4xl">
              {t('titlePrefix')} <span className="text-heading">{t('titleAccent')}</span>
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground lg:mt-4">{t('intro')}</p>
            <ul aria-label={t('topicsLabel')} className="mt-8 hidden flex-col gap-5 lg:flex">
              {TOPICS.map(({ key, Icon }) => (
                <li key={key} className="flex gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary-ink">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-foreground">{t(`topic${key}Title`)}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{t(`topic${key}Body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        }
        footer={
          githubUrl && (
            <p className="text-center text-sm text-muted-foreground lg:mt-2 lg:border-t lg:border-border lg:pt-5 lg:text-left">
              {t.rich('github', {
                link: (chunks) => (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-ink underline underline-offset-2"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          )
        }
      />
    </main>
  )
}
```

Check before moving on: the `eslint-disable-next-line react-hooks/purity` must sit on the line directly above `renderedAt={Date.now()}` - run lint in Task 4 and move it if the rule still fires. `githubUrl && (...)` yields `null` when unset, which `ContactForm` treats as no footer (`{footer && ...}`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w web -- "src/app/\[locale\]/__tests__/contact-page.test.tsx" src/components/legal`
Expected: PASS. Then the catalog parity check, if `web` has one for `messages/*.json`: `npm test -w web -- -t "messages"` - expected PASS (both files gained the same keys).

- [ ] **Step 6: Commit**

```bash
git add "app/web/src/app/[locale]/contact/page.tsx" "app/web/src/app/[locale]/__tests__/contact-page.test.tsx" app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): lay out the contact page in two columns over the star field"
```

---

### Task 4: Verify in the browser and the full suite

**Files:** none changed unless a check fails (then fix in the owning task's file and amend that task's commit via a `fixup!` commit).

- [ ] **Step 1: Full checks**

```bash
cd app
npm test -w web
npm run typecheck
npm run lint
```

Expected: all green. Record the web test count for the PR's `## Verification`.

- [ ] **Step 2: Screenshots with Playwright**

Start the dev stack (`docker compose up -d` from `app/`, then `npm run dev -w web`). Write `scratchpad/shoot-contact.mjs`, importing Playwright by absolute path:

```js
import { chromium } from '/Users/timon.wegener/WebstormProjects/revelio/app/node_modules/playwright/index.mjs'

const out = process.argv[2]
const browser = await chromium.launch()
for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  for (const scheme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport, colorScheme: scheme })
    await page.goto('http://localhost:3000/en/contact')
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    console.log(name, scheme, 'horizontal overflow:', overflow)
    await page.screenshot({ path: `${out}/contact-${name}-${scheme}.png`, fullPage: true })
    await page.close()
  }
}
await browser.close()
```

Run: `/usr/local/bin/node scratchpad/shoot-contact.mjs scratchpad`
Expected: `horizontal overflow: false` for all four; PNG widths 1280 and 390. Compare against the "Chosen" canvas boards: two columns with topics on desktop; emblem, centred heading, boxless form, GitHub line under it on the phone; stars visible in both themes. If the dev server shows stale CSS, `rm -rf app/web/.next/dev` and restart.

- [ ] **Step 3: Sent state**

The success state needs a configured contact address and a working mail transport. If the local stack has both, submit the form in the same script and screenshot the result at both widths. If not, do not fake it: say in the PR that the sent state is covered by the unit test (`after sending, flies the emblem...`) and was not checked visually.

- [ ] **Step 4: Open the PR (only when the user asks)**

Title: `feat(web): rework the contact page after the login and about pages`. Body: prose opener, `## What changed`, `## Verification` (one bullet per command actually run, with its real result), link this plan.
