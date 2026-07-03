// Decorative twinkling stars echoing the holofoil cards. Deterministic
// positions (seeded PRNG) so SSR and client render identically.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLORS = ['#E8B23A', '#6E66C9', '#7B8FD4', '#E0AEE0', '#7BC96F']
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
