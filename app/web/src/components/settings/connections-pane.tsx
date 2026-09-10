'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/../i18n/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

const CONNECTIONS_PATH = '/settings/connections'

// The link fails inside the OAuth callback, long after linkSocial() has
// resolved, so the reason comes back as a query param on the return trip
// rather than as a rejected promise. Only the case a user can act on gets its
// own line; everything else reads as "try again".
const ERROR_KEYS: Record<string, string> = {
  account_already_linked_to_different_user: 'alreadyLinked',
}

export function ConnectionsPane({
  linked,
  configured,
  linkError,
}: {
  linked: boolean
  configured: boolean
  linkError?: string
}) {
  const t = useTranslations('settings.connections')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [unlinkFailed, setUnlinkFailed] = useState(false)

  function onUnlink() {
    start(async () => {
      setUnlinkFailed(false)
      const res = await authClient.unlinkAccount({ providerId: 'discord' })
      if (res.error) {
        setUnlinkFailed(true)
        return
      }
      // `linked` is server state, so the pane only flips once the page reloads.
      router.refresh()
    })
  }

  function onLink() {
    start(async () => {
      await authClient.linkSocial({
        provider: 'discord',
        callbackURL: CONNECTIONS_PATH,
        errorCallbackURL: CONNECTIONS_PATH,
      })
    })
  }

  const error = unlinkFailed
    ? t('unlinkError')
    : linkError
      ? t(ERROR_KEYS[linkError] ?? 'error')
      : null

  return (
    <section aria-labelledby="s-connections" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-connections" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('lead')}</p>

      <h3 className="text-sm font-medium">{t('discordTitle')}</h3>
      <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">{t('discordBody')}</p>

      {!configured ? (
        <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
      ) : linked ? (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">{t('linked')}</span>
          <Button variant="outline" size="sm" disabled={pending} onClick={onUnlink}>
            {t('unlink')}
          </Button>
        </div>
      ) : (
        <Button size="sm" disabled={pending} onClick={onLink}>{t('link')}</Button>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  )
}
