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
  { src: '/auth-fan/bs-111-wingardium-leviosa.webp', slot: 'left-0 top-[18px] -rotate-14 sm:top-[26px]' },
  { src: '/auth-fan/poa-71-lumos.webp', slot: 'left-[59px] top-[4px] -rotate-2 sm:left-[85px] sm:top-0' },
]
const REVELIO_SLOT = 'left-[118px] top-[14px] rotate-11 sm:left-[170px] sm:top-[18px]'

// Decoration above the sign-in and register forms: two real cards and the
// Revelio card. Hidden from assistive tech, not interactive, never animated.
// The Revelio card reads the --dark-* tokens, which :root defines in every
// theme, so it is the same brand indigo and gold on both: indigo rather than
// midnight, which on the dark theme is the page itself and lost the card's face.
export function AuthCardFan() {
  return (
    <div
      data-slot="auth-card-fan"
      aria-hidden="true"
      className="pointer-events-none relative mx-auto h-[150px] w-[206px] shrink-0 select-none sm:w-[306px]"
    >
      {IMAGE_SLOTS.map(({ src, slot }) => (
        <div key={src} className={cn('absolute overflow-hidden rounded-md shadow-lg sm:rounded-lg', SIZE, slot)}>
          <Image src={src} alt="" fill sizes="136px" className="object-cover" />
        </div>
      ))}
      <div
        className={cn(
          'absolute flex items-center justify-center rounded-md border-2 border-[var(--dark-primary)] bg-[var(--dark-brand-indigo)] shadow-lg sm:items-start sm:rounded-lg sm:border-[3px] sm:pt-7',
          SIZE,
          REVELIO_SLOT,
        )}
      >
        <Image src="/auth-fan/revelio-mark.svg" alt="" width={68} height={68} className="size-12 sm:size-[70px]" />
      </div>
    </div>
  )
}
