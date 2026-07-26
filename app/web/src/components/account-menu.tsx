'use client'
import { CircleUser, LogOut, Shield } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/../i18n/navigation'
import { signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export type AccountUser = {
  email: string
  username?: string | null
  displayUsername?: string | null
}

export function AccountMenu({
  isEditor,
  user,
}: {
  isEditor: boolean
  user: AccountUser | null
}) {
  const tAuth = useTranslations('auth')
  const tNav = useTranslations('nav')
  const router = useRouter()
  if (!user) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">{tAuth('signIn')}</Link>
      </Button>
    )
  }
  const name = user.displayUsername ?? user.username ?? user.email
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={name} title={name}>
          <CircleUser className="size-5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isEditor && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin"><Shield />{tNav('admin')}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onSelect={() =>
            signOut({
              fetchOptions: {
                onSuccess: () => {
                  // Send the user home and re-render the server tree so the
                  // header reflects the signed-out state (no stale session).
                  router.push('/')
                  router.refresh()
                },
              },
            })
          }
          className="text-destructive focus:bg-destructive/20 focus:text-destructive"
        >
          <LogOut />
          {tAuth('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
