import * as React from "react"

import { cn } from "@/lib/utils"

// Lightweight, dependency-free progress bar (a determinate value 0–100).
// The shadcn CLI was unavailable in this environment, so this is a local
// primitive rather than the generated Radix wrapper; the API (`value`) matches.
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
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }
