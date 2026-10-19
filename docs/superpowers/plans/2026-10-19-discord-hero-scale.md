# Discord Hero Scale Implementation Plan

**Goal:** Draw the `/discord` hero's channel mock (`components/discord/command-channel.tsx`)
at the same Discord scale as the slash menu below it (`command-picker.tsx`), and draw
the parts both windows share through one component each, so the same control looks
the same on one page.

**Follows up on:** PR #181 (the slash menu), whose review left "extract one shared
message box" open.

## Decisions

- **One chrome module.** `components/discord/channel-chrome.tsx` exports
  `ChannelHeader` (`# channel`, divider, truncated topic) and `MessageBox` (round "+",
  plain `/command`, option pill with colon, typed value, caret). Both mocks use both.
  The message box is scenery in both windows, so it is `aria-hidden` in both.
- **The slash menu's metrics are the reference** (the approved mockup's): 14px base
  text with 1.375 leading, 16px window padding, 36px message avatars with a 14px gap,
  names at the base size in medium weight, 0.69rem timestamps.
- **The hero's container content follows the base size.** Rules text, labelled pairs
  and share rows drop their 0.8rem override and inherit 14px; the card heading goes to
  `text-lg` (Discord's `##` sits above the message size), the footer to `text-xs`,
  the select to `text-sm`. The "used /card" line's indent follows the avatar
  (36 + 14 = 50px).
- **The hero's typed line becomes `/collection set: Chamber of Secrets`.** The option
  name is data (the bot's registered name, from `BOT_COMMANDS`); `sample.typing` keeps
  only the value in both catalogs.

## Tasks

1. Tests first: a `channel-chrome` test (box draws "+", command, option pill, value,
   caret; header draws channel and topic), and the "two message boxes" test in
   `command-picker.test.tsx` asserting both windows render the shared box and header
   and the hero's message avatar is `size-9`. Watch them fail.
2. Add `channel-chrome.tsx`; switch `command-picker.tsx` to it (no visual change).
3. Rescale `command-channel.tsx` and switch it to the shared chrome; update
   `sample.typing` in `en.json` and `de.json`.
4. `npm test -w web`, `npm run typecheck`, `npm run lint`; Playwright screenshots of
   `/en/discord` and `/de/discord` at 360, 768 and 1280px in both themes. Check the
   hero has no horizontal overflow at 320 and 360px.
