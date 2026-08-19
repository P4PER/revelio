'use client'
import { CircleUser, LogOut, Settings, Shield } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useSignOut } from './use-sign-out'
import type { AccountUser } from './types'

export function AccountMenu({
  isEditor,
  user,
}: {
  isEditor: boolean
  user: AccountUser | null
}) {
  const tAuth = useTranslations('auth')
  const tNav = useTranslations('nav')
  const signOut = useSignOut()
  if (!user) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">{tAuth('signIn')}</Link>
      </Button>
    )
  }
  const handle = user.displayUsername ?? user.username
  const name = handle ?? user.email
  const initial = name.charAt(0).toUpperCase()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={name} title={name}>
          <CircleUser className="size-5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-indigo text-sm font-semibold text-primary ring-1 ring-inset ring-primary/40"
          >
            {initial}
          </span>
          <div className="min-w-0">
            {handle && (
              <div className="truncate text-sm font-semibold">
                <span className="relative bottom-px text-primary-ink">@</span>
                {handle}
              </div>
            )}
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <DropdownMenuSeparator />
        {isEditor && (
          <DropdownMenuItem asChild>
            <Link href="/admin"><Shield />{tNav('admin')}</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings />{tNav('settings')}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
