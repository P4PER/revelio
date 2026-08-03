'use client'
import { useSyncExternalStore } from 'react'

// Hover capability read via useSyncExternalStore, mirroring useIsMac() in
// components/ui/kbd-hint.tsx: the server snapshot assumes hover (desktop) and
// the client corrects to the real device after hydration without a mismatch
// warning. Hover capability doesn't change at runtime, so nothing to subscribe
// to. Used to force touch-friendly layouts where a hover affordance is unusable.
const noopSubscribe = () => () => {}

export function useHasHover() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.matchMedia('(hover: hover)').matches,
    () => true,
  )
}
