import type { CSSProperties } from 'react'
import type { ThemeChoice } from '@/lib/theme'

type Tone = 'light' | 'dark'

// The preview must not follow the live theme: a light swatch has to stay light
// while the page is dark. globals.css declares every hex exactly once, as
// --light-* and --dark-* value sets on :root that the theme alias blocks point
// at. Those sets are unconditional and never reassigned, so reading them
// directly gives a palette that is fixed by construction - and one that follows
// any future palette edit for free.
const PALETTE: Record<Tone, CSSProperties> = {
  light: {
    '--p-bg': 'var(--light-background)',
    '--p-card': 'var(--light-card)',
    '--p-ink': 'var(--light-foreground)',
    '--p-border': 'var(--light-border)',
    '--p-gold': 'var(--light-primary)',
    '--p-art-1': 'var(--light-lesson-charms)',
    '--p-art-2': 'var(--light-lesson-transfiguration)',
    '--p-art-3': 'var(--light-lesson-potions)',
  } as CSSProperties,
  dark: {
    '--p-bg': 'var(--dark-background)',
    '--p-card': 'var(--dark-card)',
    '--p-ink': 'var(--dark-foreground)',
    '--p-border': 'var(--dark-border)',
    '--p-gold': 'var(--dark-primary)',
    '--p-art-1': 'var(--dark-lesson-charms)',
    '--p-art-2': 'var(--dark-lesson-transfiguration)',
    '--p-art-3': 'var(--dark-lesson-potions)',
  } as CSSProperties,
}

const ART = ['var(--p-art-1)', 'var(--p-art-2)', 'var(--p-art-3)']

// One miniature Revelio: the header strip with its gold mark and search field,
// a row of lesson-tinted cards, and the gold primary button. That is the screen
// a Revelio user actually looks at, so it is the honest sample of a theme.
//
// The card art is inset inside the card padding rather than bled to the edge,
// so the card surface - parchment or midnight - is what carries the swatch. A
// full-bleed tint turns the miniature into a row of colour chips and buries the
// thing being chosen.
function Pane({ tone, style }: { tone: Tone; style?: CSSProperties }) {
  return (
    <div
      data-tone={tone}
      style={{ ...PALETTE[tone], ...style }}
      className="absolute inset-0 flex flex-col bg-(--p-bg)"
    >
      <div className="flex h-[16%] shrink-0 items-center gap-1 border-b border-(--p-border) bg-(--p-card) px-1.5">
        <span className="size-[7px] shrink-0 rounded-full bg-(--p-gold)" />
        <span className="h-[3px] w-[22px] shrink-0 rounded-full bg-(--p-ink) opacity-55" />
        <span className="ml-auto h-[7px] w-[38%] rounded-full bg-(--p-ink) opacity-10" />
      </div>
      <div className="grid flex-1 grid-cols-3 content-start gap-1.5 p-1.5">
        {ART.map((tint) => (
          <div
            key={tint}
            className="flex aspect-5/7 flex-col gap-0.5 rounded-[3px] border border-(--p-border) bg-(--p-card) p-0.5"
          >
            <span className="h-[52%] shrink-0 rounded-[2px] opacity-90" style={{ background: tint }} />
            <span className="mx-0.5 h-[2px] rounded-full bg-(--p-ink) opacity-30" />
            <span className="mx-0.5 h-[2px] w-[55%] rounded-full bg-(--p-ink) opacity-20" />
          </div>
        ))}
      </div>
      <span className="absolute right-2 bottom-2 h-2.5 w-8 rounded-[3px] bg-(--p-gold)" />
    </div>
  )
}

// The dark half is cut on the anti-diagonal, and the seam is a thin
// parallelogram clipped to hug that same edge - which lands exactly on the cut
// at any aspect ratio, unlike a linear-gradient angle. Brand gold (#E8B23A,
// --dark-primary) because the seam belongs to neither half.
const SPLIT_CLIP = 'polygon(100% 0, 100% 100%, 0 100%)'
const SEAM_CLIP = 'polygon(0 100%, 100% 0, 100% 2px, 0 calc(100% - 2px))'

export function ThemePreview({ choice }: { choice: ThemeChoice }) {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-4/3 overflow-hidden rounded-md border border-border"
    >
      <Pane tone={choice === 'dark' ? 'dark' : 'light'} />
      {choice === 'system' && (
        <>
          <Pane tone="dark" style={{ clipPath: SPLIT_CLIP }} />
          <span
            className="absolute inset-0"
            style={{ background: 'var(--dark-primary)', clipPath: SEAM_CLIP }}
          />
        </>
      )}
    </div>
  )
}
