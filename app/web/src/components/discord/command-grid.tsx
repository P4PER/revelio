import { BookText, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { BOT_COMMANDS, type BotCommandName, type BotCommandSpec } from '@revelio/core'
import { Link } from '@/../i18n/navigation'
import { CommandCode } from '@/components/discord/command-code'

// Display order only - most-used first. Everything else about a command (its
// options, whether it answers in the channel) comes from BOT_COMMANDS,
// which bot/test/command-manifest.test.ts holds to what the bot registers. The
// grid used to keep its own copy and kept showing an option the bot had dropped.
//
// Option names are data, not copy: they are the literal option names the bot
// registers with Discord, identical in every language, so a visitor types the
// same thing either way.
const ORDER: readonly BotCommandName[] = ['card', 'search', 'deck', 'decks', 'collection', 'mydecks']

const COMMANDS: readonly BotCommandSpec[] = ORDER.flatMap((name) => BOT_COMMANDS.filter((c) => c.name === name))

const STEPS = ['add', 'link', 'type'] as const

function CommandCard({ command }: { command: BotCommandSpec }) {
  const t = useTranslations('discord')
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
      <span className="font-mono text-sm font-medium text-primary-ink">/{command.name}</span>
      {/* Chips, like every other typed thing on the page. Plain indigo text was
          illegible against the card and plain muted text was indistinguishable
          from the description below; the tinted chip is both readable and
          clearly a different kind of thing from prose. */}
      {command.options.length > 0 && (
        <span className="flex flex-wrap gap-1 text-xs">
          {command.options.map((option) => (
            <CommandCode key={option.name}>{option.name}</CommandCode>
          ))}
        </span>
      )}
      <span className="text-sm leading-relaxed text-muted-foreground">
        {t(`commands.${command.name}.description`)}
      </span>
    </li>
  )
}

/**
 * The reference tile. Deliberately not a seventh command: a dashed border, a
 * document glyph and a sans-face title, so nobody reads it as something they can
 * type. It carries the same card surface as its neighbours and spends its accent
 * on the gold primary rather than a blue wash, which stayed legible in neither
 * theme. Six command tiles fill two rows of three, so the tile spans the row
 * below them rather than sitting in it alone; passing no `docsHref` drops it
 * and the six still fill their rows.
 */
function ReferenceTile({ href }: { href: string }) {
  const t = useTranslations('discord')
  return (
    <li className="col-span-full">
      <Link
        href={href}
        className="flex h-full items-center gap-4 rounded-xl border border-dashed border-primary/50 bg-card p-4 transition-colors hover:bg-accent/40"
      >
        <BookText className="size-5 shrink-0 text-primary-ink" aria-hidden />
        {/* Title over the description on a phone, beside it from sm up. */}
        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <span className="whitespace-nowrap font-semibold text-foreground">
            {t('reference.title')}
          </span>
          <span className="text-sm leading-relaxed text-muted-foreground">
            {t('reference.description')}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-primary-ink" aria-hidden />
      </Link>
    </li>
  )
}

export function CommandGrid({ docsHref }: { docsHref?: string | null }) {
  const t = useTranslations('discord')
  return (
    <section
      id="commands"
      aria-labelledby="commands-title"
      // scroll-mt keeps the heading off the viewport edge when the hero CTA
      // lands here, rather than flush against the top.
      className="scroll-mt-8 border-t border-border/60 py-14"
    >
      <h2 id="commands-title" className="text-center text-xl font-semibold text-foreground">
        {t('commandsTitle')}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-balance text-center text-sm text-muted-foreground">
        {t.rich('commandsIntro', {
          slash: (chunks) => (
            <span className="font-mono font-medium text-primary-ink">{chunks}</span>
          ),
        })}
      </p>
      {/* Most commands answer privately, so a tag on each tile stopped telling
          them apart. This names the exceptions instead: the commands that
          post where everyone can see, which is what a visitor worries about.
          command-grid.test.tsx holds the named ones to the manifest. */}
      <p className="mx-auto mt-1 max-w-md text-balance text-center text-sm text-muted-foreground">
        {t.rich('channelNote', {
          cmd: (chunks) => <CommandCode>{chunks}</CommandCode>,
        })}
      </p>

      <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMMANDS.map((command) => (
          <CommandCard key={command.name} command={command} />
        ))}
        {docsHref && <ReferenceTile href={docsHref} />}
      </ul>

      <ol className="mx-auto mt-10 grid max-w-4xl gap-5 border-t border-border/60 pt-8 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/50 font-mono text-xs text-primary-ink">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              <b className="block text-[0.9rem] font-medium text-foreground">
                {t(`steps.${step}Title`)}
              </b>
              {t.rich(`steps.${step}Body`, {
                cmd: (chunks) => <CommandCode>{chunks}</CommandCode>,
              })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
