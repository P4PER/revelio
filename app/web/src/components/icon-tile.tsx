import type { ComponentType } from 'react'

/**
 * A decorative icon on a small muted tile, the leading mark of an icon list
 * (/contact's topics, /discord's trust points). Shared so those lists keep one
 * look; the label beside it always says what the icon means.
 */
export function IconTile({ Icon }: { Icon: ComponentType<{ className?: string }> }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary-ink"
    >
      <Icon className="size-[18px]" />
    </span>
  )
}
