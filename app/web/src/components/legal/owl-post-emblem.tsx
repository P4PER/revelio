import { cn } from '@/lib/utils'

type OwlPostEmblemProps = {
  // Still above the heading on a phone; flying over the success card once the
  // message is sent. Flying only animates for motion-safe users.
  flying?: boolean
  className?: string
}

// The contact page's winged envelope: a gold flight trail, the envelope with
// wings, and the four-point sparkle from the logo mark (logos/revelio-icon.svg)
// at the trail's head. Decorative; the copy next to it carries the meaning.
export function OwlPostEmblem({ flying = false, className }: OwlPostEmblemProps) {
  return (
    <div
      data-slot="owl-post-emblem"
      data-state={flying ? 'flying' : 'still'}
      aria-hidden="true"
      className={cn('pointer-events-none relative flex justify-center', className)}
    >
      {/* Soft gold glow behind the emblem. */}
      <div className="absolute left-1/2 top-3 h-28 w-44 -translate-x-1/2 rounded-full bg-primary/8 blur-2xl sm:h-36 sm:w-48" />
      <svg
        viewBox="0 0 140 100"
        fill="none"
        className={cn(
          'relative h-24 w-auto text-primary-ink [filter:drop-shadow(0_0_9px_var(--glow-owl))] sm:h-32',
          flying && 'motion-safe:animate-[owl-lift_620ms_ease-out]',
        )}
      >
        {/* Flight trail - draws itself from the launch point when flying. */}
        <path
          d="M18 88 C 34 82, 46 74, 56 62"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="0.5"
          strokeDasharray="130"
          className={cn(flying && 'motion-safe:animate-[trail-draw_720ms_200ms_ease-out_both]')}
        />
        <circle cx="18" cy="88" r="2.4" fill="currentColor" fillOpacity="0.6" />

        {/* Winged envelope. */}
        <path d="M58 42 C 44 34, 32 38, 22 34 C 32 42, 44 46, 57 47 Z" fill="currentColor" fillOpacity="0.85" />
        <path d="M82 42 C 96 34, 108 38, 118 34 C 108 42, 96 46, 83 47 Z" fill="currentColor" fillOpacity="0.85" />
        <rect x="58" y="38" width="24" height="17" rx="3" fill="currentColor" />
        <path
          d="M58.5 40.5 L70 49 L81.5 40.5"
          stroke="var(--color-background)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Destination spark, scaled down from the logo mark. */}
        <g
          transform="translate(112 17) scale(0.46) translate(-70 -34)"
          className={cn(flying && 'motion-safe:animate-[spark-pulse_2.4s_ease-in-out_infinite]')}
        >
          <path
            d="M70,16 Q73.4,30.6 88,34 Q73.4,37.4 70,52 Q66.6,37.4 52,34 Q66.6,30.6 70,16 Z"
            fill="currentColor"
          />
        </g>
      </svg>
    </div>
  )
}
