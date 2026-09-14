import { BookText, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'

type CommandKey = 'card' | 'search' | 'deck' | 'collection' | 'mydecks'

type Command = { key: CommandKey; personal: boolean }

// Order is most-used first, as the design shows it. `personal` drives the "only
// you see it" tag: those two commands defer ephemerally in the bot (see
// bot/src/discord/commands/collection.ts), so the page must not imply their
// answers land in the channel for everyone.
const COMMANDS: readonly Command[] = [
  { key: 'card', personal: false },
  { key: 'search', personal: false },
  { key: 'deck', personal: false },
  { key: 'collection', personal: true },
  { key: 'mydecks', personal: true },
]

const STEPS = ['add', 'link', 'type'] as const

function CommandCard({ command }: { command: Command }) {
  const t = useTranslations('discord')
  const options = t(`commands.${command.key}.options`)
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
      <span className="font-mono text-sm font-medium text-primary-ink">/{command.key}</span>
      {options && <span className="font-mono text-xs text-secondary-ink">{options}</span>}
      <span className="text-sm leading-relaxed text-muted-foreground">
        {t(`commands.${command.key}.description`)}
      </span>
      {command.personal && (
        <span className="mt-auto self-start rounded-full border border-border px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-wider text-muted-foreground">
          {t('ephemeral')}
        </span>
      )}
    </li>
  )
}

/**
 * The reference tile. Deliberately not a sixth command: dashed indigo border, a
 * document glyph and a sans-face title, so nobody reads it as something they can
 * type. It is absent until a docs route exists, which keeps the grid from
 * offering a link to a 404 - five tiles still fill the rows cleanly.
 */
function ReferenceTile({ href }: { href: string }) {
  const t = useTranslations('discord')
  return (
    <li>
      <Link
        href={href}
        className="flex h-full flex-col justify-center gap-1.5 rounded-xl border border-dashed border-secondary-ink/55 bg-secondary/25 p-4 transition-colors hover:bg-secondary/40"
      >
        <BookText className="size-5 text-secondary-ink" aria-hidden />
        <span className="flex items-center gap-1.5 font-semibold text-secondary-ink">
          {t('reference.title')}
          <ArrowRight className="size-4" aria-hidden />
        </span>
        <span className="text-sm leading-relaxed text-muted-foreground">
          {t('reference.description')}
        </span>
      </Link>
    </li>
  )
}

export function CommandGrid({ docsHref }: { docsHref?: string | null }) {
  const t = useTranslations('discord')
  return (
    <section id="commands" className="border-t border-border/60 py-14">
      <h2 className="text-center text-xl font-semibold text-foreground">{t('commandsTitle')}</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground">
        {t('commandsIntro')}
      </p>

      <ul className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMMANDS.map((command) => (
          <CommandCard key={command.key} command={command} />
        ))}
        {docsHref && <ReferenceTile href={docsHref} />}
      </ul>

      <ol className="mx-auto mt-10 grid max-w-3xl gap-5 border-t border-border/60 pt-8 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/50 font-mono text-xs text-primary-ink">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              <b className="block text-[0.9rem] font-medium text-foreground">
                {t(`steps.${step}Title`)}
              </b>
              {t(`steps.${step}Body`)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
