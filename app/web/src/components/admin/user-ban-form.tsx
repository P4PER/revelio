'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { banUser, unbanUser, type BanUserResult, type UserActionResult } from '@/lib/actions/user-admin-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/date-picker'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Props = {
  userId: string
  banned: boolean
  currentReason: string | null
  currentExpires: string | null // ISO date (yyyy-mm-dd) or null
  disabled: boolean
}

const ERROR_KEYS: Record<string, 'selfError' | 'reasonRequiredError'> = {
  self: 'selfError',
  'reason-required': 'reasonRequiredError',
}

// A temporary ban longer than this should be a permanent one (no expiry).
const MAX_BAN_YEARS = 10

// Better Auth lifts a ban whose expiry has passed, and expiry days are stored at
// UTC midnight, so the earliest day that still bans anyone is tomorrow.
function tomorrow(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

function maxExpiry(): Date {
  return new Date(tomorrow().getFullYear() + MAX_BAN_YEARS, 11, 31)
}

export function UserBanForm({ userId, banned, currentReason, currentExpires, disabled }: Props) {
  const t = useTranslations('admin.users')
  const [reason, setReason] = useState('')
  const [expires, setExpires] = useState('') // yyyy-mm-dd, '' means no expiry
  const [pending, start] = useTransition()

  function handle(action: Promise<BanUserResult | UserActionResult>) {
    start(async () => {
      const r = await action
      if (r.ok && 'warning' in r) toast.warning(t('banNotifyFailed'))
      else if (r.ok) toast.success(t('saved'))
      else toast.error(t(ERROR_KEYS[r.error] ?? 'saveError'))
    })
  }

  if (banned) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge className="border-red-600/20 bg-red-500/15 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400">
            {t('banned')}
          </Badge>
          {currentReason && <span>{currentReason}</span>}
          {currentExpires && <span>({currentExpires})</span>}
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" disabled={disabled || pending} onClick={() => handle(unbanUser(userId))}>
            {t('unbanAction')}
          </Button>
          {disabled && <span className="text-xs text-muted-foreground">{t('cannotSelf')}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ban-reason">{t('banReason')}</Label>
        <Input
          id="ban-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
          aria-describedby="ban-reason-hint"
        />
        <p id="ban-reason-hint" className="text-xs text-muted-foreground">
          {t('banReasonHint')}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ban-expires">{t('banExpires')}</Label>
        <DatePicker id="ban-expires" value={expires} onChange={setExpires} disabled={disabled} minDate={tomorrow()} maxDate={maxExpiry()} />
      </div>
      <div className="flex items-center gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" disabled={disabled || pending || !reason.trim()}>{t('banAction')}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('banConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('banConfirmBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => handle(banUser(userId, reason, expires || null))}>
                {t('banAction')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {disabled && <span className="text-xs text-muted-foreground">{t('cannotSelf')}</span>}
      </div>
    </div>
  )
}
