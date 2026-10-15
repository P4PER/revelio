# Dependency Upgrade Phase 2: zod 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `core`, `web`, `bot` and `sheet` from zod 3.25 to zod 4.6, fixing the one type break in the auth form.

**Architecture:** A version bump in four manifests, plus an explicit schema type on `makeEmailStepSchema` so react-hook-form's resolver infers an optional `name`.

**Tech Stack:** zod 4, @hookform/resolvers 5, react-hook-form 7.

**Spec:** `docs/superpowers/specs/2026-10-15-dependency-upgrade-design.md`
**Prerequisite:** [Phase 1](2026-10-15-dependency-upgrade-phase-1-toolchain.md) merged. Branch `chore/upgrade-zod-4` from `main`.

## Global Constraints

- All commands run from `app/`, with `PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- Deprecated-but-working zod 4 spellings (`z.string().email()`, `.url()`, `{ message }`) are **kept**. This phase changes behaviour only where zod 4 forces it.
- Test runs use the throwaway Meilisearch on `:7799` (see phase 1 Global Constraints).
- Commits: Conventional Commits, no attribution, `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

## Review Focus

- The login form (register = false) must still submit with no `name` field. A resolver that now demands `name` would block every sign-in.
- The register form must still reject a blank username with the localized `required` message.
- `bot/src/env.ts` and `sheet/src/env.ts` rely on `.refine` running after a failed `.url()` (their comment says so). Their existing tests pin that. They must pass unchanged, not be edited to pass.
- Error messages surfaced to users come from `t(...)` arguments, not zod's defaults. Any test asserting a zod default message would show the zod 4 wording change.
- `npm ls zod --all` must show no `invalid` (the better-call mismatch this fixes).

---

### Task 1: Bump zod and fix the auth form type

**Files:**
- Modify: `app/core/package.json`, `app/web/package.json`, `app/bot/package.json`, `app/sheet/package.json`, `app/package-lock.json`
- Modify: `app/web/src/lib/schemas/auth.ts`
- Modify: `app/web/src/components/auth/auth-form.tsx`
- Test: `app/web/src/components/auth/__tests__/` (existing)

**Interfaces:**
- Produces: `export type EmailStepValues = { email: string; name?: string }` from `@/lib/schemas/auth`.

- [ ] **Step 1: Bump.**

```bash
npm install zod@^4.6.7 -w @revelio/core -w web -w @revelio/bot -w @revelio/sheet
npm ls zod --all 2>&1 | grep -E "invalid" ; echo "invalid-count=$?"
```

Expected: no `invalid` lines (grep exits 1).

- [ ] **Step 2: See the break.**

Run: `npm run typecheck -w web`
Expected: FAIL. `auth-form.tsx(46,5): TS2322 Type 'Resolver<{ email: string; name: string | undefined; }...` and `(142,50): TS2345`.

- [ ] **Step 3: Type the schema factory.** In `app/web/src/lib/schemas/auth.ts`, replace `makeEmailStepSchema`:

```ts
/** What the email step submits. `name` is present only in register mode. */
export type EmailStepValues = { email: string; name?: string }

// Email-step schema. In register mode `name` (username) is required; login mode
// omits it. Availability/existence are checked server-side and mapped to fields.
// The return type is explicit because the two branches are different object
// schemas: inferred, their union gives zod 4 a required `name: string |
// undefined` key, which react-hook-form's resolver then demands.
export function makeEmailStepSchema(t: T, register: boolean): z.ZodType<EmailStepValues, EmailStepValues> {
  return z.object({
    email: z.string().trim().min(1, t('required')).email(t('email')),
    name: register ? z.string().trim().min(1, t('required')) : z.string().optional(),
  })
}
```

Move `type T` and `EmailStepValues` to the top of the file, above any function, per the declaration-order convention.

- [ ] **Step 4: Use the type in the form.** In `auth-form.tsx`, import it and replace both inline shapes:

```ts
import { makeCodeSchema, makeEmailStepSchema, type EmailStepValues } from '@/lib/schemas/auth'
// ...
  const emailForm = useForm<EmailStepValues>({
// ...
  async function requestCode(values: EmailStepValues) {
```

(Keep whatever else that import line already pulls in.)

- [ ] **Step 5: Verify.**

Run: `npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 6: Run all suites** (throwaway Meilisearch exported as in phase 1):

```bash
for w in core search ingest web bot sheet; do npm test -w $w 2>&1 | grep -E "^ +(Test Files|Tests) "; done
```

Expected: the phase 1 counts, all passed. Review Focus items 1 and 2 are already pinned in `web/src/components/auth/__tests__/auth-form.test.tsx`. "login rejects an unknown email without sending an OTP" only reaches `emailHasAccount` if the resolver lets a login submit with no `name` through. "register rejects a taken username" and "shows a required error under email" cover the register and required paths. To prove they bite, temporarily change the login branch to `z.string().min(1)` and confirm "login rejects an unknown email" fails, then revert. Note that in the PR.

- [ ] **Step 7: Commit.**

```bash
git add core/package.json web/package.json bot/package.json sheet/package.json package-lock.json web/src/lib/schemas/auth.ts web/src/components/auth/auth-form.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "build(deps): upgrade zod to 4" -m "better-call already required zod ^4 and resolved 3.25. The email-step
schema gets an explicit type: its two branches inferred as a union, which
zod 4 turns into a required name key the login form never sends."
```

### Task 2: Build and PR

- [ ] **Step 1:** `npm run build -w web`, then `docker build -f bot/Dockerfile -t revelio-bot:zod-check .` and the same for `sheet` (both bundle zod). Expected: exit 0.
- [ ] **Step 2:** Push, then `gh pr create --title "build(deps): upgrade zod to 4"`, with `## Verification` listing each command's real result and a link to the spec and the phase 1 PR.
