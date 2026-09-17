# Deck Image Phase 2: Image Base Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bot fetches card art from a host it can reach, while Discord keeps fetching
embed images from a host *it* can reach, so `/card` and `/deck` can both work at once.

**Architecture:** `IMAGE_BASE_URL` is read by two kinds of consumer with opposite
reachability requirements - embed URLs that Discord fetches from the public internet, and
the sheet renderer's own in-process GETs. Add an optional `IMAGE_FETCH_BASE_URL` that only
the renderer reads, defaulting to `IMAGE_BASE_URL` when unset so every existing deployment
is unaffected.

**Tech Stack:** TypeScript, Zod, vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-17-deck-image-delivery-design.md`

## Global Constraints

- All work is under `app/`; every command runs from there.
- `type` aliases, never `interface`. Type-only imports say `type`.
- Declaration order in a file: types -> constants -> helpers -> exported functions.
- Code comments are ASCII only.
- `parseEnv` quotes variable names, never values - `DISCORD_TOKEN` must never reach a log.
- Commits are Conventional Commits, scope `bot`. No tool attribution.

**Depends on:** Phase 1 (`2026-09-17-deck-image-phase-1-bounded-render.md`) must be merged
first. This phase is what makes the images actually load, and loading them is what pushed
the renderer's memory over the pod limit in production.

---

### Task 1: Add `IMAGE_FETCH_BASE_URL` to the bot environment

**Files:**
- Modify: `app/bot/src/env.ts`
- Modify: `app/bot/.env.example`
- Test: `app/bot/test/env.test.ts`

**Interfaces:**
- Produces: `BotEnv` gains `IMAGE_FETCH_BASE_URL: string` - always a string after parsing,
  falling back to `IMAGE_BASE_URL`. Task 2 reads it; nothing else may.

- [ ] **Step 1: Write the failing test**

Add to `app/bot/test/env.test.ts`, following the shape the file already uses for building
a valid source object:

```ts
describe('IMAGE_FETCH_BASE_URL', () => {
  it('falls back to IMAGE_BASE_URL when unset', () => {
    const env = parseEnv({ ...valid, IMAGE_BASE_URL: 'https://img.test/images' })
    expect(env.IMAGE_FETCH_BASE_URL).toBe('https://img.test/images')
  })

  it('takes its own value when set', () => {
    const env = parseEnv({
      ...valid,
      IMAGE_BASE_URL: 'https://img.test/images',
      IMAGE_FETCH_BASE_URL: 'http://rustfs.svc.cluster.local:9000/images',
    })
    expect(env.IMAGE_FETCH_BASE_URL).toBe('http://rustfs.svc.cluster.local:9000/images')
    expect(env.IMAGE_BASE_URL).toBe('https://img.test/images')
  })

  it('treats an empty value as unset, the way an env file writes it', () => {
    const env = parseEnv({ ...valid, IMAGE_BASE_URL: 'https://img.test/images', IMAGE_FETCH_BASE_URL: '' })
    expect(env.IMAGE_FETCH_BASE_URL).toBe('https://img.test/images')
  })

  it('rejects a value that is not a URL', () => {
    let thrown: unknown
    try { parseEnv({ ...valid, IMAGE_FETCH_BASE_URL: 'rustfs:9000' }) } catch (err) { thrown = err }
    expect((thrown as Error).message).toContain('IMAGE_FETCH_BASE_URL')
  })

  it('accepts a cluster-local service hostname', () => {
    const url = 'http://svc-app-rustfs-f2b3494b.proj-reveliocards-9f0c37db.svc.cluster.local:9000/images'
    expect(parseEnv({ ...valid, IMAGE_FETCH_BASE_URL: url }).IMAGE_FETCH_BASE_URL).toBe(url)
  })
})
```

If `env.test.ts` has no shared `valid` fixture, build one from `.env.example`'s keys at the
top of the new describe block rather than editing the existing tests.

The last test is deliberate: the `.svc.cluster.local` hostname was verified to pass
zod 3's `.url()`, and this pins that so a zod 4 upgrade - whose `url()` is stricter about
hostnames - fails here rather than at the next deploy.

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test -w @revelio/bot -- test/env.test.ts -t "IMAGE_FETCH_BASE_URL"
```

Expected: FAIL - `env.IMAGE_FETCH_BASE_URL` is `undefined`.

- [ ] **Step 3: Add the field to the schema**

In `app/bot/src/env.ts`, inside the `Env` object, after `IMAGE_BASE_URL`:

```ts
  // Where the bot's own renderer fetches card art from, as opposed to
  // IMAGE_BASE_URL, which goes into embed URLs that *Discord* fetches. In a
  // cluster these are different hosts: the public ingress is what Discord can
  // reach and often what the pod cannot (hairpin NAT), and the in-cluster
  // service name is the other way round. Blank is how "unset" reaches us from an
  // env file, and means "same host as IMAGE_BASE_URL" - which is every
  // single-host deployment.
  IMAGE_FETCH_BASE_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),
```

The fallback cannot be expressed inside the object schema, because it depends on a sibling
field. Apply it after a successful parse, in `parseEnv`:

```ts
export function parseEnv(source: Record<string, string | undefined> = process.env): BotEnv {
  const parsed = Env.safeParse(source)
  if (parsed.success) {
    return { ...parsed.data, IMAGE_FETCH_BASE_URL: parsed.data.IMAGE_FETCH_BASE_URL ?? parsed.data.IMAGE_BASE_URL }
  }
  ...
}
```

and widen the exported type so consumers see a plain string:

```ts
export type BotEnv = Omit<z.infer<typeof Env>, 'IMAGE_FETCH_BASE_URL'> & { IMAGE_FETCH_BASE_URL: string }
```

- [ ] **Step 4: Run the new tests**

```bash
npm test -w @revelio/bot -- test/env.test.ts -t "IMAGE_FETCH_BASE_URL"
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Document it in `.env.example`**

Append to the "Absolute URLs the bot renders" block in `app/bot/.env.example`, replacing
the existing note about local images not rendering:

```
# ---- Absolute URLs the bot renders --------------------------------------
# Goes into embed image URLs, which *Discord* fetches from the public
# internet. In a real deployment this must be the public bucket URL; locally
# Discord cannot reach localhost, so /card images will not render.
IMAGE_BASE_URL=http://localhost:9000/images
SITE_BASE_URL=http://localhost:3000

# Optional. Where the bot's own /deck renderer fetches card art from, which it
# does in-process rather than handing Discord a URL. Set this when the public
# image host is not reachable from wherever the bot runs - in a cluster, point
# it at the object store's internal service name. Unset means "same as
# IMAGE_BASE_URL", which is correct for a host run against the local stack.
IMAGE_FETCH_BASE_URL=
```

- [ ] **Step 6: Run the whole bot suite, typecheck, lint**

```bash
npm test -w @revelio/bot
npm run typecheck
npm run lint -w @revelio/bot
```

Expected: PASS. `test/commands.test.ts` and `test/command-manifest.test.ts` build an `env`
with only `IMAGE_BASE_URL` and `SITE_BASE_URL`; those construct the object literally rather
than through `parseEnv`, so they will fail to typecheck until they gain
`IMAGE_FETCH_BASE_URL`. Add it to each, set to the same value as `IMAGE_BASE_URL`.

- [ ] **Step 7: Commit**

```bash
git add app/bot/src/env.ts app/bot/.env.example app/bot/test/env.test.ts \
        app/bot/test/commands.test.ts app/bot/test/command-manifest.test.ts
git commit -m "feat(bot): separate the image host the bot fetches from"
```

Body:

```
IMAGE_BASE_URL serves two consumers with opposite reachability
requirements: embed URLs that Discord fetches over the public internet, and
the deck renderer's own in-process GETs. In the cluster the public ingress
is reachable from Discord but not from the pod, and the service name is the
reverse, so no single value works. IMAGE_FETCH_BASE_URL defaults to
IMAGE_BASE_URL, leaving every single-host deployment unchanged.
```

---

### Task 2: Point the renderer at the fetch base

**Files:**
- Modify: `app/bot/src/discord/commands/deck.ts:57`
- Test: `app/bot/test/commands.test.ts`

**Interfaces:**
- Consumes: `BotEnv.IMAGE_FETCH_BASE_URL` from Task 1.
- Produces: nothing new. `renderDeckImage`'s `DeckImageOptions.imageBase` is unchanged -
  the renderer does not learn about the split, the command decides which base to hand it.

This is the whole point of the split: exactly one call site changes, and it is the one
where the bot performs the GET itself.

- [ ] **Step 1: Write the failing test**

Add to `app/bot/test/commands.test.ts`, alongside the existing `/deck` tests:

```ts
it('renders the deck sheet from the fetch base, not the public one', async () => {
  const fetchMock = vi.fn(async () => new Response('', { status: 404 }))
  vi.stubGlobal('fetch', fetchMock)
  const deps = makeDeps({
    env: {
      IMAGE_BASE_URL: 'https://public.test/images',
      IMAGE_FETCH_BASE_URL: 'http://internal.test:9000/images',
      SITE_BASE_URL: 'https://revelio.cards',
    },
  })
  await execute(interactionFor({ deck: 'abc123' }), deps)
  const urls = fetchMock.mock.calls.map(([url]) => String(url))
  expect(urls.length).toBeGreaterThan(0)
  expect(urls.every((u) => u.startsWith('http://internal.test:9000/images'))).toBe(true)
  expect(urls.some((u) => u.startsWith('https://public.test'))).toBe(false)
})
```

Adapt `makeDeps` / `interactionFor` to whatever helpers `commands.test.ts` already has -
the file builds both today for its existing `/deck` coverage; reuse them rather than adding
new ones.

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test -w @revelio/bot -- test/commands.test.ts -t "fetch base"
```

Expected: FAIL - the URLs start with `https://public.test/images`.

- [ ] **Step 3: Change the one call site**

In `app/bot/src/discord/commands/deck.ts`:

```ts
      // The bot fetches this one itself, so it takes the fetch base - not
      // IMAGE_BASE_URL, which is the host Discord fetches embed images from and
      // may well be unreachable from in here.
      const image = await renderDeckImage(deck, { imageBase: deps.env.IMAGE_FETCH_BASE_URL, locale })
```

- [ ] **Step 4: Run the test**

```bash
npm test -w @revelio/bot -- test/commands.test.ts -t "fetch base"
```

Expected: PASS.

- [ ] **Step 5: Confirm the embed path did not move**

```bash
grep -rn "IMAGE_FETCH_BASE_URL" app/bot/src/
```

Expected: exactly two hits - `env.ts` and `discord/commands/deck.ts`. Any hit under
`discord/embeds/` is a bug: those URLs are handed to Discord.

- [ ] **Step 6: Run the whole bot suite, typecheck, lint**

```bash
npm test -w @revelio/bot
npm run typecheck
npm run lint -w @revelio/bot
```

- [ ] **Step 7: Commit**

```bash
git add app/bot/src/discord/commands/deck.ts app/bot/test/commands.test.ts
git commit -m "fix(bot): fetch deck art from the internal image host"
```

---

### Task 3: Fix the local compose stack's image base

**Files:**
- Modify: `app/docker-compose.yml:81`

**Interfaces:**
- Consumes: `IMAGE_FETCH_BASE_URL` from Task 1.
- Produces: nothing in code.

The compose `bot` service hands the container `IMAGE_BASE_URL: http://localhost:9000/images`,
which inside that container is the container itself, so `docker compose --profile bot up bot`
has never been able to draw a single card. `DATABASE_URL` and `MEILI_HOST` two lines above
already use service names; this one was missed.

- [ ] **Step 1: Set both bases in the `bot` service's `environment` block**

```yaml
      # Discord fetches embed images from this one, so localhost is as good as
      # anything here: it is unreachable from Discord either way in local dev.
      IMAGE_BASE_URL: http://localhost:9000/images
      # The /deck renderer fetches in-process, from inside this container, where
      # localhost is the container itself. rustfs is the service name, the same
      # way DATABASE_URL and MEILI_HOST above use theirs.
      IMAGE_FETCH_BASE_URL: http://rustfs:9000/images
```

- [ ] **Step 2: Add the `rustfs` dependency**

The `bot` service's `depends_on` lists `postgres` and `meilisearch` but not `rustfs`, which
it now genuinely needs. Add it, matching the `ingest` service's form:

```yaml
      rustfs:
        condition: service_healthy
```

- [ ] **Step 3: Verify against the real stack**

```bash
cd app
docker compose up -d postgres meilisearch rustfs
docker compose --profile bot up --build bot
```

Then run `/deck` in the configured guild against a seeded local deck and confirm the posted
sheet shows card art rather than placeholder boxes. If the local database has no deck with
images, seed with `docker compose run --rm --build ingest` first.

If the picture is still placeholders, the summary log line added in Phase 1 Task 2 names
the reason on the container's stdout - read it rather than guessing.

- [ ] **Step 4: Commit**

```bash
git add app/docker-compose.yml
git commit -m "fix(bot): give the compose bot a reachable image host"
```

Body:

```
The bot service was handed IMAGE_BASE_URL=http://localhost:9000/images,
which inside that container is the container, so every /deck render drew
placeholder boxes. postgres and meilisearch got service-name overrides in
the same block; rustfs was missed.
```

---

### Task 4: Document the split

**Files:**
- Modify: `CLAUDE.md`, the "Discord bot specifics" bullet list
- Modify: `docs/` - the Discord docs page covering the bot's configuration, if one exists
  (`grep -rln "IMAGE_BASE_URL" docs/ app/web/content/`)

- [ ] **Step 1: Add the bullet to CLAUDE.md**

Under "Discord bot specifics", after the "Card images use `thumbKey`" bullet:

```markdown
- **Two image bases, and they are not interchangeable.** `IMAGE_BASE_URL` goes into embed
  URLs, which **Discord** fetches from the public internet, so it must be the public bucket
  host. `IMAGE_FETCH_BASE_URL` is what the `/deck` renderer fetches in-process and defaults
  to `IMAGE_BASE_URL`; set it when the public host is not reachable from where the bot runs,
  which in a cluster is the normal case (the pod cannot hairpin to its own ingress). Putting
  an internal hostname in `IMAGE_BASE_URL` silently breaks every `/card` image; putting the
  public one in `IMAGE_FETCH_BASE_URL` silently turns every deck sheet into placeholder boxes.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs(bot): explain the two image base URLs"
```

---

## Self-Review

- **Spec coverage.** Covers the spec's goal "One reachable image source per consumer".
  Deployment items 1 and 2 of the spec are operator actions and belong in the PR body, not
  in a task.
- **Type consistency.** `BotEnv.IMAGE_FETCH_BASE_URL` is `string` (not `string | undefined`)
  after Task 1's `Omit`-and-widen, which is what Task 2's call site and the hand-built test
  env objects rely on.
- **The `## Deployment` section this phase forces into the PR body:** `IMAGE_FETCH_BASE_URL`
  must be set on the bot to the in-cluster RustFS service, and `IMAGE_BASE_URL` restored to
  `https://portkey.revelio.cards/images`. Without the first, `/deck` stays placeholders;
  without the second, `/card` stays broken.
