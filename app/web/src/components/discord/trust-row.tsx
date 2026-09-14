import { Server, EyeOff, Lock, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

type TrustKey = 'anyServer' | 'noMessages' | 'privateReplies'

/*
 * Reassurance at the moment of the install decision: someone is about to give a
 * bot access to their server, and these are the three things they want to know.
 * Icon-and-label pairs rather than a sentence, because this is scanned on the
 * way to the button, not read.
 *
 * "Cannot read your messages" is a literal statement of the gateway intents the
 * bot asks for - GatewayIntentBits.Guilds only, see bot/src/main.ts. If that
 * ever changes, this claim has to go.
 */
const TRUST: readonly { key: TrustKey; Icon: LucideIcon }[] = [
  { key: 'anyServer', Icon: Server },
  { key: 'noMessages', Icon: EyeOff },
  { key: 'privateReplies', Icon: Lock },
]

export function TrustRow() {
  const t = useTranslations('discord.trust')
  return (
    // Stacked rather than wrapped: in the hero's narrow column a flex-wrap row
    // breaks two-then-one, which reads as an accident instead of a list.
    <ul className="flex flex-col gap-2">
      {TRUST.map(({ key, Icon }) => (
        <li key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4 shrink-0 text-primary-ink" aria-hidden />
          {t(key)}
        </li>
      ))}
    </ul>
  )
}
