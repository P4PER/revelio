import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
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

// The reference tile's target: set it back to null to hide the tile again.
const DOCS_HREF = '/docs/discord'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
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

      {/* min-h-lvh: under the site header, a whole viewport pushes the commands
          section below the fold, so its slash menu never peeks in at the bottom
          of the first screen. lvh, not svh, so that holds with a phone's toolbar
          collapsed too. content-start packs the rows at the top, so the extra
          height goes below the hero: its content starts as far under the header
          as /about's, and the stacked layout's two rows are not pulled apart.
          e2e/discord.spec.ts measures the fold, the offset and the stacked gap;
          desktop Chromium has no collapsing toolbar, so lvh over svh is not
          under test. */}
      <section
        data-testid="hero"
        className="relative grid min-h-lvh content-start items-center gap-10 pt-16 pb-14 sm:pt-20 md:grid-cols-[0.92fr_1.08fr]"
      >
        <div data-testid="hero-copy" className="flex flex-col items-start gap-5">
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

      <CommandGrid docsHref={DOCS_HREF} inviteUrl={inviteUrl} />
    </main>
  )
}

export default async function DiscordPage() {
  const settings = await getCachedSiteSettings()
  return <DiscordContent inviteUrl={settings?.discordInviteUrl ?? null} />
}
