import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { getUserForAdmin, countUserDecks } from '@revelio/db'
import { UserRoleForm } from '@/components/user-role-form'
import { UserBanForm } from '@/components/user-ban-form'
import { UserPasswordForm } from '@/components/user-password-form'
import { DeleteUserButton } from '@/components/delete-user-button'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function EditUserPage(
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'admin')) notFound()

  const db = getDb()
  const user = await getUserForAdmin(db, id)
  if (!user) notFound()
  const deckCount = await countUserDecks(db, id)
  const isSelf = session!.user.id === user.id
  const t = await getTranslations('admin.users')

  const expiresIso = user.banExpires ? user.banExpires.toISOString().slice(0, 10) : null

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground">{t('identity')}</h2>
        <div className="rounded-lg border p-4">
          <div className="text-lg font-semibold">{user.name}</div>
          <div className="text-sm text-muted-foreground">
            {user.email}{user.emailVerified && <Badge variant="secondary" className="ml-2">{t('verified')}</Badge>}
          </div>
          {user.username && <div className="text-sm text-muted-foreground">@{user.username}</div>}
          <div className="mt-1 text-xs text-muted-foreground">
            {t('joined')}: {user.createdAt.toISOString().slice(0, 10)}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('roleSection')}</h2>
        <UserRoleForm userId={user.id} role={user.role} disabled={isSelf} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('banSection')}</h2>
        <UserBanForm
          userId={user.id}
          banned={user.banned}
          currentReason={user.banReason}
          currentExpires={expiresIso}
          disabled={isSelf}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('passwordSection')}</h2>
        <UserPasswordForm userId={user.id} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-destructive">{t('dangerSection')}</h2>
        <DeleteUserButton userId={user.id} deckCount={deckCount} isSelf={isSelf} />
      </section>
    </div>
  )
}
