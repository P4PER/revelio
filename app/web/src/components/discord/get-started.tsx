import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Kbd } from '@/components/ui/kbd'
import { CommandCode } from '@/components/discord/command-code'
import { DiscordCta } from '@/components/discord/discord-cta'

const STEPS = ['add', 'link', 'type'] as const

type Step = (typeof STEPS)[number]

function StepAction({ step, inviteUrl }: { step: Step; inviteUrl: string | null }) {
  const t = useTranslations('discord')
  if (step === 'add') return <DiscordCta inviteUrl={inviteUrl} size="sm" />
  if (step === 'link') {
    return (
      <Link
        href="/settings/connections"
        className="inline-flex items-center gap-1 rounded-full border border-primary/50 px-3 py-1 text-sm font-medium text-primary-ink transition-colors hover:bg-primary/10"
      >
        {t.rich('steps.linkAction', {
          sep: () => <ChevronRight className="size-3.5" aria-hidden />,
        })}
      </Link>
    )
  }
  return null
}

/**
 * The three things between a visitor and a working bot, as a timeline. Each
 * step carries the action that completes it where one exists on this site:
 * the install button (absent without an invite URL, so the step still reads
 * on a fresh database), the settings pane that links an account, and the key
 * to press in Discord.
 */
export function GetStarted({ inviteUrl }: { inviteUrl: string | null }) {
  const t = useTranslations('discord')
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {t('steps.title')}
      </h3>
      <ol className="mt-4 flex flex-col">
        {STEPS.map((step, i) => (
          <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
            {/* The line to the next step, running from under this circle. */}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="absolute top-9 bottom-1 left-[15px] w-0.5 rounded-full bg-gradient-to-b from-primary/50 to-border"
              />
            )}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col items-start gap-1.5 pt-1">
              <h4 className="text-base font-semibold text-foreground">{t(`steps.${step}Title`)}</h4>
              {step === 'type' ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Kbd className="h-9 min-w-9 border-b-[3px] font-mono text-lg text-primary-ink">/</Kbd>
                  {t('steps.typeBody')}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t.rich(`steps.${step}Body`, {
                    cmd: (chunks) => <CommandCode>{chunks}</CommandCode>,
                  })}
                </p>
              )}
              <StepAction step={step} inviteUrl={inviteUrl} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
