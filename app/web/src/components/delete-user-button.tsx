'use client'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { deleteUser } from '@/lib/user-admin-actions'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function DeleteUserButton(
  { userId, deckCount, isSelf }: { userId: string; deckCount: number; isSelf: boolean },
) {
  const t = useTranslations('admin.users')
  const router = useRouter()
  const [pending, start] = useTransition()

  function onConfirm() {
    start(async () => {
      const res = await deleteUser(userId)
      if (res.ok) {
        toast.success(t('saved'))
        router.push('/admin/users')
      } else {
        toast.error(t(res.error === 'self' ? 'selfError' : res.error === 'last-admin' ? 'lastAdminError' : 'saveError'))
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={isSelf || pending}>
          {t('deleteAction')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteConfirmBody', { decks: deckCount })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('deleteAction')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
