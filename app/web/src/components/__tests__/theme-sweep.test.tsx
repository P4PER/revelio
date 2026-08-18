import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const read = (p: string) => readFile(resolve(process.cwd(), 'src/components', p), 'utf8')

describe('light-mode sweep', () => {
  // bg-white/5 is a dark-only wash: on parchment it is invisible.
  it.each(['quick-filters.tsx', 'lesson-filter.tsx'])('%s uses the hover token', async (file) => {
    const src = await read(file)
    expect(src).not.toMatch(/hover:bg-white\//)
    expect(src).toMatch(/hover:bg-\(--hover-bg\)/)
  })

  // accent is a pale wash in light mode, so text-accent is unreadable there.
  it('error-card-state does not colour text with accent', async () => {
    expect(await read('error-card-state.tsx')).not.toMatch(/text-accent\b/)
  })

  // text-white is only safe over card art, a black scrim or a destructive
  // fill. Here it sat on bg-card, so the count was white on near-white and
  // only showed up when a text selection highlighted it.
  it('add-to-collection does not paint the count white', async () => {
    expect(await read('add-to-collection.tsx')).not.toMatch(/text-white/)
  })

  it.each(['contact-form.tsx', 'error-card-state.tsx'])(
    '%s has no hardcoded hex colours',
    async (file) => {
      expect(await read(file)).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    },
  )
})
