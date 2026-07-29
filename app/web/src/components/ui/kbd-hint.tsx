'use client'
import { useSyncExternalStore } from 'react'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

// Platform read via useSyncExternalStore: the server snapshot assumes macOS (⌘),
// the client corrects to the real platform after hydration without a mismatch
// warning. Nothing to subscribe to — the platform never changes at runtime.
const noopSubscribe = () => () => {}
function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => true,
  )
}

// A search-field keyboard affordance built on the shadcn Kbd. `cmdk` renders ⌘K
// (Ctrl K off macOS); `slash` renders a single "/". Hidden on touch-first widths
// where there's no keyboard, and fades out on focus / once the sibling `peer`
// input has text (so callers only pass positioning).
export function KbdHint({
  className,
  shortcut = 'cmdk',
}: {
  className?: string
  shortcut?: 'cmdk' | 'slash'
}) {
  const mac = useIsMac()

  return (
    <KbdGroup
      aria-hidden
      className={cn(
        'pointer-events-none hidden select-none transition-opacity peer-focus:opacity-0 peer-[:not(:placeholder-shown)]:opacity-0 sm:inline-flex',
        className,
      )}
    >
      {shortcut === 'slash' ? (
        <Kbd>/</Kbd>
      ) : (
        <>
          <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </>
      )}
    </KbdGroup>
  )
}
