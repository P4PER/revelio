'use client'
import { useState, useTransition } from 'react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { requestAccountDeletion, confirmAccountDeletion } from '@/lib/settings-actions'
import { signOut } from '@/lib/auth-client'
import { useRouter } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { SettingsUser } from './types'

export function DangerPane({ user }: { user: SettingsUser }) {
  const t = useTranslations('settings.danger')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function openDialog() {
    setCode('')
    setCodeError(null)
    setOpen(true)
    start(async () => {
      try {
        const res = await requestAccountDeletion()
        if (!res.ok) {
          toast.error(t('sendError'))
          setOpen(false)
        }
      } catch {
        toast.error(t('sendError'))
        setOpen(false)
      }
    })
  }

  function onConfirm() {
    start(async () => {
      setCodeError(null)
      try {
        const res = await confirmAccountDeletion(code)
        if (!res.ok) {
          setCodeError(t('invalidCode'))
          return
        }
        toast.success(t('deleted'))
        await signOut().catch(() => {})
        // Refresh the server tree so the header (which reads the server session)
        // drops the signed-in state — matches useSignOut.
        router.push('/')
        router.refresh()
      } catch {
        setCodeError(t('invalidCode'))
      }
    })
  }

  return (
    <section aria-labelledby="s-danger" className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
      <h2 id="s-danger" className="text-lg font-semibold text-destructive">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p>
      <ul className="my-4 list-disc pl-5 text-sm text-muted-foreground">
        <li>{t('item1')}</li>
        <li>{t('item2')}</li>
        <li>{t('item3')}</li>
      </ul>
      <Button type="button" variant="destructive" onClick={openDialog}>{t('deleteAction')}</Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('dialogBody', { email: user.email })}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-code">{t('codeLabel')}</Label>
            <InputOTP
              id="delete-code"
              maxLength={6}
              value={code}
              onChange={(v) => { setCode(v); setCodeError(null) }}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoComplete="one-time-code"
            >
              <InputOTPGroup data-invalid={!!codeError}>
                {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
              </InputOTPGroup>
            </InputOTP>
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>{t('cancel')}</Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending || code.length !== 6} className="disabled:pointer-events-auto disabled:cursor-not-allowed">{t('confirmDelete')}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
