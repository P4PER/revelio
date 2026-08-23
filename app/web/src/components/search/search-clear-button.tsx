import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Takes over the slot the kbd hint vacates once a search field has text, so the
// padding the input reserves on its right always has an occupant and there is a
// visible way back to an empty field - the native search cancel button is
// hidden everywhere in this app.
//
// Visibility is driven off the sibling `peer` input's :placeholder-shown state
// rather than React state, which keeps this component hook-free so the
// server-rendered header stand-in can render it too. Callers own the
// positioning; the display toggle lives here.
//
// That makes a placeholder on the peer input part of the contract: an input
// without one never matches :placeholder-shown, so this button would sit there
// permanently, visible over an empty field.
export function SearchClearButton({
  label,
  onClear,
  className,
}: {
  label: string
  // Omitted by the header stand-in, which renders the same inert chrome.
  onClear?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClear}
      className={cn(
        'hidden size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none peer-[:not(:placeholder-shown)]:flex',
        className,
      )}
    >
      <X className="size-4" />
    </button>
  )
}
