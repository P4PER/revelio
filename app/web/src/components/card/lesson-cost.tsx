import { cn } from '@/lib/utils'

// Lesson cost rendered as the lesson's own symbol with the cost number overlaid,
// in the style of a mana pip. Icons live in /public/lessons/<code>.svg and keep
// their printed colours; the number is white with a dark outline so it stays
// legible on every icon colour (including the light Quidditch gold).
export function LessonCost({
  lesson,
  cost,
  label,
  className,
  numberClassName = 'text-2xl',
}: {
  lesson: string
  cost: number | null
  label: string
  className?: string
  // Font size of the overlaid cost number, so the pip can be reused at small
  // sizes (e.g. the deck panel rows) where the default text-2xl would overflow.
  numberClassName?: string
}) {
  return (
    <span
      role="img"
      aria-label={cost != null ? `${cost} ${label}` : label}
      className={cn('relative inline-flex h-9 items-center justify-center', className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/lessons/${lesson}.svg`} alt="" aria-hidden className="h-full w-auto" />
      {cost != null && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 flex items-center justify-center font-bold leading-none text-white [-webkit-text-stroke:0.6px_rgba(0,0,0,0.55)] [text-shadow:0_1px_1.5px_rgba(0,0,0,0.6)]',
            numberClassName,
          )}
        >
          {cost}
        </span>
      )}
    </span>
  )
}
