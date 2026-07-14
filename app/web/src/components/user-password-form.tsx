'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { setUserPassword } from '@/lib/user-admin-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function UserPasswordForm({ userId }: { userId: string }) {
  const t = useTranslations('admin.users')
  const [password, setPassword] = useState('')
  const [pending, start] = useTransition()

  function onSave() {
    start(async () => {
      const res = await setUserPassword(userId, password)
      if (res.ok) { toast.success(t('saved')); setPassword('') }
      else toast.error(t('saveError'))
    })
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="new-password">{t('newPassword')}</Label>
      <div className="flex items-center gap-3">
        <Input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" onClick={onSave} disabled={pending || password.length < 8}>
          {t('setPassword')}
        </Button>
      </div>
    </div>
  )
}
