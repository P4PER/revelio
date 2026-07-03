'use client'
import { ChevronDown } from 'lucide-react'
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

export function AccountMenu({ signInLabel, signOutLabel }: { signInLabel: string; signOutLabel: string }) {
  const { data } = useSession()
  if (!data?.user) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">{signInLabel}</Link>
      </Button>
    )
  }
  const name = data.user.displayUsername ?? data.user.username ?? data.user.email
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          {name}
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {data.user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOut()}
          className="text-destructive focus:text-destructive"
        >
          {signOutLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
