'use client'
import { Info } from 'lucide-react'

// Overlay info button for card tiles. Shared so the deck overview gallery and
// the deck builder browser render the exact same control.
export function CardInfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute top-2 right-2 z-30 cursor-pointer rounded-full border border-white/40 bg-black/60 p-2.5 text-white opacity-0 shadow-md backdrop-blur-sm transition hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"
    >
      <Info className="size-5" />
    </button>
  )
}
