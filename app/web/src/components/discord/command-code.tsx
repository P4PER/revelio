import type { ReactNode } from 'react'

/**
 * A bot slash command rendered inside prose.
 *
 * The bot's commands are literal input the reader has to type in Discord, so
 * they render as code rather than as prose. Deliberately not Discord's blue
 * mention pill: on a web page it cannot be clicked, and a chip that looks
 * pressable but is not would promise something the page cannot do.
 *
 * The tint is a percentage of the foreground rather than a surface token, so it
 * steps the same amount away from its row in both themes: bg-background is
 * lighter than a card in the light theme but darker in the dark one, where it
 * reads as a black bar. nowrap keeps "/collection" whole when the row wraps.
 *
 * Shared by the Connections pane and the bot landing page so the two cannot
 * drift apart.
 */
export function CommandCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-foreground/10 px-1 py-px font-mono text-[0.95em] whitespace-nowrap text-foreground">
      {children}
    </code>
  )
}
