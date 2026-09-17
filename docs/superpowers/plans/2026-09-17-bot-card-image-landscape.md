# Bot card image: large and upright

**Goal:** `/card` in Discord shows the card image large instead of as a corner thumbnail, and a horizontal card reads upright instead of on its side.

## Diagnosis

`card-embed.ts` calls `setThumbnail`, which Discord renders at about 80px in the embed's top-right corner. `setImage` renders the same URL full-width below the fields.

Card faces are stored as portrait files; a `horizontal` card is a landscape card turned a quarter counter-clockwise onto that canvas (see `card-image.tsx`). The web app turns it back with a CSS `rotate-90`. A Discord embed takes an image URL and nothing else, so the upright image has to exist as a file.

## Approach

Bake a **landscape thumb** (`cards/landscape-thumb/<id>[.<lang>].<version>.webp`, 419x300) for every horizontal card, wherever a thumb is already made, the same way art crops are baked:

- `card-data/accio_images.py` writes `assets/cards/landscape-thumb/<id>.webp` from the thumb.
- `ingest/src/upload-images.ts` uploads it under the full image's version, like the thumb.
- `web/src/lib/actions/image-actions.ts` writes and deletes it alongside the thumb when an editor uploads or removes an image of a horizontal card.
- `@revelio/core` gets `landscapeThumbKey`; it shares the thumb's version, so no new column.

Card orientation is not editable, so those are the only two writers.

Rejected alternatives:

- **A web route that rotates on request.** Works, but it is a second pattern for immutable derived images, puts `sharp` work on an unauthenticated endpoint, and makes Discord's images depend on `web` being up.
- **Rotate inside the bot.** `sharp` is native, and the bot ships as a single esbuild bundle with no `node_modules`.

## Deployment

- Rebuild the image assets (`python3 accio_images.py --download`; existing files are skipped, landscape thumbs are made) and run ingest to upload them.
- An editor-uploaded image of a horizontal card from before this change has no landscape thumb, so its embed shows no image until that image is uploaded again.

## Global constraints

- Keep the 300px thumb, not the full image. A landscape thumb is 419x300, which fills Discord's embed image box.
- Code comments ASCII-only. Commits signed with `git -c gpg.program=/opt/homebrew/bin/gpg`, no attribution.

### Task 1: Bake and upload landscape thumbs

- [ ] `landscapeThumbKey` in `core/src/images.ts` with a key test.
- [ ] `generate_landscape_thumbs` in `accio_images.py` (90 CW, rebuilds a copy older than its thumb); README and IMAGES-SOURCING.
- [ ] Upload `landscape-thumb/` in `upload-images.ts`; extend `upload-images.test.ts`.

### Task 2: Editor uploads

- [ ] `image-actions.ts` writes the landscape thumb on upload and deletes it on replace/remove, for horizontal cards only; tests for both.

### Task 3: Card embed

- [ ] `cardEmbed` uses `setImage`: the thumb for a vertical card, the landscape thumb for a horizontal one.

### Task 4: Verify and propose

- [ ] `npm test` for core, bot, ingest (upload test) and the web action; `npm run typecheck`; `npm run lint`.
- [ ] Look at a baked landscape thumb.
- [ ] Push, open PR `feat(bot): show the card image large and upright`.
