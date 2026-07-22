# Legal & About Pages (`/about`, `/privacy`, `/imprint`) — Design

> **Status: DRAFT (drafted 2026-07-22).** Brainstormed at the track level; page-content
> details carry a few **Open decisions** (flagged inline) to confirm before locking.
> **Spec 2 of 3** in the "footer legal & about pages" track. **Depends on Spec 1**
> (`2026-07-22-site-settings-design.md`) — these pages read operator/legal values via
> `getCachedSiteSettings()`.

## Summary

Build the three footer-linked content pages that currently 404: an **About** page
(project story + credits), a GDPR **Privacy Policy** (`/privacy`), and a German
**Impressum** (`/imprint`). All three are server components rendering next-intl
message content, share one prose layout, and are fully bilingual (en + de). The
operator-specific values (name, address, contact email, hosting provider,
responsible person, GitHub link) come from the Spec 1 settings store; the legal and
narrative *prose* lives in the message files, drafted from the real facts of this
stack.

## Context & principle

Rendering approach (decided during brainstorming): **next-intl message keys**
(Option A) — consistent with every other page in the app, both locales first-class,
no new tooling. Prose paragraphs that contain links/emphasis use `t.rich`. The
operator *values* are **not** in messages — they are injected server-side from
`getCachedSiteSettings()` so there is one source of truth (Spec 1).

The Privacy Policy and Impressum are drafted from **verified facts of this codebase**
(the processing inventory below), not boilerplate. They carry a visible
"last updated" date and a note recommending independent legal review — this is a
non-commercial fan project, and the draft is accurate-to-the-stack, not legal advice.

## Scope

**In scope**

- Shared prose layout for legal/content pages (narrow centered column, consistent
  heading/paragraph styling).
- `/[locale]/about` — project narrative + credits + links (GitHub from settings).
- `/[locale]/privacy` — GDPR Art. 13 privacy policy grounded in the processing
  inventory; operator/host values from settings; "last updated" constant.
- `/[locale]/imprint` — §5 DDG Impressum + §18 MStV responsible person + standard
  liability/copyright clauses; operator values from settings.
- `about` / `privacy` / `imprint` i18n namespaces in `en.json` + `de.json`
  (German legal prose written natively, not machine-translated).
- `generateMetadata` per page; consumption via `getCachedSiteSettings()`.

**Out of scope**

- The site-settings store itself (Spec 1) and the `/contact` form (Spec 3) — though
  the Privacy Policy **does** describe the contact-form processing as a data
  category (forward reference; realized in Spec 3).
- A cookie-consent banner: the app sets only strictly-necessary (session) and
  functional (`NEXT_LOCALE`) cookies and runs **no analytics/tracking**, so no
  consent banner is required. (If tracking is ever added, that is a separate spec.)
- Making legal prose admin-editable (rich-text CMS) — explicitly rejected in Spec 1.

## Verified processing inventory (drives the Privacy Policy)

From the codebase (Spec 1 research):

- **Account data:** email, username, display name, `role`, ban status/reason/expiry,
  `emailVerified` (Better Auth `user` table).
- **Sessions:** session token, **IP address**, **user-agent**, expiry (Better Auth
  `session` table).
- **User content:** decks, deck likes, collection entries (all FK to the user).
- **Email:** login OTP codes (and, per Spec 3, contact messages) sent via **STRATO**
  SMTP.
- **Contact requests (Spec 3):** name, email, message — emailed to the operator,
  not stored in the DB.
- **Cookies:** Better Auth session cookie (strictly necessary) + next-intl
  `NEXT_LOCALE` (functional). **No** analytics/tracking cookies or libraries.
- **Card images:** stored in S3/MinIO — **no user PII**.
- **Hosting:** self-hosted VPS (provider name/location from settings;
  **Open decision** — confirm EU server location for the transfers section).

## Design

### 1. Shared prose layout

A small server component (e.g. `LegalPage` / `ProseShell`) wrapping page content in a
narrow column (`mx-auto max-w-3xl px-6 py-10`) with consistent typographic styling
for `h1`/`h2`/`p`/`ul`/`a`. All three pages use it so they read as one family. A
`LastUpdated` element (from a per-page date constant) renders on `/privacy` (and
optionally `/imprint`).

### 2. `/about`

Warm, concise project narrative. **Proposed outline (Open decision — adjust content):**

- What Revelio is: a Scryfall-style searchable database for the **Harry Potter
  Trading Card Game (2001, WotC)**.
- Unofficial, non-commercial fan project (echoing the footer disclaimer, not
  duplicating its full text).
- How it's built / open source, linking the GitHub repo (`githubUrl` from settings,
  rendered only if set).
- Credits / thanks (community, data sources) — **Open decision:** who to credit.
- Closing links to key surfaces (browse sets, random card).

### 3. `/privacy` (GDPR Art. 13)

Structured sections rendered from message keys, values injected from settings:

1. **Controller** — operator name + address + contact email (from settings).
2. **What we process & why** — the inventory above, each with its purpose and legal
   basis (account/sessions: contract + legitimate interest for security; OTP email:
   contract; contact form: consent/legitimate interest).
3. **Cookies** — strictly-necessary session cookie + functional `NEXT_LOCALE`; no
   tracking.
4. **Recipients / processors** — hosting VPS provider (from settings) and **STRATO**
   (email). Card images on S3/MinIO carry no PII.
5. **International transfers** — none / EU-only (**Open decision:** confirm VPS is
   EU-hosted; otherwise add a transfer basis).
6. **Retention** — account data until deletion; sessions until expiry; contact emails
   per mailbox policy.
7. **Your rights** — access, rectification, erasure, restriction, portability,
   objection, and the right to lodge a complaint with a supervisory authority.
8. **Last updated** — date constant.

A short "this fan project drafted this in good faith; not legal advice — have it
reviewed" note.

### 4. `/imprint` (Impressum)

- **§5 DDG:** operator name + postal address + contact email (from settings).
- **§18 Abs. 2 MStV:** responsible person (`responsiblePerson` from settings),
  rendered only if set.
- **Standard clauses** (native German + English): liability for content
  (Haftung für Inhalte), liability for links (Haftung für Links), copyright
  (Urheberrecht), and the Warner Bros./Wizards-of-the-Coast fan-project disclaimer
  (reuse the footer's `disclaimer` string rather than restating it).
- If settings are unset, render a clearly-marked "not configured" fallback rather
  than blank legal fields (defensive; production has them set via Spec 1).

### 5. Consumption & i18n

- Pages call `getCachedSiteSettings()` (Spec 1) — no per-request DB hit; edits in
  `/admin/settings` invalidate the `site-settings` tag.
- `generateMetadata` + `setRequestLocale` + `getTranslations` per page (matches
  `sets/page.tsx`).
- New `about` / `privacy` / `imprint` namespaces in `en.json` + `de.json`. German
  legal prose is authored natively (Datenschutzerklärung / Impressum are German
  legal instruments).

## Testing

- Each page renders in both locales with a settings object present; operator values
  appear where expected; the GitHub link shows only when `githubUrl` is set.
- Privacy Policy lists the correct processing categories/processors and hides
  nothing required; `imprint` renders the responsible person only when set and the
  "not configured" fallback when settings are absent.
- Metadata/title resolves per page.

## Open decisions (confirm before locking)

1. **About page content** — outline above OK? Anyone specific to credit?
2. **VPS server location** — EU? (drives the "international transfers" section).
3. **`/imprint` "last updated"** — show it, or only on `/privacy`?

## Next step

Resolve the open decisions, mark LOCKED, then `superpowers:writing-plans`. Ships
after Spec 1 (needs `getCachedSiteSettings`).
