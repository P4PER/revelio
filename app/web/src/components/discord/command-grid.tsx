import { Lock, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CommandCode } from '@/components/discord/command-code'
import { CommandPicker } from '@/components/discord/command-picker'
import { GetStarted } from '@/components/discord/get-started'
import { ReferenceTile } from '@/components/discord/reference-tile'

/**
 * The bot's commands section: the heading, who sees which answer and how to
 * get started on the left, Discord's slash menu listing every command on the
 * right, and the reference below both. Passing no `docsHref` drops the
 * reference tile; no `inviteUrl` drops only the install button in the steps.
 */
export function CommandGrid({
  docsHref,
  inviteUrl,
}: {
  docsHref?: string | null
  inviteUrl: string | null
}) {
  const t = useTranslations('discord')
  return (
    <section
      id="commands"
      aria-labelledby="commands-title"
      // scroll-mt keeps the heading off the viewport edge when the hero CTA
      // lands here, rather than flush against the top.
      className="scroll-mt-8 border-t border-border/60 py-14"
    >
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div className="flex min-w-0 flex-col gap-5">
          <h2
            id="commands-title"
            className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl"
          >
            {t.rich('commandsTitle', {
              b: (chunks) => <span className="text-heading">{chunks}</span>,
            })}
          </h2>
          <p className="max-w-[42ch] text-muted-foreground">{t('commandsIntro')}</p>
          {/* Most commands answer privately, so the legend names the
              exceptions: the commands that post where everyone can see, which
              is what a visitor worries about. command-grid.test.tsx holds the
              named ones to the manifest. The icons match the menu's rows. */}
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2.5">
              <Users className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
              <span>
                {t.rich('channelNote', {
                  cmd: (chunks) => <CommandCode>{chunks}</CommandCode>,
                })}
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Lock className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
              <span>{t('privateNote')}</span>
            </li>
          </ul>
          <GetStarted inviteUrl={inviteUrl} />
        </div>

        <div className="min-w-0">
          <CommandPicker />
        </div>
      </div>

      {docsHref && <ReferenceTile href={docsHref} />}
    </section>
  )
}
