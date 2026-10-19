// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

// The web app serves copies of the brand files from public/, since the Next build
// cannot reach the repo root's logos/. This stops a brand update from skipping them,
// as sheet/test/logo.test.ts does for the sheet service's copy.
const SHARED = [
  'revelio-logo-on-light.svg',
  'revelio-logo-on-dark.svg',
  'revelio-icon-on-light.svg',
  'revelio-icon-on-dark.svg',
]

// The dark icon is the light one in the dark logo's colours, nothing else.
const DARK_SWAPS: [light: string, dark: string][] = [
  ['#3B3194', '#6E66C9'],
  ['#C8881E', '#E8B23A'],
  ['#F6D58B', '#FBF3DC'],
]

const publicFile = (name: string) => readFile(new URL(`../../../public/${name}`, import.meta.url))
const brandFile = (name: string) => readFile(new URL(`../../../../../logos/${name}`, import.meta.url))

describe('brand assets', () => {
  it.each(SHARED)('public/%s is byte for byte the brand file', async (name) => {
    expect((await publicFile(name)).equals(await brandFile(name))).toBe(true)
  })

  it('draws the dark icon in the dark logo colours and otherwise matches the light one', async () => {
    const light = (await brandFile('revelio-icon-on-light.svg')).toString()
    const dark = (await brandFile('revelio-icon-on-dark.svg')).toString()
    const swapped = DARK_SWAPS.reduce((svg, [l, d]) => svg.replaceAll(l, d), light)
    expect(dark).toBe(swapped)
    const logo = (await brandFile('revelio-logo-on-dark.svg')).toString()
    for (const [, d] of DARK_SWAPS) expect(logo).toContain(d)
  })
})
