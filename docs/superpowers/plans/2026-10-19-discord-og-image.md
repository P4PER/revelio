# Discord Page OG Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/discord` its own share image - the page headline beside a `/card` reply drawn the way the bot sends it - instead of the site-wide default.

**Architecture:** A route-level `opengraph-image.tsx` under `app/[locale]/discord/` (the same file convention the set and deck images use) calls a new `renderDiscordOgImage(locale)` in `src/lib/og-image.tsx`, which shares that module's font, wand mark and background. Every visible string comes from the existing `discord` message namespace the page's own `CommandChannel` mock already uses, so the German page gets a German image with no new copy beyond the alt.

**Tech Stack:** Next.js 16 `next/og` (`ImageResponse`, satori), next-intl, sharp, Vitest.

**Spec:** Approved in conversation on 2026-10-19 (design "A" of three rendered candidates, revised twice): no badge beside the lockup; the card header is two lines of labelled pairs, as `bot/src/discord/v2/card-view.ts` builds it.

## Global Constraints

- Canvas 1200x630 (`OG_SIZE`), Poppins SemiBold only (the one bundled weight): bold labels are set apart by colour (`#ffffff` label, `#b5bac1` value), not weight.
- Left column: plain lockup (no "APP" tag), headline from `discord.heading` with its `<b>` part in brand gold `#E8B23A` on its own line, then `revelio.cards/discord`.
- Right panel: Discord surface colours as hardcoded in `components/discord/command-channel.tsx` (`#313338` channel, `#2b2d31` container, Charms accent `#0069A9`, blurple `#5865F2` App tag), channel header `# {channelName}`, `usedCommand` line, bot name + App tag + `21:04`, card name, `sample.cardTags`, `sample.cardStats`, then the Alohomora art, bleeding off the bottom-right edge.
- Card art read from `public/discord/alohomora-thumb.webp` and converted to PNG with sharp (satori cannot decode WebP); best-effort - a read failure omits the art, never fails the image.
- Alt text: new key `discord.ogImageAlt` in `messages/en.json` and `de.json`, resolved from imported messages (generateImageMetadata runs at build with no request scope), like `ogImageAlt`.
- Code comments ASCII-only.

## Review Focus

- German strings are longer (`Seltenheit`, `Legalitaet`): the stats line must stay on one line inside the 470px container - checked by rendering `de` and looking at it.
- A translator dropping the `<b>` tag from `discord.heading`: the headline must still render (all white), not throw - covered by rendering through `t.rich`, which tolerates a missing tag.
- WebP read failure: image still renders without art - covered by the best-effort loader returning null.

---

### Task 1: Discord OG alt text

**Files:**
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` (`discord.ogImageAlt`)
- Modify: `app/web/src/lib/seo.ts`
- Test: `app/web/src/lib/__tests__/seo.test.ts`

**Interfaces:**
- Produces: `discordOgImageAlt(locale: string): string` in `@/lib/seo`; `hasOgAltForAllLocales()` also covers the Discord map.

- [ ] Test: `discordOgImageAlt('en')` equals `en.discord.ogImageAlt`, `'de'` equals `de.discord.ogImageAlt`, the two differ, and an unknown locale falls back to English.
- [ ] Run `npm test -w web -- src/lib/__tests__/seo.test.ts`, expect FAIL (not exported).
- [ ] Add the keys (en: "Revelio answering /card in a Discord channel"; de: "Revelio beantwortet /card in einem Discord-Kanal") and the helper.
- [ ] Run again, expect PASS. Commit `feat(web): add alt text for the discord share image`.

### Task 2: Render and route

**Files:**
- Modify: `app/web/src/lib/og-image.tsx`
- Create: `app/web/src/app/[locale]/discord/opengraph-image.tsx`

**Interfaces:**
- Consumes: `discordOgImageAlt`, `ogImageMetadata`.
- Produces: `renderDiscordOgImage(locale: string): Promise<ImageResponse>`.

- [ ] Implement `renderDiscordOgImage` per Global Constraints, translations via `getTranslations({ locale, namespace: 'discord' })` and `t.rich`.
- [ ] Route: `dynamic = 'force-dynamic'`, `generateImageMetadata` returns `ogImageMetadata(discordOgImageAlt(locale))`, default export renders.
- [ ] Verify by hand: run the dev server, fetch `/discord/opengraph-image/og` and `/de/discord/opengraph-image/og`, look at both PNGs; confirm `/` and `/sets` still serve the default image and the `/discord` HTML's `og:image` points at the new route.
- [ ] `npm run typecheck`, `npm run lint -w web`, `npm test -w web`. Commit `feat(web): give the discord page its own share image`.
