'use client'
import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/../i18n/navigation'
import { authClient } from '@/lib/auth-client'
import { unlinkDiscord } from '@/lib/actions/connections-actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { DiscordMark } from '@/components/discord-mark'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { DiscordConnectionProps } from './types'

const CONNECTIONS_PATH = '/settings/connections'

// The link fails inside the OAuth callback, long after linkSocial() has
// resolved, so the reason comes back as a query param on the return trip
// rather than as a rejected promise. Only the case a user can act on gets its
// own line; everything else reads as "try again".
const ERROR_KEYS: Record<string, string> = {
  account_already_linked_to_different_user: 'alreadyLinked',
  // Raised when the Discord account's own email is unverified. Retrying can
  // never fix it, so the generic "please try again" would send the user round
  // a loop that has no exit.
  unable_to_link_account: 'unverifiedDiscord',
}

// The bot's commands are literal input the reader has to type in Discord, so
// they render as code rather than as prose. Deliberately not Discord's blue
// mention pill: on a web page it cannot be clicked, and a chip that looks
// pressable but is not would promise something this page cannot do.
//
// The tint is a percentage of the foreground rather than a surface token, so it
// steps the same amount away from the row in both themes: bg-background is
// lighter than this row in the light theme but darker in the dark one, where it
// reads as a black bar. nowrap keeps "/collection" whole when the row wraps.
function cmd(chunks: ReactNode) {
  return (
    <code className="rounded bg-foreground/10 px-1 py-px font-mono text-[0.95em] whitespace-nowrap text-foreground">
      {chunks}
    </code>
  )
}

// One provider, one component: the pending flag, the failure line and the
// confirm dialog all belong to Discord alone. A second provider gets its own
// component beside this one rather than a share of this state, so that linking
// one cannot disable the other's button or show its error.
export function DiscordConnection({
  linked,
  configured,
  accountName,
  linkError,
}: DiscordConnectionProps) {
  const t = useTranslations('settings.connections')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState<'error' | 'unlinkError' | null>(null)
  const [confirming, setConfirming] = useState(false)

  function onUnlink() {
    start(async () => {
      setFailed(null)
      const res = await unlinkDiscord()
      // Closed either way: the failure line renders under the row, which the
      // dialog would otherwise cover.
      setConfirming(false)
      if (!res.ok) {
        setFailed('unlinkError')
        return
      }
      // `linked` is server state, so the row only flips once the page reloads.
      router.refresh()
    })
  }

  function onLink() {
    start(async () => {
      setFailed(null)
      // linkSocial resolves with {data, error} rather than throwing, and the
      // redirect only happens on the success shape - so an unchecked call turns
      // a rejected start (stale session, rate limit, bad client id) into a
      // button that visibly does nothing.
      const res = await authClient.linkSocial({
        provider: 'discord',
        callbackURL: CONNECTIONS_PATH,
        errorCallbackURL: CONNECTIONS_PATH,
      })
      if (res.error) setFailed('error')
    })
  }

  const error = failed
    ? t(failed)
    : linkError
      ? t(ERROR_KEYS[linkError] ?? 'error')
      : null

  // The badge already says "Linked", so a nameless linked account gets no
  // subline rather than the same word twice.
  const subline = !configured ? null : linked ? (accountName ? `@${accountName}` : null) : t('notLinked')

  return (
    <>
      <div className="flex flex-wrap items-center gap-3.5 rounded-lg border border-border bg-muted/50 p-4">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-discord text-white',
            !configured && 'opacity-50',
          )}
        >
          <DiscordMark className="size-6" />
        </span>

        <span className="flex min-w-0 flex-1 basis-40 flex-col">
          <strong className="text-sm font-semibold">{t('discordTitle')}</strong>
          {subline && <span className="truncate text-sm text-muted-foreground">{subline}</span>}
        </span>

        {!configured ? (
          <span className="flex-1 basis-48 text-sm text-muted-foreground">{t('unavailable')}</span>
        ) : linked ? (
          <span className="flex flex-wrap items-center gap-3">
            {/* Green enough to read as a state at a glance, tinted rather than
                solid so it does not compete with the Unlink button beside it.
                text-success-ink, not text-success: the fill green is 3.1:1 on
                this row in the light theme, which is fine for a dot and not for
                a word. The word carries the meaning on its own, so no dot. */}
            <Badge variant="outline" className="border-success/30 bg-success/10 text-success-ink">
              {t('linked')}
            </Badge>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
              {t('unlink')}
            </Button>
          </span>
        ) : (
          <Button size="sm" disabled={pending} onClick={onLink}>
            <DiscordMark />
            {t('link')}
          </Button>
        )}

        {configured && (
          <p className="basis-full border-t border-border pt-3 text-sm text-muted-foreground">
            {t.rich('discordBody', { cmd })}
          </p>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unlinkTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {accountName
                ? t.rich('unlinkBodyNamed', { name: `@${accountName}`, cmd })
                : t.rich('unlinkBody', { cmd })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* AlertDialogCancel, not a plain Button: Radix preventDefaults its own
                open-autofocus and then focuses this element's ref, so without it
                focus never enters the dialog and stays on the covered trigger.
                The confirm below stays a plain Button on purpose - AlertDialogAction
                closes on click, and this dialog has to stay up while the unlink is
                in flight and close only once it has answered. */}
            <AlertDialogCancel asChild>
              <Button type="button" size="sm" variant="outline" disabled={pending}>
                {t('cancel')}
              </Button>
            </AlertDialogCancel>
            <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={onUnlink}>
              {t('confirmUnlink')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
