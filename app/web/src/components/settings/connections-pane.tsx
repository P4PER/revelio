import { useTranslations } from 'next-intl'
import { DiscordConnection } from './discord-connection'
import type { DiscordConnectionProps } from './types'

// The section shell and the list of providers. Everything a provider owns -
// its state, its copy, its dialog - lives in the provider's own component, so
// adding a second one is another line here rather than another branch inside
// this file.
export function ConnectionsPane(props: DiscordConnectionProps) {
  const t = useTranslations('settings.connections')

  return (
    <section aria-labelledby="s-connections" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-connections" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('lead')}</p>

      <DiscordConnection {...props} />
    </section>
  )
}
