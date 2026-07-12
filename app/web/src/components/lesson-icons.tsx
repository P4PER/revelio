// Fixed-size row of lesson symbols for deck list entries. Plain component (no
// 'use client') so it renders in both the server browse page and client entries.
// Uses a plain <img> (SVGs are static public assets) to keep it framework-light.
export function LessonIcons({
  codes,
  size = 18,
  max = 4,
}: {
  codes: string[]
  size?: number
  max?: number
}) {
  if (!codes.length) return null
  const shown = codes.slice(0, max)
  const overflow = codes.length - shown.length
  return (
    <span className="inline-flex items-center gap-1" aria-label="Lessons">
      {shown.map((code) => (
        <img
          key={code}
          src={`/lessons/${code}.svg`}
          alt={code}
          width={size}
          height={size}
          className="inline-block"
          style={{ width: size, height: size }}
        />
      ))}
      {overflow > 0 && (
        <span className="rounded bg-muted px-1 text-xs font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </span>
  )
}
