import Image from 'next/image'
import { cn } from '@/lib/utils'

// Slot geometry, left to right. Below `sm` the cards are small and drawn whole;
// from `sm` up they are full size and their lower part runs out of the 150px box,
// behind the form card (which sits above at z-10). Positions are relative to a
// centred box exactly as wide as the fan (206px / 306px).
const SIZE = 'h-[123px] w-[88px] sm:h-[190px] sm:w-[136px]'

// Two upright Charms spells, served from /public like the Discord page's sample
// card: a fixed decoration needs no database read, no cache to go stale when an
// editor replaces a card image, and no fallback. Most other cards are stored
// sideways (every character, and e.g. Norbert and Golden Snitch), which reads
// as a mistake in a fan; Lumos is a light charm, which suits the "reveal" brand.
const IMAGE_SLOTS = [
  { src: '/auth/bs-111-wingardium-leviosa.webp', slot: 'left-0 top-[18px] -rotate-14 sm:top-[26px]' },
  { src: '/auth/poa-71-lumos.webp', slot: 'left-[59px] top-[4px] -rotate-2 sm:left-[85px] sm:top-0' },
]
// The scans' own frames are black, which on the dark theme's page left the two
// cards without an edge. A thin parchment ring gives them one, as a card's
// border catching the light; on the light theme the black frame already reads.
const SCAN_EDGE = 'dark:ring-[1.5px] dark:ring-[color-mix(in_srgb,var(--dark-foreground)_45%,transparent)]'
const REVELIO_SLOT = 'left-[118px] top-[14px] rotate-11 sm:left-[170px] sm:top-[18px]'

// Decoration above the sign-in and register forms: two real cards and the
// Revelio card. Hidden from assistive tech, not interactive, never animated.
// The Revelio card reads the --dark-* tokens, which :root defines in every
// theme, so it looks the same on both. Its face is the form card's midnight
// (--dark-card), which ties it to the form; the gold border and inner frame
// keep it apart from the dark theme's page, which is only a shade darker. The
// mark and the logo's own wordmark make it read as a card rather than a tile.
// From `sm` up the lower part of the card runs behind the form, so its content
// sits in the top, visible part.
export function AuthCardFan() {
  return (
    <div
      data-slot="auth-card-fan"
      aria-hidden="true"
      className="pointer-events-none relative mx-auto h-[150px] w-[206px] shrink-0 select-none sm:w-[306px]"
    >
      {IMAGE_SLOTS.map(({ src, slot }) => (
        <div key={src} className={cn('absolute overflow-hidden rounded-md shadow-lg sm:rounded-lg', SCAN_EDGE, SIZE, slot)}>
          <Image src={src} alt="" fill sizes="136px" className="object-cover" />
        </div>
      ))}
      <div
        className={cn(
          'absolute flex items-center justify-center rounded-md border-2 border-[var(--dark-primary)] bg-[var(--dark-card)] shadow-lg sm:items-start sm:rounded-lg sm:border-[3px] sm:pt-[22px]',
          SIZE,
          REVELIO_SLOT,
        )}
      >
        <div className="absolute inset-1 rounded-sm border border-[color-mix(in_srgb,var(--dark-primary)_65%,transparent)] sm:inset-[7px] sm:rounded-[5px]" />
        <div className="relative flex flex-col items-center gap-1 sm:gap-2">
          <Image src="/revelio-icon-parchment.svg" alt="" width={56} height={56} className="size-9 sm:size-14" />
          <Image src="/revelio-wordmark-on-dark.svg" alt="" width={86} height={24} className="h-auto w-[52px] sm:w-[86px]" />
        </div>
      </div>
    </div>
  )
}
