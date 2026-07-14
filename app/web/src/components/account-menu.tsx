'use client'
import { CircleUser, LogOut, Shield } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { useSession, signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export function AccountMenu({ isEditor }: { isEditor: boolean }) {
  const { data } = useSession()
  const tAuth = useTranslations('auth')
  const tNav = useTranslations('nav')
  if (!data?.user) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">{tAuth('signIn')}</Link>
      </Button>
    )
  }
  const name = data.user.displayUsername ?? data.user.username ?? data.user.email
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={name} title={name}>
          <CircleUser className="size-5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {data.user.email}
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
          onSelect={() => signOut()}
          className="text-destructive focus:bg-destructive/20 focus:text-destructive"
        >
          <LogOut />
          {tAuth('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
