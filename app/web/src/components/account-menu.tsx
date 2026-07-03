'use client'
import { Link } from '@/../i18n/navigation'
import { useSession, signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export function AccountMenu({ signInLabel, signOutLabel }: { signInLabel: string; signOutLabel: string }) {
  const { data } = useSession()
  if (!data?.user) {
    return <Button variant="ghost" size="sm" asChild><Link href="/login">{signInLabel}</Link></Button>
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-medium">
        {data.user.displayUsername ?? data.user.username ?? data.user.email}
      </span>
      <Button variant="ghost" size="sm" onClick={() => signOut()}>{signOutLabel}</Button>
    </span>
  )
}
