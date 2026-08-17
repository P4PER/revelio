import { mulberry32 } from '@/lib/random'

// Decorative twinkling stars echoing the holofoil cards. Deterministic
// positions (seeded PRNG) so SSR and client render identically.
// Per-theme via CSS custom properties: the dark set is bright on midnight, the
// light set is darker so the stars stay visible on parchment.
const COLORS = [
  'var(--color-star-1)',
  'var(--color-star-2)',
  'var(--color-star-3)',
  'var(--color-star-4)',
  'var(--color-star-5)',
]
const rand = mulberry32(1337)
const STARS = Array.from({ length: 24 }, () => ({
  top: `${(rand() * 100).toFixed(2)}%`,
  left: `${(rand() * 100).toFixed(2)}%`,
  size: 5 + Math.round(rand() * 7),
  color: COLORS[Math.floor(rand() * COLORS.length)],
  delay: `${(rand() * 4).toFixed(2)}s`,
  dur: `${(2.4 + rand() * 2.8).toFixed(2)}s`,
}))

export function StarField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {STARS.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={s.size}
          height={s.size}
          className="absolute"
          style={{
            top: s.top,
            left: s.left,
            color: s.color,
            animation: `twinkle ${s.dur} ease-in-out ${s.delay} infinite`,
          }}
        >
          <path fill="currentColor" d="M12 1.6l2.7 7.3 7.7.2-6.1 4.7 2.2 7.4L12 17l-6.4 4.4 2.2-7.4-6.1-4.7 7.7-.2z" />
        </svg>
      ))}
    </div>
  )
}
