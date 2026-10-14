import type { Metadata } from 'next'
import { Bug, ScrollText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ContactForm } from '@/components/legal/contact-form'
import { DiscordMark } from '@/components/discord-mark'
import { StarField } from '@/components/star-field'
import { getSession } from '@/lib/server/session'
import { getCachedSiteSettings } from '@/lib/server/site-settings'

// Rendered per request so the submit-timing token is fresh and never statically cached.
export const dynamic = 'force-dynamic'

// What the topic list offers, in order. Icons are decorative: each item's
// title says what it is.
const TOPICS = [
  { key: 'Cards', Icon: ScrollText },
  { key: 'Bugs', Icon: Bug },
  { key: 'Bot', Icon: DiscordMark },
] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contact')
  return { title: t('metaTitle') }
}

export default async function ContactPage() {
  const t = await getTranslations('contact')

  // Prefill for signed-in users so they don't retype what we already know. Mirrors
  // the app's display-name convention (displayUsername ?? username).
  const user = (await getSession())?.user
  const defaultName = user?.displayUsername ?? user?.username ?? ''
  const defaultEmail = user?.email ?? ''
  const githubUrl = (await getCachedSiteSettings())?.githubUrl ?? null

  // Centred like the login page from `sm` up; on a phone it stays at the top,
  // where an opening keyboard would otherwise shift a centred form.
  return (
    <main className="relative mx-auto flex w-full max-w-[480px] flex-col px-4 py-6 sm:min-h-[calc(100dvh-var(--header-h))] sm:justify-center sm:px-0 md:py-12 lg:max-w-[76rem] lg:px-6">
      <StarField />
      {/* A fresh per-request submit-timing token. This page is force-dynamic, so it
          renders once per request - Date.now() is intentional here (no re-render
          instability in a server component), which the purity rule can't infer. */}
      <ContactForm
        // eslint-disable-next-line react-hooks/purity
        renderedAt={Date.now()}
        defaultName={defaultName}
        defaultEmail={defaultEmail}
        intro={
          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground lg:text-4xl">
              {t('titlePrefix')} <span className="text-heading">{t('titleAccent')}</span>
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground lg:mt-5">{t('intro')}</p>
            <ul aria-label={t('topicsLabel')} className="mt-12 hidden flex-col gap-9 lg:flex">
              {TOPICS.map(({ key, Icon }) => (
                <li key={key} className="flex gap-3.5">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary-ink"
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-foreground">{t(`topic${key}Title`)}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{t(`topic${key}Body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        }
        footer={
          githubUrl && (
            <p className="text-center text-sm text-muted-foreground lg:border-t lg:border-border lg:pt-5 lg:text-left">
              {t.rich('github', {
                link: (chunks) => (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-ink underline underline-offset-2"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          )
        }
      />
    </main>
  )
}
