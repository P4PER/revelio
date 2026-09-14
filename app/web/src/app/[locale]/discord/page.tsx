import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { getPathname } from '@/../i18n/navigation'
import { getCachedSiteSettings } from '@/lib/server/site-settings'
import { SITE_URL as BASE_URL } from '@/lib/site'
import { StarField } from '@/components/star-field'
import { Button } from '@/components/ui/button'
import { CommandChannel } from '@/components/discord/command-channel'
import { CommandGrid } from '@/components/discord/command-grid'
import { DiscordCta } from '@/components/discord/discord-cta'
import { TrustRow } from '@/components/discord/trust-row'

// The reference tile's target. `/docs/discord` is not built yet, so this link
// is live ahead of its page: set it back to null to hide the tile again.
const DOCS_HREF = '/docs/discord'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('discord')

  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}${getPathname({ href: '/discord', locale: l })}`]),
  )
  languages['x-default'] =
    `${BASE_URL}${getPathname({ href: '/discord', locale: routing.defaultLocale })}`

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${BASE_URL}${getPathname({ href: '/discord', locale })}`,
      languages,
    },
  }
}

export function DiscordContent({ inviteUrl }: { inviteUrl: string | null }) {
  const t = useTranslations('discord')
  return (
    <main className="relative mx-auto max-w-[76rem] px-6">
      <StarField />

      <section className="relative grid items-center gap-10 pt-16 pb-14 sm:pt-20 md:grid-cols-[0.92fr_1.08fr]">
        <div className="flex flex-col items-start gap-5">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
            {t.rich('heading', {
              b: (chunks) => <span className="text-heading">{chunks}</span>,
            })}
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">{t('tagline')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <DiscordCta inviteUrl={inviteUrl} />
            <Button variant="outline" asChild>
              <a href="#commands">{t('seeAnswers')}</a>
            </Button>
          </div>
          <TrustRow />
        </div>

        <CommandChannel />
      </section>

      <CommandGrid docsHref={DOCS_HREF} />
    </main>
  )
}

export default async function DiscordPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return <DiscordContent inviteUrl={settings?.discordInviteUrl ?? null} />
}
