import type { Metadata } from 'next'
import { ArrowUpRight } from 'lucide-react'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { getCachedSiteSettings } from '@/lib/site-settings'
import { BRAND_NAME } from '@/lib/brand'
import { StarField } from '@/components/star-field'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

// The four Harry Potter TCG Lessons that have a canonical colour — the game's
// own resource system. Used as the hero's signature accent rule.
const LESSON_RULE =
  'linear-gradient(90deg, transparent, #0069A9 20%, #00A661 40%, #E2AE37 60%, #BC3E4D 80%, transparent)'

const TECH = ['Next.js', 'React', 'Meilisearch', 'PostgreSQL', 'Tailwind CSS']

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('about')
  return { title: t('metaTitle') }
}

export function AboutContent({ githubUrl }: { githubUrl: string | null }) {
  const t = useTranslations('about')
  return (
    <main className="relative mx-auto max-w-[76rem] px-6">
      <StarField />

      <section className="relative flex flex-col items-center pt-20 pb-16 text-center sm:pt-28">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-4 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]"
        />
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {t('eyebrow')}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          {t('titlePrefix')} <span className="text-primary">{BRAND_NAME}</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t('tagline')}
        </p>
        <div aria-hidden className="mt-8 h-px w-64 max-w-[75%]" style={{ backgroundImage: LESSON_RULE }} />
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/sets">{t('ctaBrowse')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/random">{t('ctaRandom')}</Link>
          </Button>
          {githubUrl && (
            <Button variant="outline" asChild>
              <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                {t('ctaGithub')}
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-2xl border-t border-border/60 py-14">
        <h2 className="text-xl font-semibold text-foreground">{t('storyTitle')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t('storyBody1')}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t('storyBody2')}
        </p>

        <h2 className="mt-12 text-xl font-semibold text-foreground">{t('builtTitle')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t('builtBody')}
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {TECH.map((name) => (
            <li
              key={name}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
            >
              {name}
            </li>
          ))}
        </ul>
        {githubUrl && (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t.rich('builtGithub', {
              link: (chunks) => (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        )}

        <h2 className="mt-12 text-xl font-semibold text-foreground">{t('creditsTitle')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t('creditsBody')}
        </p>

        <h2 className="mt-12 text-xl font-semibold text-foreground">{t('exploreTitle')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t.rich('exploreBody', {
            sets: (chunks) => (
              <Link href="/sets" className="text-primary underline underline-offset-2">
                {chunks}
              </Link>
            ),
            random: (chunks) => (
              <Link href="/random" className="text-primary underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>
    </main>
  )
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return <AboutContent githubUrl={settings?.githubUrl ?? null} />
}
