'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { setUserRole } from '@/lib/user-admin-actions'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export function UserRoleForm(
  { userId, role, disabled }: { userId: string; role: string; disabled: boolean },
) {
  const t = useTranslations('admin.users')
  const [value, setValue] = useState(role)
  const [pending, start] = useTransition()

  function onSave() {
    start(async () => {
      const res = await setUserRole(userId, value)
      if (res.ok) toast.success(t('saved'))
      else toast.error(t(res.error === 'self' ? 'selfError' : res.error === 'last-admin' ? 'lastAdminError' : 'saveError'))
    })
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={value} onValueChange={setValue} disabled={disabled || pending}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="user">{t('roleUser')}</SelectItem>
          <SelectItem value="editor">{t('roleEditor')}</SelectItem>
          <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" onClick={onSave} disabled={disabled || pending || value === role}>
        {t('save')}
      </Button>
      {disabled && <span className="text-xs text-muted-foreground">{t('cannotSelf')}</span>}
    </div>
  )
}
