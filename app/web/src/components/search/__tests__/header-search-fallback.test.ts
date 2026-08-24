import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'

// HeaderSearchFallback paints a search field in the header shell unconditionally,
// because it cannot know the route: HeaderSearch hides itself on home (which has
// its own hero search) only after hydration, from usePathname.
//
// That is safe for exactly one reason - the home page is force-dynamic, so its
// search params resolve eagerly and the Suspense boundary never suspends there,
// so the fallback never paints on home. Drop that export and home starts
// flashing a header search field that then disappears, which is the pop-in the
// fallback exists to prevent. Nothing else enforces it, so this does.
const src = join(dirname(fileURLToPath(import.meta.url)), '../../../app/[locale]/page.tsx')

describe('HeaderSearchFallback safety', () => {
  it('home is force-dynamic, so the header search boundary never suspends there', () => {
    expect(readFileSync(src, 'utf8')).toMatch(/^export const dynamic = 'force-dynamic'$/m)
  })
})
