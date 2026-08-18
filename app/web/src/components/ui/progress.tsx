import * as React from "react"

import { cn } from "@/lib/utils"

// Lightweight, dependency-free progress bar (a determinate value 0–100).
// The shadcn CLI was unavailable in this environment, so this is a local
// primitive rather than the generated Radix wrapper; the API (`value`) matches.
//
// Fill and track come from --progress, not --primary: the gold FILL colour on
// parchment gave 1.48:1 against its own track, under the 3:1 WCAG 1.4.11 wants
// for a meaningful graphic. Dark keeps gold, where it already measures 5.85:1.
function Progress({
  value = 0,
  className,
  ...props
}: React.ComponentProps<"div"> & { value?: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-progress/20", className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-progress transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }
